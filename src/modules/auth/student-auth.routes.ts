import { Router } from "express";
import {
  sendStudentOtp,
  verifyStudentOtp,
  sendStudentEmailOtp,
  verifyStudentEmailOtp,
  getStudentMe,
  logoutStudent,
} from "./student-auth.controller";
import { requireStudentAuth } from "../../middleware/auth";
import { rateLimiter } from "../../middleware/rate-limiter";

const router = Router();

router.post("/phone/send-otp", rateLimiter(15 * 60 * 1000, 3, "Too many OTP requests."), sendStudentOtp);
router.post("/phone/verify-otp", rateLimiter(15 * 60 * 1000, 10), verifyStudentOtp);

router.post("/email/send-otp", rateLimiter(15 * 60 * 1000, 5, "Too many verification requests."), sendStudentEmailOtp);
router.post("/email/verify-otp", rateLimiter(15 * 60 * 1000, 10), verifyStudentEmailOtp);

router.get("/me", requireStudentAuth, getStudentMe);
router.post("/logout", logoutStudent);

export default router;
