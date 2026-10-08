import jwt from "jsonwebtoken";
import type { CookieOptions, Request } from "express";

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

function resolveCookieDomain(req?: Request): string | undefined {
  const isProd = process.env.NODE_ENV === "production";
  if (!isProd || !process.env.COOKIE_DOMAIN) return undefined;
  if (!req) return process.env.COOKIE_DOMAIN;
  const origin = String(req.headers.origin || req.headers.host || "");
  const domainClean = process.env.COOKIE_DOMAIN.replace(/^\./, "");
  return origin.includes(domainClean) ? process.env.COOKIE_DOMAIN : undefined;
}

export function getStudentCookieOptions(req?: Request): CookieOptions {
  const isProd = process.env.NODE_ENV === "production";
  const sameSiteValue: "none" | "lax" | "strict" = (process.env.COOKIE_SAME_SITE as any) || (isProd ? "none" : "lax");
  const cookieDomain = resolveCookieDomain(req);
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? sameSiteValue : "lax",
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: "/",
    domain: cookieDomain,
  };
}

export function getAdminCookieOptions(req?: Request): CookieOptions {
  const isProd = process.env.NODE_ENV === "production";
  const sameSiteValue: "none" | "lax" | "strict" = (process.env.COOKIE_SAME_SITE as any) || (isProd ? "none" : "lax");
  const cookieDomain = resolveCookieDomain(req);
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? sameSiteValue : "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
    domain: cookieDomain,
  };
}

export function getStudentClearCookieOptions(req?: Request): CookieOptions {
  const isProd = process.env.NODE_ENV === "production";
  const sameSiteValue: "none" | "lax" | "strict" = (process.env.COOKIE_SAME_SITE as any) || (isProd ? "none" : "lax");
  const cookieDomain = resolveCookieDomain(req);
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? sameSiteValue : "lax",
    maxAge: 0,
    expires: new Date(0),
    path: "/",
    domain: cookieDomain,
  };
}

export function getAdminClearCookieOptions(req?: Request): CookieOptions {
  const isProd = process.env.NODE_ENV === "production";
  const sameSiteValue: "none" | "lax" | "strict" = (process.env.COOKIE_SAME_SITE as any) || (isProd ? "none" : "lax");
  const cookieDomain = resolveCookieDomain(req);
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? sameSiteValue : "lax",
    maxAge: 0,
    expires: new Date(0),
    path: "/",
    domain: cookieDomain,
  };
}
