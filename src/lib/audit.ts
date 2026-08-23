import prisma from "./prisma";
import type { Prisma } from "@prisma/client";

export interface LogAuditParams {
  actorId: string;
  action: string;
  targetEntity: string;
  targetId: string;
  details?: Prisma.InputJsonValue;
}

export async function logAudit(params: LogAuditParams): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: params.actorId,
        action: params.action,
        targetEntity: params.targetEntity,
        targetId: params.targetId,
        details: params.details,
      },
    });
  } catch (error) {
    console.error("❌ Failed to create audit log:", error);
  }
}
