import { Router } from "express";
import { requireStudentAuth } from "../../middleware/auth";
import {
  getStudentProfile,
  updateStudentProfile,
  getStudentSavedListings,
  toggleSavedListing,
  mergeSavedListings,
} from "../../modules/student/student-profile.controller";
import {
  bookStudentVisit,
  getStudentVisits,
  rescheduleStudentVisit,
  cancelStudentVisit,
} from "../../modules/visits/visit.controller";

const router = Router();

router.use(requireStudentAuth);

router.get("/profile", getStudentProfile);
router.patch("/profile", updateStudentProfile);

router.get("/saved", getStudentSavedListings);
router.post("/saved/toggle", toggleSavedListing);
router.post("/saved/merge", mergeSavedListings);

router.get("/visits", getStudentVisits);
router.post("/visits", bookStudentVisit);
router.patch("/visits/:id/reschedule", rescheduleStudentVisit);
router.patch("/visits/:id", rescheduleStudentVisit);
router.patch("/visits/:id/cancel", cancelStudentVisit);

export default router;
