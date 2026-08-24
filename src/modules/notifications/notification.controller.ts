import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { NotificationService } from "./notification.service";
import { ApiError } from "../../middleware/error-handler";

const registerDeviceSchema = z.object({
  token: z.string().min(10, "Valid FCM registration token required"),
  deviceLabel: z.string().optional(),
  userAgent: z.string().optional(),
});

export async function registerAdminDevice(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const admin = req.admin!;
    const data = registerDeviceSchema.parse(req.body);
    const userAgentHeader = Array.isArray(req.headers["user-agent"])
      ? req.headers["user-agent"][0]
      : req.headers["user-agent"];

    const device = await NotificationService.registerDevice({
      adminId: admin.id,
      token: data.token,
      deviceLabel: data.deviceLabel,
      userAgent: data.userAgent || userAgentHeader,
    });

    res.status(200).json({
      success: true,
      message: "Device registered for visit push notifications successfully.",
      device: {
        id: device.id,
        deviceLabel: device.deviceLabel,
        isActive: device.isActive,
        lastSeenAt: device.lastSeenAt,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function removeAdminDevice(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const admin = req.admin!;
    const idOrToken = String(req.params.idOrToken || "");

    if (!idOrToken) {
      throw new ApiError(400, "Device ID or token is required.");
    }

    const removed = await NotificationService.removeDevice(admin.id, idOrToken);

    res.status(200).json({
      success: true,
      message: removed
        ? "Device registration removed successfully."
        : "Device not found or already removed.",
    });
  } catch (error) {
    next(error);
  }
}

export async function getAdminNotifications(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const admin = req.admin!;
    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
    const unreadOnly = req.query.unreadOnly === "true";

    const result = await NotificationService.getAdminNotifications({
      adminId: admin.id,
      page,
      limit,
      unreadOnly,
    });

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export async function markNotificationAsRead(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const admin = req.admin!;
    const id = String(req.params.id || "");

    if (!id) {
      throw new ApiError(400, "Notification ID is required.");
    }

    const success = await NotificationService.markNotificationAsRead(admin.id, id);

    if (!success) {
      throw new ApiError(404, "Notification not found or already read.");
    }

    res.status(200).json({
      success: true,
      message: "Notification marked as read.",
    });
  } catch (error) {
    next(error);
  }
}

export async function markAllNotificationsAsRead(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const admin = req.admin!;
    const count = await NotificationService.markAllNotificationsAsRead(admin.id);

    res.status(200).json({
      success: true,
      message: `${count} notifications marked as read.`,
      count,
    });
  } catch (error) {
    next(error);
  }
}
