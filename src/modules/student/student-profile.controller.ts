import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import prisma from "../../lib/prisma";
import { ApiError } from "../../middleware/error-handler";
import { toPublicPropertyDTO } from "../../dtos/property.dto";

const updateProfileSchema = z.object({
  fullName: z.string().min(2).optional(),
  personalEmail: z.string().email().optional().or(z.literal("")),
  budgetRange: z.string().optional(),
  gender: z.string().optional(),
  preferredLocations: z.array(z.string()).optional(),
  notifyVisits: z.boolean().optional(),
  notifyMatches: z.boolean().optional(),
  notifyOffers: z.boolean().optional(),
});

export async function getStudentProfile(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const user = req.user!;
    const fullUser = await prisma.user.findUnique({
      where: { id: user.id },
      include: {
        college: { select: { id: true, name: true, shortCode: true, campusZone: true } },
        _count: { select: { savedListings: true, visits: true } },
      },
    });

    res.status(200).json({
      success: true,
      profile: fullUser,
    });
  } catch (error) {
    next(error);
  }
}

export async function updateStudentProfile(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const user = req.user!;
    const data = updateProfileSchema.parse(req.body);

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        ...(data.fullName ? { fullName: data.fullName } : {}),
        ...(data.personalEmail !== undefined ? { personalEmail: data.personalEmail || null } : {}),
        ...(data.budgetRange !== undefined ? { budgetRange: data.budgetRange } : {}),
        ...(data.gender !== undefined ? { gender: data.gender } : {}),
        ...(data.preferredLocations ? { preferredLocations: data.preferredLocations } : {}),
        ...(data.notifyVisits !== undefined ? { notifyVisits: data.notifyVisits } : {}),
        ...(data.notifyMatches !== undefined ? { notifyMatches: data.notifyMatches } : {}),
        ...(data.notifyOffers !== undefined ? { notifyOffers: data.notifyOffers } : {}),
      },
      include: {
        college: { select: { id: true, name: true, shortCode: true } },
      },
    });

    res.status(200).json({
      success: true,
      message: "Profile updated successfully.",
      profile: updated,
    });
  } catch (error) {
    next(error);
  }
}

export async function getStudentSavedListings(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const user = req.user!;

    const saved = await prisma.savedListing.findMany({
      where: { userId: user.id },
      include: {
        property: {
          include: {
            rooms: true,
            media: { orderBy: { displayOrder: "asc" } },
            collegeDistances: { include: { college: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const properties = saved
      .filter((s) => s.property && s.property.lifecycleStatus === "PUBLISHED")
      .map((s) => toPublicPropertyDTO(s.property));

    res.status(200).json({
      success: true,
      total: properties.length,
      properties,
    });
  } catch (error) {
    next(error);
  }
}

export async function toggleSavedListing(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const user = req.user!;
    const { propertyId } = req.body;

    if (!propertyId) throw new ApiError(400, "propertyId is required");

    const prop = await prisma.property.findFirst({
      where: {
        OR: [
          { id: propertyId },
          { propertyCode: propertyId },
          { slug: propertyId },
        ],
      },
      select: { id: true },
    });

    if (!prop) {
      throw new ApiError(404, "Property not found");
    }

    const resolvedPropertyId = prop.id;

    const existing = await prisma.savedListing.findUnique({
      where: {
        userId_propertyId: {
          userId: user.id,
          propertyId: resolvedPropertyId,
        },
      },
    });

    if (existing) {
      await prisma.savedListing.delete({
        where: { id: existing.id },
      });

      res.status(200).json({
        success: true,
        saved: false,
        message: "Removed from shortlist.",
      });
    } else {
      await prisma.savedListing.create({
        data: {
          userId: user.id,
          propertyId: resolvedPropertyId,
        },
      });

      res.status(200).json({
        success: true,
        saved: true,
        message: "Added to shortlist.",
      });
    }
  } catch (error) {
    next(error);
  }
}

export async function mergeSavedListings(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const user = req.user!;
    const mergeSchema = z.object({
      propertyIds: z.array(z.string()).optional(),
      propertyCodes: z.array(z.string()).optional(),
    });
    const { propertyIds = [], propertyCodes = [] } = mergeSchema.parse(req.body);

    const allRequestedIds = new Set<string>(propertyIds);

    if (propertyCodes.length > 0) {
      const codeMatches = await prisma.property.findMany({
        where: {
          OR: [
            { propertyCode: { in: propertyCodes } },
            { slug: { in: propertyCodes } },
            { id: { in: propertyCodes } },
          ],
          lifecycleStatus: "PUBLISHED",
        },
        select: { id: true },
      });
      codeMatches.forEach((p) => allRequestedIds.add(p.id));
    }

    if (allRequestedIds.size > 0) {
      const validProperties = await prisma.property.findMany({
        where: {
          id: { in: Array.from(allRequestedIds) },
          lifecycleStatus: "PUBLISHED",
        },
        select: { id: true },
      });

      const alreadySaved = await prisma.savedListing.findMany({
        where: {
          userId: user.id,
          propertyId: { in: validProperties.map((p) => p.id) },
        },
        select: { propertyId: true },
      });
      const alreadySavedSet = new Set(alreadySaved.map((s) => s.propertyId));

      const toCreate = validProperties
        .filter((p) => !alreadySavedSet.has(p.id))
        .map((p) => ({
          userId: user.id,
          propertyId: p.id,
        }));

      if (toCreate.length > 0) {
        await prisma.savedListing.createMany({
          data: toCreate,
          skipDuplicates: true,
        });
      }
    }

    const saved = await prisma.savedListing.findMany({
      where: { userId: user.id },
      include: {
        property: {
          include: {
            rooms: true,
            media: { orderBy: { displayOrder: "asc" } },
            collegeDistances: { include: { college: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const properties = saved
      .filter((s) => s.property && s.property.lifecycleStatus === "PUBLISHED")
      .map((s) => toPublicPropertyDTO(s.property));

    res.status(200).json({
      success: true,
      message: "Shortlist synchronized successfully.",
      total: properties.length,
      properties,
    });
  } catch (error) {
    next(error);
  }
}

