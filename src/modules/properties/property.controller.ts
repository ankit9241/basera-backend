import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import prisma from "../../lib/prisma";
import {
  searchPublicProperties,
  getPublicPropertyBySlugOrCode,
  getAdminPropertyByIdOrCode,
} from "./property.service";
import { ApiError } from "../../middleware/error-handler";
import { toAdminPropertyDTO } from "../../dtos/property.dto";
import { logAudit } from "../../lib/audit";
import type { PropertyLifecycle } from "@prisma/client";

export async function getPublicProperties(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const {
      q,
      location,
      college,
      collegeId,
      type,
      gender,
      budget,
      distance,
      amenities,
      sort,
      page,
      limit,
    } = req.query;

    let budgetMin: number | undefined;
    let budgetMax: number | undefined;

    if (budget === "Under ₹10,000") {
      budgetMax = 10000;
    } else if (budget === "₹10,000 – ₹15,000") {
      budgetMin = 10000;
      budgetMax = 15000;
    } else if (budget === "₹15,000 – ₹20,000") {
      budgetMin = 15000;
      budgetMax = 20000;
    } else if (budget === "₹20,000+") {
      budgetMin = 20000;
    }

    let distanceMax: number | undefined;
    if (distance === "Under 10 min") distanceMax = 10;
    else if (distance === "Under 15 min") distanceMax = 15;
    else if (distance === "Under 20 min") distanceMax = 20;

    let amenityList: string[] | undefined;
    if (typeof amenities === "string") {
      amenityList = amenities.split(",").filter(Boolean);
    } else if (Array.isArray(amenities)) {
      amenityList = amenities as string[];
    }

    const sortMap: Record<string, "recommended" | "price_asc" | "price_desc" | "distance_asc" | "rating_desc"> = {
      "Price: low to high": "price_asc",
      "Price: high to low": "price_desc",
      "Closest to campus": "distance_asc",
      "Highest rated": "rating_desc",
      Recommended: "recommended",
    };

    const targetCollege = typeof college === "string" ? college : typeof collegeId === "string" ? collegeId : undefined;

    const result = await searchPublicProperties({
      query: typeof q === "string" ? q : undefined,
      locality: typeof location === "string" ? location : undefined,
      collegeId: targetCollege,
      type: typeof type === "string" ? type : undefined,
      gender: typeof gender === "string" ? gender : undefined,
      budgetMin,
      budgetMax,
      distanceMax,
      amenities: amenityList,
      sort: typeof sort === "string" && sortMap[sort] ? sortMap[sort] : "recommended",
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 12,
    });

    res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
}

export async function getPublicPropertyDetail(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const paramVal = req.params.slugOrCode;
    const slugOrCode = Array.isArray(paramVal) ? paramVal[0] : paramVal;
    if (!slugOrCode) throw new ApiError(400, "Property slug or code is required");

    const property = await getPublicPropertyBySlugOrCode(slugOrCode);
    if (!property) {
      throw new ApiError(404, "Property listing not found or is no longer published.");
    }

    res.status(200).json({
      success: true,
      property,
    });
  } catch (error) {
    next(error);
  }
}

export async function getPublicColleges(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const colleges = await prisma.college.findMany({
      orderBy: { name: "asc" },
      include: {
        approvedDomains: { select: { domain: true } },
      },
    });

    res.status(200).json({
      success: true,
      colleges: colleges.map((c) => ({
        id: c.id,
        name: c.name,
        shortCode: c.shortCode,
        campusZone: c.campusZone,
        area: c.area,
        description: c.description,
        imageUrl: c.imageUrl,
        approvedDomains: c.approvedDomains.map((d) => d.domain),
      })),
    });
  } catch (error) {
    next(error);
  }
}

export async function getAdminProperties(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { status, locality, q } = req.query;

    const rawProperties = await prisma.property.findMany({
      where: {
        ...(status ? { lifecycleStatus: status as PropertyLifecycle } : {}),
        ...(locality ? { localityZone: String(locality) } : {}),
        ...(q
          ? {
              OR: [
                { publicName: { contains: String(q), mode: "insensitive" } },
                { propertyCode: { contains: String(q), mode: "insensitive" } },
                { exactAddress: { contains: String(q), mode: "insensitive" } },
                { ownerName: { contains: String(q), mode: "insensitive" } },
              ],
            }
          : {}),
      },
      include: {
        rooms: true,
        media: { orderBy: { displayOrder: "asc" } },
      },
      orderBy: { createdAt: "desc" },
    });

    res.status(200).json({
      success: true,
      total: rawProperties.length,
      properties: rawProperties.map(toAdminPropertyDTO),
    });
  } catch (error) {
    next(error);
  }
}

export async function getAdminPropertyDetail(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const paramVal = req.params.idOrCode;
    const idOrCode = Array.isArray(paramVal) ? paramVal[0] : paramVal;
    if (!idOrCode) throw new ApiError(400, "Property ID or code required");

    const property = await getAdminPropertyByIdOrCode(idOrCode);
    if (!property) throw new ApiError(404, "Property record not found");

    res.status(200).json({
      success: true,
      property,
    });
  } catch (error) {
    next(error);
  }
}

export async function verifyPropertyByAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const paramVal = req.params.id;
    const id = Array.isArray(paramVal) ? paramVal[0] : paramVal;
    if (!id) throw new ApiError(400, "Property ID required");
    const admin = req.admin!;
    const { checklist } = req.body;

    const updated = await prisma.property.update({
      where: { id },
      data: {
        isVerified: true,
        verifiedAt: new Date(),
        verifiedById: admin.id,
        verificationChecklist: checklist || {},
        lifecycleStatus: "PUBLISHED",
      },
    });

    await logAudit({
      actorId: admin.id,
      action: "PROPERTY_VERIFIED",
      targetEntity: "Property",
      targetId: updated.id,
      details: {
        propertyCode: updated.propertyCode,
        publicName: updated.publicName,
      },
    });

    res.status(200).json({
      success: true,
      message: `Property ${updated.propertyCode} is now officially Basera Verified and published.`,
      propertyCode: updated.propertyCode,
      isVerified: updated.isVerified,
      verifiedAt: updated.verifiedAt,
    });
  } catch (error) {
    next(error);
  }
}
