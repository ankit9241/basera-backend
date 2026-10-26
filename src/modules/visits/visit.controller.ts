import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import prisma from "../../lib/prisma";
import { ApiError } from "../../middleware/error-handler";
import { logAudit } from "../../lib/audit";
import type { VisitStatus } from "@prisma/client";
import { NotificationService } from "../notifications/notification.service";
import { formatISTDate } from "../../utils/date";

const bookVisitSchema = z.object({
  propertyId: z.string().min(1, "Property ID required"),
  visitDate: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: "Valid date required",
  }),
  timeSlot: z.string().min(1, "Time slot required"),
  visitorCount: z.coerce.number().int().min(1).max(5).default(1),
  studentName: z.string().min(2),
  studentPhone: z.string().min(10),
  notes: z.string().optional(),
});

const rescheduleVisitSchema = z.object({
  visitDate: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: "Valid date required",
  }),
  timeSlot: z.string().min(1, "Time slot required"),
  visitorCount: z.coerce.number().int().min(1).max(5).optional(),
  notes: z.string().optional(),
});

const adminAcceptVisitSchema = z.object({
  coordinatorId: z.string().optional(),
  coordinatorNotes: z.string().optional(),
});

const adminRejectVisitSchema = z.object({
  reason: z.string().trim().min(3, "Rejection reason is required (min 3 characters)"),
  coordinatorNotes: z.string().optional(),
});

const adminRescheduleVisitSchema = z.object({
  visitDate: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: "Valid date required",
  }),
  timeSlot: z.string().trim().min(1, "Time slot required"),
  reason: z.string().trim().min(3, "Reschedule reason is required (min 3 characters)"),
  coordinatorNotes: z.string().optional(),
});

const adminUpdateStatusSchema = z.object({
  status: z.enum(["PENDING", "CONFIRMED", "IN_PROGRESS", "COMPLETED", "CANCELLED", "REJECTED", "RESCHEDULED"] as const),
  coordinatorId: z.string().optional(),
  coordinatorNotes: z.string().optional(),
  reason: z.string().optional(),
  visitDate: z.string().optional(),
  timeSlot: z.string().optional(),
});

function generateBookingCode(): string {
  const num = Math.floor(1000 + Math.random() * 9000);
  return `BAS-${num}`;
}

export async function bookStudentVisit(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const user = req.user!;
    const data = bookVisitSchema.parse(req.body);

    const property = await prisma.property.findUnique({
      where: { id: data.propertyId },
    });

    if (!property || property.lifecycleStatus !== "PUBLISHED") {
      throw new ApiError(404, "Selected property is not available for guided visits.");
    }

    // Atomic transaction with advisory lock to strictly enforce ONE ACTIVE VISIT PER PROPERTY
    const visit = await prisma.$transaction(async (tx) => {
      // Lock on (user.id, property.id)
      await tx.$executeRawUnsafe(
        "SELECT pg_advisory_xact_lock(hashtext($1))",
        `visit_lock:${user.id}:${property.id}`
      );

      // Check existing active visit
      const existing = await tx.visitBooking.findFirst({
        where: {
          userId: user.id,
          propertyId: property.id,
          status: { in: ["PENDING", "CONFIRMED", "IN_PROGRESS", "RESCHEDULED"] },
        },
        include: {
          property: {
            select: {
              id: true,
              propertyCode: true,
              publicName: true,
              localityZone: true,
              rentMin: true,
              media: { take: 1, select: { mediaUrl: true } },
            },
          },
        },
      });

      if (existing) {
        throw new ApiError(
          409,
          "You already have an active scheduled visit for this property. You can reschedule your existing appointment instead of booking a duplicate.",
          {
            code: "ACTIVE_VISIT_EXISTS",
            existingVisit: {
              id: existing.id,
              bookingCode: existing.bookingCode,
              visitDate: existing.visitDate,
              timeSlot: existing.timeSlot,
              visitorCount: existing.visitorCount,
              status: existing.status,
              property: {
                id: existing.property.id,
                propertyCode: existing.property.propertyCode,
                publicName: existing.property.publicName,
                localityZone: existing.property.localityZone,
                image: existing.property.media[0]?.mediaUrl || null,
              },
            },
          }
        );
      }

      const bookingCode = generateBookingCode();
      const parsedDate = new Date(data.visitDate);

      const created = await tx.visitBooking.create({
        data: {
          bookingCode,
          userId: user.id,
          propertyId: property.id,
          visitDate: parsedDate,
          timeSlot: data.timeSlot,
          visitorCount: data.visitorCount,
          studentName: data.studentName,
          studentPhone: data.studentPhone,
          notes: data.notes,
          status: "PENDING",
        },
        include: {
          property: {
            select: {
              id: true,
              propertyCode: true,
              publicName: true,
              localityZone: true,
              media: { take: 1, select: { mediaUrl: true } },
            },
          },
        },
      });

      // Persist initial visit history
      await tx.visitHistory.create({
        data: {
          visitId: created.id,
          actorType: "STUDENT",
          actorId: user.id,
          action: "CREATED",
          fromStatus: null,
          toStatus: "PENDING",
          notes: data.notes || null,
          scheduledDate: parsedDate,
          timeSlot: data.timeSlot,
        },
      });

      return created;
    }, { timeout: 15000, maxWait: 10000 });

    console.log(`\n📅 [Visit Booking Confirmed] Code: ${visit.bookingCode}`);
    console.log(`👤 Student: ${data.studentName} (${data.studentPhone})`);
    console.log(`🏠 Property: ${property.publicName} [${property.propertyCode}]`);
    console.log(`⏰ Slot: ${data.timeSlot} on ${formatISTDate(visit.visitDate)}\n`);

    NotificationService.notifyNewVisit(visit).catch((err) => {
      console.error("[NOTIFICATION_DISPATCH_ERROR]", err);
    });

    res.status(201).json({
      success: true,
      message: "Guided visit scheduled successfully. A Basera coordinator will call you shortly.",
      visit: {
        id: visit.id,
        bookingCode: visit.bookingCode,
        visitDate: visit.visitDate,
        timeSlot: visit.timeSlot,
        visitorCount: visit.visitorCount,
        status: visit.status,
        property: {
          id: visit.property.id,
          propertyCode: visit.property.propertyCode,
          publicName: visit.property.publicName,
          localityZone: visit.property.localityZone,
          image: visit.property.media[0]?.mediaUrl || null,
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function rescheduleStudentVisit(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const user = req.user!;
    const paramVal = req.params.id;
    const id = Array.isArray(paramVal) ? paramVal[0] : paramVal;
    if (!id) throw new ApiError(400, "Visit ID required");

    const data = rescheduleVisitSchema.parse(req.body);

    const visit = await prisma.visitBooking.findFirst({
      where: { id, userId: user.id },
      include: {
        property: {
          select: {
            id: true,
            propertyCode: true,
            publicName: true,
            localityZone: true,
          },
        },
      },
    });

    if (!visit) throw new ApiError(404, "Visit not found");

    if (visit.status === "COMPLETED" || visit.status === "CANCELLED" || visit.status === "REJECTED") {
      throw new ApiError(
        400,
        `Cannot reschedule a visit that is already ${visit.status.toLowerCase()}. Please schedule a new visit.`
      );
    }

    const newDate = new Date(data.visitDate);

    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.visitBooking.update({
        where: { id: visit.id },
        data: {
          visitDate: newDate,
          timeSlot: data.timeSlot,
          status: visit.status === "REJECTED" ? "PENDING" : visit.status,
          ...(data.visitorCount ? { visitorCount: data.visitorCount } : {}),
          ...(data.notes !== undefined ? { notes: data.notes } : {}),
        },
        include: {
          property: {
            select: {
              id: true,
              propertyCode: true,
              publicName: true,
              localityZone: true,
              media: { take: 1, select: { mediaUrl: true } },
            },
          },
        },
      });

      await tx.visitHistory.create({
        data: {
          visitId: visit.id,
          actorType: "STUDENT",
          actorId: user.id,
          action: "RESCHEDULED",
          fromStatus: visit.status,
          toStatus: u.status,
          reason: data.notes || "Rescheduled by student from portal",
          scheduledDate: newDate,
          timeSlot: data.timeSlot,
        },
      });

      return u;
    });

    console.log(`\n🔄 [Visit Rescheduled by Student] Code: ${updated.bookingCode}`);
    console.log(`📅 New Slot: ${updated.timeSlot} on ${formatISTDate(updated.visitDate)}\n`);

    NotificationService.notifyRescheduledVisit(updated).catch((err) => {
      console.error("[NOTIFICATION_RESCHEDULE_ERROR]", err);
    });

    res.status(200).json({
      success: true,
      message: "Visit rescheduled successfully.",
      visit: {
        id: updated.id,
        bookingCode: updated.bookingCode,
        visitDate: updated.visitDate,
        timeSlot: updated.timeSlot,
        visitorCount: updated.visitorCount,
        status: updated.status,
        property: {
          id: updated.property.id,
          propertyCode: updated.property.propertyCode,
          publicName: updated.property.publicName,
          localityZone: updated.property.localityZone,
          image: updated.property.media[0]?.mediaUrl || null,
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function cancelStudentVisit(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const user = req.user!;
    const paramVal = req.params.id;
    const id = Array.isArray(paramVal) ? paramVal[0] : paramVal;
    if (!id) throw new ApiError(400, "Visit ID required");
    const { reason } = req.body;

    const visit = await prisma.visitBooking.findFirst({
      where: { id, userId: user.id },
      include: {
        property: {
          select: {
            id: true,
            propertyCode: true,
            publicName: true,
          },
        },
      },
    });

    if (!visit) throw new ApiError(404, "Visit not found");

    if (visit.status === "COMPLETED" || visit.status === "CANCELLED") {
      throw new ApiError(400, `Cannot cancel visit that is already ${visit.status.toLowerCase()}.`);
    }

    const cancelReason = reason || "Cancelled by student from dashboard";

    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.visitBooking.update({
        where: { id: visit.id },
        data: {
          status: "CANCELLED",
          decisionReason: cancelReason,
          cancellationReason: cancelReason,
        },
      });

      await tx.visitHistory.create({
        data: {
          visitId: visit.id,
          actorType: "STUDENT",
          actorId: user.id,
          action: "CANCELLED",
          fromStatus: visit.status,
          toStatus: "CANCELLED",
          reason: cancelReason,
        },
      });

      return u;
    });

    res.status(200).json({
      success: true,
      message: "Visit cancelled successfully.",
      status: updated.status,
    });
  } catch (error) {
    next(error);
  }
}

export async function getStudentVisits(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const user = req.user!;
    const { status } = req.query;

    const visits = await prisma.visitBooking.findMany({
      where: {
        userId: user.id,
        ...(status ? { status: status as VisitStatus } : {}),
      },
      include: {
        property: {
          select: {
            id: true,
            propertyCode: true,
            publicName: true,
            localityZone: true,
            rentMin: true,
            media: { take: 1, select: { mediaUrl: true } },
          },
        },
        coordinator: {
          select: {
            id: true,
            fullName: true,
            phone: true,
          },
        },
        history: {
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: { visitDate: "desc" },
    });

    res.status(200).json({
      success: true,
      visits: visits.map((v) => ({
        id: v.id,
        bookingCode: v.bookingCode,
        visitDate: v.visitDate,
        timeSlot: v.timeSlot,
        visitorCount: v.visitorCount,
        status: v.status,
        notes: v.notes,
        decisionReason: v.decisionReason || v.cancellationReason || null,
        coordinator: v.coordinator,
        history: v.history,
        createdAt: v.createdAt,
        updatedAt: v.updatedAt,
        property: {
          id: v.property.id,
          propertyCode: v.property.propertyCode,
          publicName: v.property.publicName,
          localityZone: v.property.localityZone,
          rentMin: v.property.rentMin,
          image: v.property.media[0]?.mediaUrl || null,
        },
      })),
    });
  } catch (error) {
    next(error);
  }
}

export async function getAdminVisitsQueue(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { status, q } = req.query;

    const visits = await prisma.visitBooking.findMany({
      where: {
        ...(status && status !== "ALL" ? { status: status as VisitStatus } : {}),
        ...(q
          ? {
              OR: [
                { studentName: { contains: String(q), mode: "insensitive" } },
                { studentPhone: { contains: String(q), mode: "insensitive" } },
                { bookingCode: { contains: String(q), mode: "insensitive" } },
                { property: { propertyCode: { contains: String(q), mode: "insensitive" } } },
              ],
            }
          : {}),
      },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            phone: true,
            collegeEmail: true,
            isCollegeVerified: true,
            college: { select: { name: true } },
          },
        },
        property: {
          select: {
            id: true,
            propertyCode: true,
            publicName: true,
            localityZone: true,
            exactAddress: true,
            ownerName: true,
            ownerPhone: true,
          },
        },
        coordinator: {
          select: { id: true, fullName: true, phone: true },
        },
        history: {
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: [
        { createdAt: "desc" },
        { visitDate: "desc" },
      ],
    });

    res.status(200).json({
      success: true,
      total: visits.length,
      visits,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Admin Accept Visit
 */
export async function acceptAdminVisit(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const admin = req.admin!;
    const paramVal = req.params.id;
    const id = Array.isArray(paramVal) ? paramVal[0] : paramVal;
    if (!id) throw new ApiError(400, "Visit ID required");

    const data = adminAcceptVisitSchema.parse(req.body);

    const visit = await prisma.visitBooking.findUnique({
      where: { id },
      include: {
        property: {
          select: {
            id: true,
            propertyCode: true,
            publicName: true,
            localityZone: true,
          },
        },
        coordinator: {
          select: {
            id: true,
            fullName: true,
            phone: true,
          },
        },
      },
    });

    if (!visit) throw new ApiError(404, "Visit record not found");

    // Idempotent: if already CONFIRMED
    if (visit.status === "CONFIRMED") {
      res.status(200).json({
        success: true,
        message: `Visit ${visit.bookingCode} is already confirmed.`,
        visit,
      });
      return;
    }

    if (visit.status === "COMPLETED" || visit.status === "CANCELLED" || visit.status === "REJECTED") {
      throw new ApiError(
        400,
        `Cannot accept visit in '${visit.status}' state. Only PENDING or RESCHEDULED visits can be accepted.`
      );
    }

    const assignedCoordinatorId = data.coordinatorId || admin.id;

    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.visitBooking.update({
        where: { id },
        data: {
          status: "CONFIRMED",
          coordinatorId: assignedCoordinatorId,
          ...(data.coordinatorNotes ? { coordinatorNotes: data.coordinatorNotes } : {}),
        },
        include: {
          property: {
            select: {
              id: true,
              propertyCode: true,
              publicName: true,
              localityZone: true,
            },
          },
          coordinator: {
            select: {
              id: true,
              fullName: true,
              phone: true,
            },
          },
          history: {
            orderBy: { createdAt: "desc" },
          },
        },
      });

      await tx.visitHistory.create({
        data: {
          visitId: id,
          actorType: "ADMIN",
          actorId: admin.id,
          action: "CONFIRMED",
          fromStatus: visit.status,
          toStatus: "CONFIRMED",
          notes: data.coordinatorNotes || "Confirmed by coordinator",
        },
      });

      return u;
    });

    await logAudit({
      actorId: admin.id,
      action: "VISIT_ACCEPTED",
      targetEntity: "VisitBooking",
      targetId: updated.id,
      details: {
        previousStatus: visit.status,
        newStatus: "CONFIRMED",
        coordinatorId: assignedCoordinatorId,
      },
    });

    // Notify student (failsafe, non-blocking)
    try {
      await NotificationService.notifyStudentVisitAccepted({
        id: updated.id,
        userId: updated.userId,
        bookingCode: updated.bookingCode,
        timeSlot: updated.timeSlot,
        visitDate: updated.visitDate,
        property: updated.property,
        coordinator: updated.coordinator,
      });
    } catch (err) {
      console.error("[NOTIFY_STUDENT_ACCEPT_ERROR]", err);
    }

    res.status(200).json({
      success: true,
      message: `Visit ${updated.bookingCode} accepted and confirmed.`,
      visit: updated,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Admin Reject Visit (Requires non-empty reason)
 */
export async function rejectAdminVisit(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const admin = req.admin!;
    const paramVal = req.params.id;
    const id = Array.isArray(paramVal) ? paramVal[0] : paramVal;
    if (!id) throw new ApiError(400, "Visit ID required");

    const data = adminRejectVisitSchema.parse(req.body);

    const visit = await prisma.visitBooking.findUnique({
      where: { id },
      include: {
        property: {
          select: {
            id: true,
            propertyCode: true,
            publicName: true,
          },
        },
      },
    });

    if (!visit) throw new ApiError(404, "Visit record not found");

    // Idempotent: if already REJECTED
    if (visit.status === "REJECTED") {
      res.status(200).json({
        success: true,
        message: `Visit ${visit.bookingCode} is already rejected.`,
        visit,
      });
      return;
    }

    if (visit.status === "COMPLETED" || visit.status === "CANCELLED") {
      throw new ApiError(
        400,
        `Cannot reject visit that is already ${visit.status.toLowerCase()}.`
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.visitBooking.update({
        where: { id },
        data: {
          status: "REJECTED",
          decisionReason: data.reason,
          ...(data.coordinatorNotes ? { coordinatorNotes: data.coordinatorNotes } : {}),
        },
        include: {
          property: {
            select: {
              id: true,
              propertyCode: true,
              publicName: true,
            },
          },
          history: {
            orderBy: { createdAt: "desc" },
          },
        },
      });

      await tx.visitHistory.create({
        data: {
          visitId: id,
          actorType: "ADMIN",
          actorId: admin.id,
          action: "REJECTED",
          fromStatus: visit.status,
          toStatus: "REJECTED",
          reason: data.reason,
          notes: data.coordinatorNotes || null,
        },
      });

      return u;
    });

    await logAudit({
      actorId: admin.id,
      action: "VISIT_REJECTED",
      targetEntity: "VisitBooking",
      targetId: updated.id,
      details: {
        previousStatus: visit.status,
        newStatus: "REJECTED",
        reason: data.reason,
      },
    });

    // Notify student with mandatory reason
    try {
      await NotificationService.notifyStudentVisitRejected({
        id: updated.id,
        userId: updated.userId,
        bookingCode: updated.bookingCode,
        property: updated.property,
        reason: data.reason,
      });
    } catch (err) {
      console.error("[NOTIFY_STUDENT_REJECT_ERROR]", err);
    }

    res.status(200).json({
      success: true,
      message: `Visit ${updated.bookingCode} has been declined.`,
      visit: updated,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Admin Reschedule Visit (Requires new date, time slot, and non-empty reason)
 */
export async function rescheduleAdminVisit(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const admin = req.admin!;
    const paramVal = req.params.id;
    const id = Array.isArray(paramVal) ? paramVal[0] : paramVal;
    if (!id) throw new ApiError(400, "Visit ID required");

    const data = adminRescheduleVisitSchema.parse(req.body);

    const visit = await prisma.visitBooking.findUnique({
      where: { id },
      include: {
        property: {
          select: {
            id: true,
            propertyCode: true,
            publicName: true,
          },
        },
      },
    });

    if (!visit) throw new ApiError(404, "Visit record not found");

    if (visit.status === "COMPLETED" || visit.status === "CANCELLED" || visit.status === "REJECTED") {
      throw new ApiError(
        400,
        `Cannot reschedule visit that is ${visit.status.toLowerCase()}.`
      );
    }

    const newDate = new Date(data.visitDate);
    const previousDate = visit.visitDate;
    const previousSlot = visit.timeSlot;

    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.visitBooking.update({
        where: { id },
        data: {
          visitDate: newDate,
          timeSlot: data.timeSlot,
          status: "RESCHEDULED",
          decisionReason: data.reason,
          coordinatorId: admin.id,
          ...(data.coordinatorNotes ? { coordinatorNotes: data.coordinatorNotes } : {}),
        },
        include: {
          property: {
            select: {
              id: true,
              propertyCode: true,
              publicName: true,
            },
          },
          coordinator: {
            select: {
              id: true,
              fullName: true,
              phone: true,
            },
          },
          history: {
            orderBy: { createdAt: "desc" },
          },
        },
      });

      await tx.visitHistory.create({
        data: {
          visitId: id,
          actorType: "ADMIN",
          actorId: admin.id,
          action: "RESCHEDULED",
          fromStatus: visit.status,
          toStatus: "RESCHEDULED",
          reason: data.reason,
          scheduledDate: newDate,
          timeSlot: data.timeSlot,
          notes: data.coordinatorNotes || null,
        },
      });

      return u;
    });

    await logAudit({
      actorId: admin.id,
      action: "VISIT_RESCHEDULED",
      targetEntity: "VisitBooking",
      targetId: updated.id,
      details: {
        previousDate,
        previousSlot,
        newDate,
        newSlot: data.timeSlot,
        reason: data.reason,
      },
    });

    // Notify student with new date/time and reason
    try {
      await NotificationService.notifyStudentVisitRescheduled({
        id: updated.id,
        userId: updated.userId,
        bookingCode: updated.bookingCode,
        timeSlot: updated.timeSlot,
        visitDate: updated.visitDate,
        property: updated.property,
        reason: data.reason,
        previousSlot,
        previousDate,
      });
    } catch (err) {
      console.error("[NOTIFY_STUDENT_RESCHEDULE_ERROR]", err);
    }

    res.status(200).json({
      success: true,
      message: `Visit ${updated.bookingCode} rescheduled to ${data.timeSlot} on ${formatISTDate(newDate)}.`,
      visit: updated,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * General Admin Update Visit Status (supports legacy & general transitions)
 */
export async function updateAdminVisitStatus(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const admin = req.admin!;
    const paramVal = req.params.id;
    const id = Array.isArray(paramVal) ? paramVal[0] : paramVal;
    if (!id) throw new ApiError(400, "Visit ID required");

    const data = adminUpdateStatusSchema.parse(req.body);

    const visit = await prisma.visitBooking.findUnique({
      where: { id },
      include: {
        property: {
          select: {
            id: true,
            propertyCode: true,
            publicName: true,
          },
        },
        coordinator: {
          select: {
            id: true,
            fullName: true,
            phone: true,
          },
        },
      },
    });

    if (!visit) throw new ApiError(404, "Visit record not found");

    // Route to specialized handlers if matching
    if (data.status === "CONFIRMED") {
      return acceptAdminVisit(req, res, next);
    }
    if (data.status === "REJECTED") {
      return rejectAdminVisit(req, res, next);
    }
    if (data.status === "RESCHEDULED" && data.visitDate && data.timeSlot) {
      return rescheduleAdminVisit(req, res, next);
    }

    // Terminal states check
    if (visit.status === "COMPLETED" && data.status !== "COMPLETED") {
      throw new ApiError(400, "Cannot change status of a completed visit.");
    }
    if (visit.status === "CANCELLED" && data.status !== "CANCELLED") {
      throw new ApiError(400, "Cannot change status of a cancelled visit.");
    }

    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.visitBooking.update({
        where: { id },
        data: {
          status: data.status,
          ...(data.coordinatorId ? { coordinatorId: data.coordinatorId } : {}),
          ...(data.coordinatorNotes ? { coordinatorNotes: data.coordinatorNotes } : {}),
          ...(data.reason ? { decisionReason: data.reason } : {}),
        },
        include: {
          property: {
            select: {
              id: true,
              propertyCode: true,
              publicName: true,
            },
          },
          coordinator: {
            select: {
              id: true,
              fullName: true,
              phone: true,
            },
          },
          history: {
            orderBy: { createdAt: "desc" },
          },
        },
      });

      await tx.visitHistory.create({
        data: {
          visitId: id,
          actorType: "ADMIN",
          actorId: admin.id,
          action: data.status,
          fromStatus: visit.status,
          toStatus: data.status,
          reason: data.reason || null,
          notes: data.coordinatorNotes || null,
        },
      });

      return u;
    });

    await logAudit({
      actorId: admin.id,
      action: "VISIT_STATUS_CHANGED",
      targetEntity: "VisitBooking",
      targetId: updated.id,
      details: {
        previousStatus: visit.status,
        newStatus: updated.status,
      },
    });

    res.status(200).json({
      success: true,
      message: `Visit ${updated.bookingCode} updated to ${updated.status}`,
      visit: updated,
    });
  } catch (error) {
    next(error);
  }
}
