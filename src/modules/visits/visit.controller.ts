import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import prisma from "../../lib/prisma";
import { ApiError } from "../../middleware/error-handler";
import { logAudit } from "../../lib/audit";
import type { VisitStatus } from "@prisma/client";
import { NotificationService } from "../notifications/notification.service";

const bookVisitSchema = z.object({
  propertyId: z.string().min(1, "Property ID required"),
  visitDate: z.string().datetime("Valid ISO date required"),
  timeSlot: z.string().min(1, "Time slot required"),
  visitorCount: z.coerce.number().int().min(1).max(5).default(1),
  studentName: z.string().min(2),
  studentPhone: z.string().min(10),
  notes: z.string().optional(),
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

    const bookingCode = generateBookingCode();

    const visit = await prisma.visitBooking.create({
      data: {
        bookingCode,
        userId: user.id,
        propertyId: property.id,
        visitDate: new Date(data.visitDate),
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

    console.log(`\n📅 [Visit Booking Confirmed] Code: ${bookingCode}`);
    console.log(`👤 Student: ${data.studentName} (${data.studentPhone})`);
    console.log(`🏠 Property: ${property.publicName} [${property.propertyCode}]`);
    console.log(`⏰ Slot: ${data.timeSlot} on ${new Date(data.visitDate).toDateString()}\n`);

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
    });

    if (!visit) throw new ApiError(404, "Visit not found");

    if (visit.status === "COMPLETED" || visit.status === "CANCELLED") {
      throw new ApiError(400, `Cannot cancel visit that is already ${visit.status.toLowerCase()}.`);
    }

    const updated = await prisma.visitBooking.update({
      where: { id: visit.id },
      data: {
        status: "CANCELLED",
        cancellationReason: reason || "Cancelled by student",
      },
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

export async function getAdminVisitsQueue(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { status, q } = req.query;

    const visits = await prisma.visitBooking.findMany({
      where: {
        ...(status ? { status: status as VisitStatus } : {}),
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
      },
      orderBy: { visitDate: "asc" },
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
    const { status, coordinatorNotes } = req.body;

    const visit = await prisma.visitBooking.findUnique({ where: { id } });
    if (!visit) throw new ApiError(404, "Visit record not found");

    const updated = await prisma.visitBooking.update({
      where: { id },
      data: {
        ...(status ? { status: status as VisitStatus } : {}),
        ...(coordinatorNotes ? { coordinatorNotes } : {}),
      },
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
