import type { Request, Response, NextFunction } from "express";
import { ApiError } from "./error-handler";
import {
  verifyStudentToken,
  verifyAdminToken,
  STUDENT_COOKIE_NAME,
  ADMIN_COOKIE_NAME,
} from "../lib/jwt";
import prisma from "../lib/prisma";
import type { User, AdminUser } from "@prisma/client";

declare global {
  namespace Express {
    interface Request {
      user?: User;
      admin?: AdminUser & { permissions: string[] };
    }
  }
}

export async function requireStudentAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const token =
    req.cookies?.[STUDENT_COOKIE_NAME] ||
    req.headers.authorization?.replace(/^Bearer\s+/i, "");

  if (!token) {
    next(new ApiError(401, "Authentication required. Please log in as a student."));
    return;
  }

  const payload = verifyStudentToken(token);
  if (!payload || payload.role !== "STUDENT") {
    next(new ApiError(401, "Invalid or expired student session. Please log in again."));
    return;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
    });

    if (!user) {
      next(new ApiError(401, "Student account not found."));
      return;
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}

export async function optionalStudentAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const token =
    req.cookies?.[STUDENT_COOKIE_NAME] ||
    req.headers.authorization?.replace(/^Bearer\s+/i, "");

  if (!token) {
    next();
    return;
  }

  const payload = verifyStudentToken(token);
  if (payload && payload.role === "STUDENT") {
    try {
      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
      });
      if (user) req.user = user;
    } catch {
    }
  }
  next();
}

export function requireAdminAuth(requiredPermission?: string) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const token =
      req.cookies?.[ADMIN_COOKIE_NAME] ||
      req.headers.authorization?.replace(/^Bearer\s+/i, "");

    if (!token) {
      next(new ApiError(401, "Admin authentication required. Access denied."));
      return;
    }

    const payload = verifyAdminToken(token);
    if (!payload || payload.role !== "ADMIN") {
      next(new ApiError(401, "Invalid or expired admin session."));
      return;
    }

    try {
      const admin = await prisma.adminUser.findUnique({
        where: { id: payload.adminId },
        include: {
          permissions: {
            select: { permissionId: true },
          },
        },
      });

      if (!admin || !admin.isActive) {
        next(new ApiError(403, "Admin account is deactivated or no longer exists."));
        return;
      }

      const permissionList = admin.permissions.map((p) => p.permissionId);

      if (requiredPermission && !permissionList.includes(requiredPermission)) {
        next(
          new ApiError(
            403,
            `Forbidden. You lack the required permission: [${requiredPermission}]`
          )
        );
        return;
      }

      req.admin = {
        ...admin,
        permissions: permissionList,
      };

      next();
    } catch (error) {
      next(error);
    }
  };
}
