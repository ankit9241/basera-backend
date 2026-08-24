import prisma from "../../lib/prisma";
import type { Prisma, PropertyType, GenderCategory } from "@prisma/client";
import {
  toPublicPropertyDTO,
  toAdminPropertyDTO,
  type PublicPropertyDTO,
  type AdminPropertyDTO,
} from "../../dtos/property.dto";

export interface PropertyQueryFilters {
  query?: string;
  locality?: string;
  type?: string;
  gender?: string;
  sharing?: string;
  budgetMin?: number;
  budgetMax?: number;
  distanceMax?: number;
  amenities?: string[];
  collegeId?: string;
  sort?: "recommended" | "price_asc" | "price_desc" | "distance_asc" | "rating_desc";
  limit?: number;
  page?: number;
}

export async function searchPublicProperties(filters: PropertyQueryFilters): Promise<{
  properties: PublicPropertyDTO[];
  total: number;
  page: number;
  totalPages: number;
}> {
  const limit = Math.min(filters.limit || 12, 50);
  const page = Math.max(filters.page || 1, 1);
  const skip = (page - 1) * limit;

  const where: Prisma.PropertyWhereInput = {
    lifecycleStatus: "PUBLISHED",
  };

  if (filters.query) {
    where.OR = [
      { publicName: { contains: filters.query, mode: "insensitive" } },
      { localityZone: { contains: filters.query, mode: "insensitive" } },
      { description: { contains: filters.query, mode: "insensitive" } },
    ];
  }

  if (filters.locality && filters.locality !== "All") {
    where.localityZone = { equals: filters.locality, mode: "insensitive" };
  }

  if (filters.type) {
    where.type = filters.type as PropertyType;
  }

  if (filters.gender) {
    where.gender = filters.gender as GenderCategory;
  }

  if (filters.budgetMin !== undefined || filters.budgetMax !== undefined) {
    where.rentMin = {
      gte: filters.budgetMin ?? 0,
      ...(filters.budgetMax ? { lte: filters.budgetMax } : {}),
    };
  }

  if (filters.distanceMax) {
    where.distanceMin = { lte: filters.distanceMax };
  }

  if (filters.collegeId) {
    where.collegeDistances = {
      some: {
        OR: [
          { collegeId: { equals: filters.collegeId, mode: "insensitive" } },
          { college: { id: { equals: filters.collegeId, mode: "insensitive" } } },
          { college: { shortCode: { equals: filters.collegeId, mode: "insensitive" } } },
          { college: { name: { contains: filters.collegeId, mode: "insensitive" } } },
        ],
      },
    };
  }

  if (filters.amenities && filters.amenities.length > 0) {
    where.amenities = { hasEvery: filters.amenities };
  }

  let orderBy: Prisma.PropertyOrderByWithRelationInput = { isFeatured: "desc" };
  if (filters.sort === "price_asc") orderBy = { rentMin: "asc" };
  if (filters.sort === "price_desc") orderBy = { rentMin: "desc" };
  if (filters.sort === "distance_asc") orderBy = { distanceMin: "asc" };
  if (filters.sort === "rating_desc") orderBy = { rating: "desc" };

  const [total, rawProperties] = await Promise.all([
    prisma.property.count({ where }),
    prisma.property.findMany({
      where,
      orderBy,
      skip,
      take: limit,
      include: {
        rooms: true,
        media: { orderBy: { displayOrder: "asc" } },
        collegeDistances: { include: { college: true } },
      },
    }),
  ]);

  let properties = rawProperties.map((prop) => {
    const dto = toPublicPropertyDTO(prop);
    if (filters.collegeId) {
      const match = prop.collegeDistances?.find(
        (cd) =>
          cd.collegeId.toLowerCase() === filters.collegeId?.toLowerCase() ||
          cd.college.shortCode.toLowerCase() === filters.collegeId?.toLowerCase() ||
          cd.college.name.toLowerCase().includes(filters.collegeId?.toLowerCase() || "")
      );
      if (match) {
        dto.distanceMin = match.distanceMinutes;
        const meterText = match.walkingDistanceM ? `${match.walkingDistanceM}m` : `${match.distanceMinutes * 80}m`;
        dto.distanceText = `${match.distanceMinutes} min (${meterText}) to ${match.college.name}`;
      }
    }
    return dto;
  });

  if (filters.collegeId && (!filters.sort || filters.sort === "recommended" || filters.sort === "distance_asc")) {
    properties = properties.sort((a, b) => a.distanceMin - b.distanceMin);
  }

  return {
    properties,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
}

export async function getPublicPropertyBySlugOrCode(
  slugOrCode: string
): Promise<PublicPropertyDTO | null> {
  const normalizedCode = slugOrCode.toUpperCase().replace(/^PF-/, "PF#");
  const unhyphenatedCode = slugOrCode.toUpperCase().replace("-", "#");

  const rawProperty = await prisma.property.findFirst({
    where: {
      OR: [
        { id: slugOrCode },
        { slug: slugOrCode.toLowerCase() },
        { propertyCode: normalizedCode },
        { propertyCode: unhyphenatedCode },
        { propertyCode: slugOrCode },
        { propertyCode: slugOrCode.toUpperCase() },
      ],
      lifecycleStatus: "PUBLISHED",
    },
    include: {
      rooms: true,
      media: { orderBy: { displayOrder: "asc" } },
      collegeDistances: { include: { college: true } },
    },
  });

  if (!rawProperty) return null;
  return toPublicPropertyDTO(rawProperty);
}

export async function getAdminPropertyByIdOrCode(
  idOrCode: string
): Promise<AdminPropertyDTO | null> {
  const normalizedCode = idOrCode.toUpperCase().replace(/^PF-/, "PF#");

  const rawProperty = await prisma.property.findFirst({
    where: {
      OR: [
        { id: idOrCode },
        { propertyCode: normalizedCode },
        { propertyCode: idOrCode },
      ],
    },
    include: {
      rooms: true,
      media: { orderBy: { displayOrder: "asc" } },
      collegeDistances: { include: { college: true } },
    },
  });

  if (!rawProperty) return null;
  return toAdminPropertyDTO(rawProperty);
}
