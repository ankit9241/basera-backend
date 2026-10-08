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

import {
  getStudentPropertyReview,
  createStudentReview,
  updateStudentReview,
  deleteStudentReview,
} from "../../modules/reviews/review.controller";

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

// Student Review Lifecycle
router.get("/properties/:propertyId/review", getStudentPropertyReview);
router.post("/properties/:propertyId/reviews", createStudentReview);
router.patch("/reviews/:id", updateStudentReview);
router.delete("/reviews/:id", deleteStudentReview);

export default router;
