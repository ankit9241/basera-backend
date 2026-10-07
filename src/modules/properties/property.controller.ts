import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import prisma from "../../lib/prisma";
import {
  searchPublicProperties,
  getPublicPropertyBySlugOrCode,
  getAdminPropertyByIdOrCode,
  updateAdminPropertyService,
} from "./property.service";
import { ApiError } from "../../middleware/error-handler";
import { toAdminPropertyDTO } from "../../dtos/property.dto";
import { logAudit } from "../../lib/audit";
import type { PropertyLifecycle, VerificationStatus } from "@prisma/client";

export async function getPublicProperties(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const {
      q,
      search,
      query: queryParam,
      location,
      locality,
      area,
      college,
      collegeId,
      type,
      gender,
      room,
      sharing,
      budget,
      budgetMin: budgetMinParam,
      budgetMax: budgetMaxParam,
      rentMin: rentMinParam,
      rentMax: rentMaxParam,
      distance,
      distanceMax: distanceMaxParam,
      food,
      furnished,
      furnishedStatus,
      availability,
      availabilityStatus,
      verified,
      isVerified,
      amenities,
      sort,
      sortBy,
      page,
      limit,
    } = req.query;

    const searchTerm = String(q || search || queryParam || "").trim();
    const locationTerm = String(location || locality || area || "").trim();

    let budgetMin: number | undefined =
      budgetMinParam !== undefined
        ? Number(budgetMinParam)
        : rentMinParam !== undefined
        ? Number(rentMinParam)
        : undefined;

    let budgetMax: number | undefined =
      budgetMaxParam !== undefined
        ? Number(budgetMaxParam)
        : rentMaxParam !== undefined
        ? Number(rentMaxParam)
        : undefined;

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

    let distanceMax: number | undefined =
      distanceMaxParam !== undefined ? Number(distanceMaxParam) : undefined;
    if (distance === "Under 10 min") distanceMax = 10;
    else if (distance === "Under 15 min") distanceMax = 15;
    else if (distance === "Under 20 min") distanceMax = 20;

    let amenityList: string[] | undefined;
    if (typeof amenities === "string") {
      amenityList = amenities.split(",").map((s) => s.trim()).filter(Boolean);
    } else if (Array.isArray(amenities)) {
      amenityList = (amenities as string[]).map((s) => String(s).trim()).filter(Boolean);
    }

    const sortMap: Record<string, "recommended" | "price_asc" | "price_desc" | "distance_asc" | "rating_desc" | "newest"> = {
      "Price: low to high": "price_asc",
      "Price: high to low": "price_desc",
      "Closest to campus": "distance_asc",
      "Highest rated": "rating_desc",
      Newest: "newest",
      price_asc: "price_asc",
      price_desc: "price_desc",
      distance_asc: "distance_asc",
      rating_desc: "rating_desc",
      newest: "newest",
      Recommended: "recommended",
      recommended: "recommended",
    };

    const targetCollege = typeof college === "string" ? college : typeof collegeId === "string" ? collegeId : undefined;
    const activeSortKey = String(sort || sortBy || "recommended");
    const resolvedSort = sortMap[activeSortKey] || "recommended";

    const isVerifiedBool =
      String(verified).toLowerCase() === "true" ||
      String(isVerified).toLowerCase() === "true";

    const result = await searchPublicProperties({
      query: searchTerm || undefined,
      locality: locationTerm || undefined,
      collegeId: targetCollege,
      type: typeof type === "string" && type !== "all" ? type : undefined,
      gender: typeof gender === "string" && gender !== "all" ? gender : undefined,
      sharing: typeof room === "string" ? room : typeof sharing === "string" ? sharing : undefined,
      budgetMin: budgetMin !== undefined && !isNaN(budgetMin) ? budgetMin : undefined,
      budgetMax: budgetMax !== undefined && !isNaN(budgetMax) ? budgetMax : undefined,
      distanceMax,
      food: typeof food === "string" ? food : undefined,
      furnishedStatus: typeof furnishedStatus === "string" ? furnishedStatus : typeof furnished === "string" ? furnished : undefined,
      availabilityStatus: typeof availabilityStatus === "string" ? availabilityStatus : typeof availability === "string" ? availability : undefined,
      isVerified: isVerifiedBool ? true : undefined,
      amenities: amenityList,
      sort: resolvedSort,
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
    const { status, locality, q, search, query: queryParam, verificationStatus } = req.query;
    const searchTerm = String(search || q || queryParam || "").trim();

    const normalizedSearch = searchTerm.toUpperCase().replace(/^PF-/, "PF#");
    const unhyphenatedSearch = searchTerm.toUpperCase().replace("-", "#");

    const rawProperties = await prisma.property.findMany({
      where: {
        ...(status ? { lifecycleStatus: status as PropertyLifecycle } : {}),
        ...(verificationStatus ? { verificationStatus: verificationStatus as VerificationStatus } : {}),
        ...(locality ? { localityZone: String(locality) } : {}),
        ...(searchTerm
          ? {
              OR: [
                { publicName: { contains: searchTerm, mode: "insensitive" } },
                { propertyCode: { contains: searchTerm, mode: "insensitive" } },
                { propertyCode: { contains: normalizedSearch, mode: "insensitive" } },
                { propertyCode: { contains: unhyphenatedSearch, mode: "insensitive" } },
                { exactAddress: { contains: searchTerm, mode: "insensitive" } },
                { ownerName: { contains: searchTerm, mode: "insensitive" } },
                { ownerPhone: { contains: searchTerm, mode: "insensitive" } },
                { localityZone: { contains: searchTerm, mode: "insensitive" } },
                { area: { contains: searchTerm, mode: "insensitive" } },
                { internalPropertyName: { contains: searchTerm, mode: "insensitive" } },
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
    const { checklist, notes, status } = req.body;

    const isApprove = status === "VERIFIED" || status === true;

    const updated = await prisma.property.update({
      where: { id },
      data: {
        isVerified: isApprove,
        verificationStatus: isApprove ? "VERIFIED" : (status === "REJECTED" ? "REJECTED" : "IN_REVIEW"),
        verifiedAt: isApprove ? new Date() : null,
        verifiedById: isApprove ? admin.id : null,
        verificationChecklist: checklist || {},
        verificationNotes: notes !== undefined ? notes : undefined,
        lifecycleStatus: isApprove ? "PUBLISHED" : undefined,
      },
    });

    await logAudit({
      actorId: admin.id,
      action: isApprove ? "PROPERTY_VERIFIED" : "PROPERTY_VERIFICATION_REJECTED",
      targetEntity: "Property",
      targetId: updated.id,
      details: {
        propertyCode: updated.propertyCode,
        publicName: updated.publicName,
        status: updated.verificationStatus,
        notes: updated.verificationNotes,
      },
    });

    res.status(200).json({
      success: true,
      message: isApprove
        ? `Property ${updated.propertyCode} is now officially Basera Verified and published.`
        : `Property ${updated.propertyCode} verification status updated to ${updated.verificationStatus}.`,
      propertyCode: updated.propertyCode,
      isVerified: updated.isVerified,
      verificationStatus: updated.verificationStatus,
      verifiedAt: updated.verifiedAt,
    });
  } catch (error) {
    next(error);
  }
}

export async function updateAdminPropertyController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const paramVal = req.params.idOrCode;
    const idOrCode = Array.isArray(paramVal) ? paramVal[0] : paramVal;
    if (!idOrCode) throw new ApiError(400, "Property ID or code is required");
    const admin = req.admin!;

    const updated = await updateAdminPropertyService(idOrCode, req.body);

    await logAudit({
      actorId: admin.id,
      action: "PROPERTY_UPDATED",
      targetEntity: "Property",
      targetId: updated.id,
      details: {
        propertyCode: updated.propertyCode,
        publicName: updated.publicName,
        updatedFields: Object.keys(req.body),
      },
    });

    res.status(200).json({
      success: true,
      message: `Property ${updated.propertyCode} updated successfully.`,
      property: updated,
    });
  } catch (error) {
    next(error);
  }
}
