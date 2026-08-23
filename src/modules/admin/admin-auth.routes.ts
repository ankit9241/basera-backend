import { Router } from "express";
import { adminLogin, getAdminMe, logoutAdmin } from "./admin-auth.controller";
import { requireAdminAuth } from "../../middleware/auth";
import { rateLimiter } from "../../middleware/rate-limiter";

const router = Router();

router.post("/login", rateLimiter(15 * 60 * 1000, 5, "Too many failed login attempts."), adminLogin);

router.get("/me", requireAdminAuth(), getAdminMe);

router.post("/logout", requireAdminAuth(), logoutAdmin);

export default router;
