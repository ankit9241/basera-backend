import { Router } from "express";
import {
  requestCollegeVerification,
  confirmCollegeVerification,
  getWhitelistedDomains,
  verifyCollegeEmailWithOtp,
} from "./college-verification.controller";
import { requireStudentAuth } from "../../middleware/auth";
import { rateLimiter } from "../../middleware/rate-limiter";

const router = Router();

router.get("/domains", getWhitelistedDomains);

router.post(
  "/request",
  requireStudentAuth,
  rateLimiter(15 * 60 * 1000, 3, "Too many verification requests."),
  requestCollegeVerification
);

router.post(
  "/verify-otp",
  requireStudentAuth,
  rateLimiter(15 * 60 * 1000, 10, "Too many attempts."),
  verifyCollegeEmailWithOtp
);

router.get("/confirm", confirmCollegeVerification);

export default router;
