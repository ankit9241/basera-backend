import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import prisma from "../../lib/prisma";
import { ApiError } from "../../middleware/error-handler";
import { logAudit } from "../../lib/audit";

const updateStudentSchema = z.object({
  fullName: z.string().min(1, "Full name cannot be empty").optional(),
  collegeEmail: z.string().email("Valid email required").optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
  collegeId: z.string().optional().or(z.literal("")),
  studyYear: z.string().optional().or(z.literal("")),
  isCollegeVerified: z.boolean().optional(),
  gender: z.string().optional().or(z.literal("")),
  budgetRange: z.string().optional().or(z.literal("")),
});

export async function listAdminStudents(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { search, collegeId, verified } = req.query;

    const where: any = {};

    if (search && typeof search === "string" && search.trim()) {
      const q = search.trim();
      where.OR = [
        { fullName: { contains: q, mode: "insensitive" } },
        { collegeEmail: { contains: q, mode: "insensitive" } },
        { phone: { contains: q, mode: "insensitive" } },
      ];
    }

    if (collegeId && typeof collegeId === "string" && collegeId !== "all") {
      where.collegeId = collegeId;
    }

    if (verified !== undefined && verified !== "all") {
      where.isCollegeVerified = verified === "true";
    }

    const students = await prisma.user.findMany({
      where,
      include: {
        college: { select: { id: true, name: true, shortCode: true, campusZone: true } },
        _count: { select: { visits: true, savedListings: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    res.status(200).json({
      success: true,
      total: students.length,
      students,
    });
  } catch (error) {
    next(error);
  }
}

export async function getAdminStudentDetail(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = req.params.id as string;

    const student = await prisma.user.findUnique({
      where: { id },
      include: {
        college: true,
        visits: {
          include: {
            property: {
              select: { id: true, propertyCode: true, publicName: true, localityZone: true },
            },
          },
          orderBy: { createdAt: "desc" },
        },
        savedListings: {
          include: {
            property: {
              select: { id: true, propertyCode: true, publicName: true, localityZone: true, rentMin: true },
            },
          },
        },
      },
    });

    if (!student) {
      throw new ApiError(404, "Student record not found.");
    }

    res.status(200).json({
      success: true,
      student,
    });
  } catch (error) {
    next(error);
  }
}

export async function updateAdminStudent(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = req.params.id as string;
    const admin = req.admin!;
    const body = updateStudentSchema.parse(req.body);

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) {
      throw new ApiError(404, "Student record not found.");
    }

    const data: any = {};
    if (body.fullName !== undefined) data.fullName = body.fullName.trim();
    if (body.collegeEmail !== undefined) data.collegeEmail = body.collegeEmail ? body.collegeEmail.trim().toLowerCase() : null;
    if (body.phone !== undefined) data.phone = body.phone ? body.phone.trim() : null;
    if (body.collegeId !== undefined) data.collegeId = body.collegeId || null;
    if (body.studyYear !== undefined) data.studyYear = body.studyYear || null;
    if (body.gender !== undefined) data.gender = body.gender || null;
    if (body.budgetRange !== undefined) data.budgetRange = body.budgetRange || null;
    if (body.isCollegeVerified !== undefined) {
      data.isCollegeVerified = body.isCollegeVerified;
      data.collegeVerifiedAt = body.isCollegeVerified ? existing.collegeVerifiedAt || new Date() : null;
    }

    const updated = await prisma.user.update({
      where: { id },
      data,
      include: {
        college: { select: { id: true, name: true, shortCode: true, campusZone: true } },
        _count: { select: { visits: true, savedListings: true } },
      },
    });

    await logAudit({
      actorId: admin.id,
      action: "ADMIN_STUDENT_UPDATED",
      targetEntity: "User",
      targetId: id,
      details: {
        updatedFields: Object.keys(data),
        adminEmail: admin.email,
      },
    });

    res.status(200).json({
      success: true,
      message: "Student record updated successfully.",
      student: updated,
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteAdminStudent(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = req.params.id as string;
    const admin = req.admin!;

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) {
      throw new ApiError(404, "Student record not found.");
    }

    await prisma.$transaction([
      prisma.visitBooking.deleteMany({ where: { userId: id } }),
      prisma.savedListing.deleteMany({ where: { userId: id } }),
      prisma.propertyReview.deleteMany({ where: { userId: id } }),
      prisma.emailVerificationToken.deleteMany({ where: { userId: id } }),
      prisma.user.delete({ where: { id } }),
    ]);

    await logAudit({
      actorId: admin.id,
      action: "ADMIN_STUDENT_DELETED",
      targetEntity: "User",
      targetId: id,
      details: {
        deletedStudentName: existing.fullName,
        deletedStudentEmail: existing.collegeEmail,
        deletedByAdmin: admin.email,
      },
    });

    res.status(200).json({
      success: true,
      message: `Student '${existing.fullName}' deleted successfully.`,
    });
  } catch (error) {
    next(error);
  }
}
