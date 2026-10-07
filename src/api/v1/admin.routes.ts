import { Router } from "express";
import { requireAdminAuth } from "../../middleware/auth";
import {
  getAdminProperties,
  getAdminPropertyDetail,
  verifyPropertyByAdmin,
  updateAdminPropertyController,
} from "../../modules/properties/property.controller";
import { handleBulkImport, getBulkImportTemplate } from "../../modules/bulk-import/bulk-import.controller";
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

router.get("/properties/bulk-import/template", requireAdminAuth("properties.read"), getBulkImportTemplate);
router.get("/properties", requireAdminAuth("properties.read"), getAdminProperties);
router.get("/properties/:idOrCode", requireAdminAuth("properties.read"), getAdminPropertyDetail);
router.patch("/properties/:idOrCode", requireAdminAuth("properties.edit"), updateAdminPropertyController);
router.put("/properties/:idOrCode", requireAdminAuth("properties.edit"), updateAdminPropertyController);
router.post("/properties/bulk-import", requireAdminAuth("properties.bulk_import"), handleBulkImport);
router.post("/properties/:id/verify", requireAdminAuth("properties.verify"), verifyPropertyByAdmin);
router.patch("/properties/:id/verify", requireAdminAuth("properties.verify"), verifyPropertyByAdmin);

// Property Images Management (ImageKit / Abstracted Storage)
import { uploadImagesMiddleware } from "../../middleware/upload.middleware";
import {
  listPropertyImagesController,
  uploadPropertyImagesController,
  reorderPropertyImagesController,
  setPrimaryPropertyImageController,
  deletePropertyImageController,
  getImageKitAuthController,
} from "../../modules/properties/property-image.controller";

router.get("/properties/:idOrCode/images", requireAdminAuth("properties.read"), listPropertyImagesController);
router.post(
  "/properties/:idOrCode/images",
  requireAdminAuth("properties.edit"),
  uploadImagesMiddleware.any(),
  uploadPropertyImagesController
);
router.patch("/properties/:idOrCode/images/reorder", requireAdminAuth("properties.edit"), reorderPropertyImagesController);
router.put("/properties/:idOrCode/images/reorder", requireAdminAuth("properties.edit"), reorderPropertyImagesController);
router.patch("/properties/:idOrCode/images/:imageId/cover", requireAdminAuth("properties.edit"), setPrimaryPropertyImageController);
router.patch("/properties/:idOrCode/images/:imageId/primary", requireAdminAuth("properties.edit"), setPrimaryPropertyImageController);
router.delete("/properties/:idOrCode/images/:imageId", requireAdminAuth("properties.edit"), deletePropertyImageController);
router.get("/imagekit/auth", requireAdminAuth("properties.edit"), getImageKitAuthController);

router.get("/visits", requireAdminAuth("visits.read"), getAdminVisitsQueue);
router.patch("/visits/:id/status", requireAdminAuth("visits.manage"), updateAdminVisitStatus);

import {
  listAdminStudents,
  getAdminStudentDetail,
  updateAdminStudent,
  deleteAdminStudent,
} from "../../modules/admin/admin-student.controller";

router.get("/students", requireAdminAuth("students.read"), listAdminStudents);
router.get("/students/:id", requireAdminAuth("students.read"), getAdminStudentDetail);
router.patch("/students/:id", requireAdminAuth("students.manage"), updateAdminStudent);
router.put("/students/:id", requireAdminAuth("students.manage"), updateAdminStudent);
router.delete("/students/:id", requireAdminAuth("students.manage"), deleteAdminStudent);

import {
  registerAdminDevice,
  removeAdminDevice,
  getAdminNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
} from "../../modules/notifications/notification.controller";

router.post("/notifications/devices", requireAdminAuth(), registerAdminDevice);
router.delete("/notifications/devices/:idOrToken", requireAdminAuth(), removeAdminDevice);
router.get("/notifications", requireAdminAuth(), getAdminNotifications);
router.patch("/notifications/read-all", requireAdminAuth(), markAllNotificationsAsRead);
router.patch("/notifications/:id/read", requireAdminAuth(), markNotificationAsRead);

export default router;
