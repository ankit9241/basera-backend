import { Router } from "express";
import { requireAdminAuth } from "../../middleware/auth";
import {
  getAdminProperties,
  getAdminPropertyDetail,
  verifyPropertyByAdmin,
} from "../../modules/properties/property.controller";
import { handleBulkImport } from "../../modules/bulk-import/bulk-import.controller";
import {
  getAdminVisitsQueue,
  updateAdminVisitStatus,
} from "../../modules/visits/visit.controller";
import prisma from "../../lib/prisma";

const router = Router();

router.get("/dashboard/metrics", requireAdminAuth("analytics.read"), async (_req, res, next) => {
  try {
    const [
      activeProperties,
      pendingVerification,
      pendingVisits,
      confirmedVisits,
      completedVisits,
      verifiedStudents,
    ] = await Promise.all([
      prisma.property.count({ where: { lifecycleStatus: "PUBLISHED" } }),
      prisma.property.count({ where: { isVerified: false, lifecycleStatus: { not: "ARCHIVED" } } }),
      prisma.visitBooking.count({ where: { status: "PENDING" } }),
      prisma.visitBooking.count({ where: { status: "CONFIRMED" } }),
      prisma.visitBooking.count({ where: { status: "COMPLETED" } }),
      prisma.user.count({ where: { isCollegeVerified: true } }),
    ]);

    res.status(200).json({
      success: true,
      metrics: {
        activeProperties,
        pendingVerification,
        pendingVisits,
        confirmedVisits,
        completedVisits,
        verifiedStudents,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get("/properties", requireAdminAuth("properties.read"), getAdminProperties);
router.get("/properties/:idOrCode", requireAdminAuth("properties.read"), getAdminPropertyDetail);
router.post("/properties/bulk-import", requireAdminAuth("properties.bulk_import"), handleBulkImport);
router.post("/properties/:id/verify", requireAdminAuth("properties.verify"), verifyPropertyByAdmin);

router.get("/visits", requireAdminAuth("visits.read"), getAdminVisitsQueue);
router.patch("/visits/:id/status", requireAdminAuth("visits.manage"), updateAdminVisitStatus);

router.get("/students", requireAdminAuth("students.read"), async (_req, res, next) => {
  try {
    const students = await prisma.user.findMany({
      include: {
        college: { select: { name: true, shortCode: true } },
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
});

export default router;
