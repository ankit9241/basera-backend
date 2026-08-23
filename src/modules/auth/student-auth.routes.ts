import { Router } from "express";
import {
  sendStudentOtp,
  verifyStudentOtp,
  getStudentMe,
  logoutStudent,
} from "./student-auth.controller";
import { requireStudentAuth } from "../../middleware/auth";
import { rateLimiter } from "../../middleware/rate-limiter";

const router = Router();

router.post("/phone/send-otp", rateLimiter(15 * 60 * 1000, 3, "Too many OTP requests."), sendStudentOtp);

router.post("/phone/verify-otp", rateLimiter(15 * 60 * 1000, 10), verifyStudentOtp);

router.get("/me", requireStudentAuth, getStudentMe);

router.post("/logout", logoutStudent);

export default router;
