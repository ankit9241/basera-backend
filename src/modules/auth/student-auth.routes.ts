import { Router } from "express";
import {
  googleStudentAuth,
  getStudentMe,
  logoutStudent,
} from "./student-auth.controller";
import { requireStudentAuth } from "../../middleware/auth";
import { rateLimiter } from "../../middleware/rate-limiter";

const router = Router();

// Primary student authentication via Google OAuth
router.post("/google", rateLimiter(15 * 60 * 1000, 15), googleStudentAuth);

// Authenticated student session management
router.get("/me", requireStudentAuth, getStudentMe);
router.post("/logout", logoutStudent);

export default router;
