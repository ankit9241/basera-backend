import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import { errorHandler, ApiError } from "./middleware/error-handler";
import studentAuthRoutes from "./modules/auth/student-auth.routes";
import adminAuthRoutes from "./modules/admin/admin-auth.routes";
import collegeVerificationRoutes from "./modules/verification/college-verification.routes";
import publicRoutes from "./api/v1/public.routes";
import studentRoutes from "./api/v1/student.routes";
import adminRoutes from "./api/v1/admin.routes";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

app.use(helmet());
app.use(morgan("dev"));
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));
app.use(cookieParser());

const allowedOrigins = [
  process.env.FRONTEND_URL || "http://localhost:3000",
  process.env.ADMIN_FRONTEND_URL || "http://admin.localhost:3000",
  "https://baseradu.in",
  "https://admin.baseradu.in",
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin) || origin.endsWith(".baseradu.in")) {
        callback(null, true);
      } else {
        callback(new Error("CORS origin blocked"));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  })
);

app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "healthy",
    service: "basera-backend",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
  });
});

app.get("/", (_req, res) => {
  res.status(200).json({
    message: "Basera API Gateway — Delhi University Student Housing",
    version: "1.0.0",
    docs: "/api/v1",
    health: "/health",
  });
});

app.use("/api/v1/public", publicRoutes);

app.use("/api/v1/auth", studentAuthRoutes);

app.use("/api/v1/student/verify-college-email", collegeVerificationRoutes);

app.use("/api/v1/student", studentRoutes);

app.use("/api/v1/admin/auth", adminAuthRoutes);

app.use("/api/v1/admin", adminRoutes);

app.use((_req, _res, next) => {
  next(new ApiError(404, "Endpoint not found"));
});

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`🚀 Basera Backend API Gateway running on port ${PORT}`);
  console.log(`📡 Environment: ${process.env.NODE_ENV || "development"}`);
});

export default app;
