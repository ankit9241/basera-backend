import prisma from "../../lib/prisma";
import { sendMulticastPush } from "./firebase-admin";

export class NotificationService {
  static async registerDevice(data: {
    adminId: string;
    token: string;
    deviceLabel?: string;
    userAgent?: string;
  }) {
    const { adminId, token, deviceLabel, userAgent } = data;

    const device = await prisma.adminNotificationDevice.upsert({
      where: { token },
      update: {
        adminId,
        deviceLabel: deviceLabel || "Web Browser",
        userAgent: userAgent || null,
        isActive: true,
        lastSeenAt: new Date(),
      },
      create: {
        adminId,
        token,
        deviceLabel: deviceLabel || "Web Browser",
        userAgent: userAgent || null,
        isActive: true,
        lastSeenAt: new Date(),
      },
    });

    console.log(`[DEVICE_REGISTERED] Admin: ${adminId}, Device: ${device.id}, Token: ${token.slice(0, 12)}...`);
    return device;
  }

  static async removeDevice(adminId: string, tokenOrId: string) {
    const deleted = await prisma.adminNotificationDevice.deleteMany({
      where: {
        adminId,
        OR: [{ id: tokenOrId }, { token: tokenOrId }],
      },
    });

    console.log(`[DEVICE_REMOVED] Admin: ${adminId}, Count: ${deleted.count}`);
    return deleted.count > 0;
  }

  static async getAdminNotifications(params: {
    adminId: string;
    page?: number;
    limit?: number;
    unreadOnly?: boolean;
  }) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const skip = (page - 1) * limit;

    const whereClause: any = { adminId: params.adminId };
    if (params.unreadOnly) {
      whereClause.isRead = false;
    }

    const [notifications, total, unreadCount] = await Promise.all([
      prisma.adminNotification.findMany({
        where: whereClause,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.adminNotification.count({ where: whereClause }),
      prisma.adminNotification.count({
        where: { adminId: params.adminId, isRead: false },
      }),
    ]);

    return {
      notifications,
      total,
      unreadCount,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  static async markNotificationAsRead(adminId: string, notificationId: string) {
    const updated = await prisma.adminNotification.updateMany({
      where: { id: notificationId, adminId },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });
    return updated.count > 0;
  }

  static async markAllNotificationsAsRead(adminId: string) {
    const updated = await prisma.adminNotification.updateMany({
      where: { adminId, isRead: false },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });
    return updated.count;
  }

  static async notifyNewVisit(visit: {
    id: string;
    bookingCode: string;
    studentName: string;
    timeSlot: string;
    visitDate: Date;
    property: {
      propertyCode: string;
      publicName: string;
      localityZone?: string;
    };
  }): Promise<void> {
    try {
      console.log(`[VISIT_CREATED] ID: ${visit.id}, Code: ${visit.bookingCode}, Property: ${visit.property.propertyCode}`);

      const eligibleAdmins = await prisma.adminUser.findMany({
        where: {
          isActive: true,
          permissions: {
            some: {
              permissionId: { in: ["visits.read", "visits.manage"] },
            },
          },
        },
        include: {
          notificationDevices: {
            where: { isActive: true },
          },
        },
      });

      if (eligibleAdmins.length === 0) {
        console.log(`[NOTIFY_SKIPPED] No active admins with visits.read/visits.manage permission found.`);
        return;
      }

      const title = "New Visit Request";
      const dateFormatted = new Date(visit.visitDate).toLocaleDateString("en-IN", {
        month: "short",
        day: "numeric",
      });
      const body = `${visit.property.propertyCode} · ${visit.property.publicName} · ${dateFormatted}, ${visit.timeSlot} · ${visit.studentName}`;

      for (const admin of eligibleAdmins) {
        await prisma.adminNotification.create({
          data: {
            adminId: admin.id,
            type: "NEW_VISIT",
            title,
            body,
            visitId: visit.id,
          },
        });
        console.log(`[ADMIN_NOTIFICATION_CREATED] Admin: ${admin.email}, Visit: ${visit.bookingCode}`);
      }

      const allTokens: string[] = [];
      eligibleAdmins.forEach((admin) => {
        admin.notificationDevices.forEach((d) => {
          if (d.token && !allTokens.includes(d.token)) {
            allTokens.push(d.token);
          }
        });
      });

      if (allTokens.length === 0) {
        console.log(`[FCM_SKIPPED] No registered active FCM devices found for eligible admins.`);
        return;
      }

      const pushResult = await sendMulticastPush({
        title,
        body,
        data: {
          visitId: visit.id,
          bookingCode: visit.bookingCode,
          url: `/admin/visits`,
          type: "NEW_VISIT",
        },
        tokens: allTokens,
      });

      if (pushResult.successCount > 0) {
        console.log(`[FCM_SEND_SUCCESS] Sent push notification to ${pushResult.successCount} devices.`);
      }

      if (pushResult.failureCount > 0) {
        console.log(`[FCM_SEND_FAILURE] Failed to deliver push to ${pushResult.failureCount} devices.`);
      }

      if (pushResult.invalidTokens.length > 0) {
        await prisma.adminNotificationDevice.updateMany({
          where: { token: { in: pushResult.invalidTokens } },
          data: { isActive: false },
        });
        console.log(`[INVALID_FCM_DEVICE] Deactivated ${pushResult.invalidTokens.length} expired/invalid device tokens.`);
      }
    } catch (error) {
      console.error(`[NOTIFICATION_SERVICE_ERROR] Failed to process new visit notifications:`, error);
    }
  }
}
