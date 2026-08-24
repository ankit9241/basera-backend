import jwt from "jsonwebtoken";
import type { CookieOptions } from "express";

const STUDENT_JWT_SECRET = process.env.STUDENT_JWT_SECRET || "basera_student_dev_secret_key_min_32_chars_long_123";
const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || "basera_admin_dev_secret_key_min_32_chars_long_456";

export interface StudentJwtPayload {
  userId: string;
  phone: string;
  role: "STUDENT";
}

export interface AdminJwtPayload {
  adminId: string;
  email: string;
  role: "ADMIN";
}

export function signStudentToken(payload: StudentJwtPayload): string {
  return jwt.sign(payload, STUDENT_JWT_SECRET, { expiresIn: "30d" });
}

export function verifyStudentToken(token: string): StudentJwtPayload | null {
  try {
    return jwt.verify(token, STUDENT_JWT_SECRET) as StudentJwtPayload;
  } catch {
    return null;
  }
}

export function signAdminToken(payload: AdminJwtPayload): string {
  return jwt.sign(payload, ADMIN_JWT_SECRET, { expiresIn: "7d" });
}

export function verifyAdminToken(token: string): AdminJwtPayload | null {
  try {
    return jwt.verify(token, ADMIN_JWT_SECRET) as AdminJwtPayload;
  } catch {
    return null;
  }
}

export const STUDENT_COOKIE_NAME = "basera_student_session";
export const ADMIN_COOKIE_NAME = "basera_admin_session";

export function getStudentCookieOptions(): CookieOptions {
  const isProd = process.env.NODE_ENV === "production";
  const sameSiteValue: "none" | "lax" | "strict" = (process.env.COOKIE_SAME_SITE as any) || (isProd ? "none" : "lax");
  return {
    httpOnly: true,
    secure: isProd || sameSiteValue === "none",
    sameSite: sameSiteValue,
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: "/",
  };
}

export function getAdminCookieOptions(): CookieOptions {
  const isProd = process.env.NODE_ENV === "production";
  const sameSiteValue: "none" | "lax" | "strict" = (process.env.COOKIE_SAME_SITE as any) || (isProd ? "none" : "lax");
  return {
    httpOnly: true,
    secure: isProd || sameSiteValue === "none",
    sameSite: sameSiteValue,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
  };
}
