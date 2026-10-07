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

const isProd = process.env.NODE_ENV === "production";

const defaultProdOrigins = [
  "https://baseradu.in",
  "https://www.baseradu.in",
  "https://admin.baseradu.in",
];

const defaultDevOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://admin.localhost:3000",
];

const configuredOrigins = [
  process.env.FRONTEND_URL,
  process.env.ADMIN_FRONTEND_URL,
  ...(process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(",").map((s) => s.trim()) : []),
].filter((url): url is string => Boolean(url && url.trim()));

const allowedOrigins = Array.from(
  new Set([...(isProd ? defaultProdOrigins : defaultDevOrigins), ...configuredOrigins])
);

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    if (!isProd && (/^https?:\/\/localhost(:\d+)?$/.test(origin) || /^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(origin))) {
      return callback(null, true);
    }

    if (isProd && /^https:\/\/(www\.|admin\.)?baseradu\.in$/.test(origin)) {
      return callback(null, true);
    }

    callback(null, false);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Requested-With",
    "Accept",
    "Origin",
  ],
  exposedHeaders: ["Set-Cookie"],
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);
app.use(morgan("dev"));
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));
app.use(cookieParser());

app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "basera-backend",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
  });
});

app.get("/", (_req, res) => {
  res.status(200).json({
    message: "Basera API Gateway - Delhi University Student Housing",
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

app.use("/public", publicRoutes);
app.use("/auth", studentAuthRoutes);
app.use("/student/verify-college-email", collegeVerificationRoutes);
app.use("/student", studentRoutes);
app.use("/admin/auth", adminAuthRoutes);
app.use("/admin", adminRoutes);

app.use((_req, _res, next) => {
  next(new ApiError(404, "Endpoint not found"));
});

app.use(errorHandler);

if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => {
    console.log(`\n🚀 Basera Backend Engine running on port ${PORT}`);
    console.log(`📡 Environment: ${process.env.NODE_ENV || "development"}`);
    console.log(`🌐 Base URL: http://localhost:${PORT}/api/v1\n`);
  });
}

export default app;
