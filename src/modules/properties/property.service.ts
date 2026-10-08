import prisma from "../../lib/prisma";
import {
  Prisma,
  PropertyType,
  GenderCategory,
  FoodStatus,
  ElectricityBillingType,
  FurnishedStatus,
  OwnerType,
  AvailabilityStatus,
  VerificationStatus,
  PropertyLifecycle,
} from "@prisma/client";
import { ApiError } from "../../middleware/error-handler";
import {
  toPublicPropertyDTO,
  toAdminPropertyDTO,
  type PublicPropertyDTO,
  type AdminPropertyDTO,
} from "../../dtos/property.dto";
import {
  matchLocality,
  parseNaturalSearchQuery,
  getNearbyLocalities,
  type ParsedSearchIntent,
} from "./search-v2";

export interface PropertyQueryFilters {
  query?: string;
  locality?: string;
  type?: string;
  gender?: string;
  sharing?: string;
  budgetMin?: number;
  budgetMax?: number;
  distanceMax?: number;
  food?: string;
  furnishedStatus?: string;
  availabilityStatus?: string;
  isVerified?: boolean;
  amenities?: string[];
  collegeId?: string;
  sort?: "recommended" | "price_asc" | "price_desc" | "distance_asc" | "rating_desc" | "newest";
  limit?: number;
  page?: number;
}

export interface SearchV2Metadata {
  normalizedQuery?: string;
  inferredIntent?: {
    type?: string;
    gender?: string;
    sharing?: string;
    budgetMin?: number;
    budgetMax?: number;
    locality?: string;
  };
  appliedLocality?: string;
  suggestion?: {
    locality: string;
    text: string;
  };
  zeroResultFallback?: {
    requestedLocality: string;
    hasConfiguredNearby: boolean;
    nearbyLocalities: {
      name: string;
      count: number;
    }[];
  };
}

export interface SearchPublicPropertiesResult {
  properties: PublicPropertyDTO[];
  total: number;
  page: number;
  totalPages: number;
  searchMeta?: SearchV2Metadata;
  fallbackProperties?: PublicPropertyDTO[];
}

export async function searchPublicProperties(filters: PropertyQueryFilters): Promise<SearchPublicPropertiesResult> {
  const limit = Math.min(filters.limit || 12, 50);
  const page = Math.max(filters.page || 1, 1);
  const skip = (page - 1) * limit;

  // Search V2 Parsing & Normalization State
  let effectiveLocality =
    filters.locality && filters.locality !== "All" && filters.locality !== "all"
      ? filters.locality.trim()
      : undefined;
  let effectiveType =
    filters.type && filters.type !== "all" && filters.type !== "ALL"
      ? filters.type
      : undefined;
  let effectiveGender =
    filters.gender && filters.gender !== "all" && filters.gender !== "ALL"
      ? filters.gender
      : undefined;
  let effectiveSharing =
    filters.sharing && filters.sharing !== "all"
      ? filters.sharing
      : undefined;
  let effectiveBudgetMin = filters.budgetMin;
  let effectiveBudgetMax = filters.budgetMax;
  let remainingSearchText: string | undefined = undefined;
  let suggestedLocality: string | undefined = undefined;
  let appliedLocality: string | undefined = undefined;
  let parsedIntent: ParsedSearchIntent | undefined;

  // 1. Process explicit locality filter with typo tolerance
  if (effectiveLocality) {
    const locMatch = matchLocality(effectiveLocality);
    if (locMatch && locMatch.confidence === "HIGH") {
      effectiveLocality = locMatch.locality.canonicalName;
      appliedLocality = locMatch.locality.canonicalName;
    } else if (locMatch && locMatch.confidence === "MEDIUM") {
      suggestedLocality = locMatch.locality.canonicalName;
    }
  }

  // 2. Process query string (Check property code vs natural language query)
  if (filters.query && filters.query.trim()) {
    const rawQ = filters.query.trim();
    const isPropertyCode = /^PF[-#]?\d+$/i.test(rawQ);

    if (isPropertyCode) {
      remainingSearchText = rawQ;
    } else {
      parsedIntent = parseNaturalSearchQuery(rawQ);

      // Explicit UI filters take priority over inferred query intent
      if (!effectiveType && parsedIntent.inferredType) {
        effectiveType = parsedIntent.inferredType;
      }
      if (!effectiveGender && parsedIntent.inferredGender) {
        effectiveGender = parsedIntent.inferredGender;
      }
      if (!effectiveSharing && parsedIntent.inferredSharing) {
        effectiveSharing = parsedIntent.inferredSharing;
      }
      if (effectiveBudgetMin === undefined && parsedIntent.inferredBudgetMin !== undefined) {
        effectiveBudgetMin = parsedIntent.inferredBudgetMin;
      }
      if (effectiveBudgetMax === undefined && parsedIntent.inferredBudgetMax !== undefined) {
        effectiveBudgetMax = parsedIntent.inferredBudgetMax;
      }

      // Locality resolution
      if (!effectiveLocality) {
        if (parsedIntent.inferredLocality) {
          effectiveLocality = parsedIntent.inferredLocality;
          appliedLocality = parsedIntent.inferredLocality;
        } else if (parsedIntent.unrecognizedLocality) {
          effectiveLocality = parsedIntent.unrecognizedLocality;
        }
      }

      if (!suggestedLocality && parsedIntent.suggestedLocality) {
        suggestedLocality = parsedIntent.suggestedLocality;
      }

      if (parsedIntent.remainingQuery) {
        remainingSearchText = parsedIntent.remainingQuery;
      }
    }
  }

  const where: Prisma.PropertyWhereInput = {
    lifecycleStatus: "PUBLISHED",
  };

  // Search Query: if remaining search text is present, match across name, code, description
  if (remainingSearchText && remainingSearchText.trim()) {
    const q = remainingSearchText.trim();
    const normalizedCode = q.toUpperCase().replace(/^PF-/, "PF#");
    const unhyphenatedCode = q.toUpperCase().replace("-", "#");
    const directHash =
      q.toUpperCase().startsWith("PF") && !q.includes("#") && !q.includes("-")
        ? `PF#${q.slice(2)}`
        : q;

    where.OR = [
      { publicName: { contains: q, mode: "insensitive" } },
      { propertyCode: { contains: q, mode: "insensitive" } },
      { propertyCode: { contains: normalizedCode, mode: "insensitive" } },
      { propertyCode: { contains: unhyphenatedCode, mode: "insensitive" } },
      { propertyCode: { contains: directHash, mode: "insensitive" } },
      { localityZone: { contains: q, mode: "insensitive" } },
      { area: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
    ];
  }

  const andConditions: Prisma.PropertyWhereInput[] = [];

  // Locality / Area filter
  if (effectiveLocality && effectiveLocality.trim()) {
    const loc = effectiveLocality.trim();
    andConditions.push({
      OR: [
        { localityZone: { contains: loc, mode: "insensitive" } },
        { area: { contains: loc, mode: "insensitive" } },
      ],
    });
  }

  // Property Type filter (PG, FLAT, CO_LIVING)
  if (effectiveType && effectiveType !== "all" && effectiveType !== "ALL") {
    where.type = effectiveType as PropertyType;
  }

  // Gender filter (BOYS, GIRLS, CO_ED)
  if (effectiveGender && effectiveGender !== "all" && effectiveGender !== "ALL") {
    where.gender = effectiveGender as GenderCategory;
  }

  // 5. Room Type / Sharing filter (SINGLE, DOUBLE, TRIPLE)
  const roomFilter = filters.sharing?.toUpperCase();
  if (roomFilter === "SINGLE") {
    andConditions.push({
      OR: [
        { singleRoomRent: { not: null, gt: 0 } },
        { rooms: { some: { sharingType: "SINGLE", rent: { gt: 0 } } } },
      ],
    });
  } else if (roomFilter === "DOUBLE") {
    andConditions.push({
      OR: [
        { doubleRoomRent: { not: null, gt: 0 } },
        { rooms: { some: { sharingType: "DOUBLE", rent: { gt: 0 } } } },
      ],
    });
  } else if (roomFilter === "TRIPLE") {
    andConditions.push({
      OR: [
        { tripleRoomRent: { not: null, gt: 0 } },
        { rooms: { some: { sharingType: "TRIPLE", rent: { gt: 0 } } } },
      ],
    });
  }

  // 6. Budget / Rent Filter
  // Business logic:
  // If a specific room type is chosen, filter against that room type's rent.
  // Otherwise, a property matches if AT LEAST ONE available room configuration falls within budget.
  if (filters.budgetMin !== undefined || filters.budgetMax !== undefined) {
    const minVal = filters.budgetMin ?? 0;
    const maxVal = filters.budgetMax;

    if (roomFilter === "SINGLE") {
      andConditions.push({
        OR: [
          {
            singleRoomRent: {
              gte: minVal,
              ...(maxVal ? { lte: maxVal } : {}),
            },
          },
          {
            rooms: {
              some: {
                sharingType: "SINGLE",
                rent: {
                  gte: minVal,
                  ...(maxVal ? { lte: maxVal } : {}),
                },
              },
            },
          },
        ],
      });
    } else if (roomFilter === "DOUBLE") {
      andConditions.push({
        OR: [
          {
            doubleRoomRent: {
              gte: minVal,
              ...(maxVal ? { lte: maxVal } : {}),
            },
          },
          {
            rooms: {
              some: {
                sharingType: "DOUBLE",
                rent: {
                  gte: minVal,
                  ...(maxVal ? { lte: maxVal } : {}),
                },
              },
            },
          },
        ],
      });
    } else if (roomFilter === "TRIPLE") {
      andConditions.push({
        OR: [
          {
            tripleRoomRent: {
              gte: minVal,
              ...(maxVal ? { lte: maxVal } : {}),
            },
          },
          {
            rooms: {
              some: {
                sharingType: "TRIPLE",
                rent: {
                  gte: minVal,
                  ...(maxVal ? { lte: maxVal } : {}),
                },
              },
            },
          },
        ],
      });
    } else {
      // General budget: match if at least one room configuration is in [minVal, maxVal]
      // Property matches if rentMin <= maxVal (at least one room is within ceiling)
      // and rentMax >= minVal (at least one room meets the floor)
      const rentConditions: Prisma.PropertyWhereInput = {};
      if (maxVal) {
        rentConditions.rentMin = { lte: maxVal };
      }
      if (minVal > 0) {
        rentConditions.rentMax = { gte: minVal };
      }
      andConditions.push(rentConditions);
    }
  }

  // 7. Food filter (INCLUDED, AVAILABLE, NOT_AVAILABLE)
  if (filters.food && filters.food !== "all") {
    const foodVal = filters.food.toUpperCase();
    if (foodVal === "INCLUDED" || foodVal === "AVAILABLE" || foodVal === "NOT_AVAILABLE") {
      where.food = foodVal as FoodStatus;
    }
  }

  // 8. Furnished Status filter (FULLY_FURNISHED, SEMI_FURNISHED, UNFURNISHED)
  if (filters.furnishedStatus && filters.furnishedStatus !== "all") {
    const furnVal = filters.furnishedStatus.toUpperCase();
    if (furnVal === "FULLY_FURNISHED" || furnVal === "SEMI_FURNISHED" || furnVal === "UNFURNISHED") {
      where.furnishedStatus = furnVal as FurnishedStatus;
    }
  }

  // 9. Availability filter (AVAILABLE, COMING_SOON)
  if (filters.availabilityStatus && filters.availabilityStatus !== "all") {
    const availVal = filters.availabilityStatus.toUpperCase();
    if (availVal === "AVAILABLE" || availVal === "COMING_SOON") {
      where.availabilityStatus = availVal as AvailabilityStatus;
    }
  }

  // 10. Verified filter (Basera Verified: isVerified === true)
  if (filters.isVerified === true) {
    where.isVerified = true;
  }

  // 11. Distance filter (walking distance max minutes)
  if (filters.distanceMax) {
    where.distanceMin = { lte: filters.distanceMax };
  }

  // 12. College proximity filter
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

  // 13. Amenities filter (AND logic: property must have every selected amenity)
  if (filters.amenities && filters.amenities.length > 0) {
    where.amenities = { hasEvery: filters.amenities };
  }

  if (andConditions.length > 0) {
    where.AND = andConditions;
  }

  // 14. Sorting logic
  let orderBy: Prisma.PropertyOrderByWithRelationInput[] = [{ isFeatured: "desc" }, { rating: "desc" }];
  if (filters.sort === "price_asc") orderBy = [{ rentMin: "asc" }];
  else if (filters.sort === "price_desc") orderBy = [{ rentMin: "desc" }];
  else if (filters.sort === "distance_asc") orderBy = [{ distanceMin: "asc" }];
  else if (filters.sort === "rating_desc") orderBy = [{ rating: "desc" }];
  else if (filters.sort === "newest") orderBy = [{ createdAt: "desc" }];

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

  let zeroResultFallback: SearchV2Metadata["zeroResultFallback"] | undefined;
  let fallbackProperties: PublicPropertyDTO[] | undefined;

  const requestedLocName = appliedLocality || effectiveLocality;

  if (total === 0 && requestedLocName) {
    const nearbyDefs = getNearbyLocalities(requestedLocName);

    if (nearbyDefs.length > 0) {
      // Find published property counts in each genuinely nearby locality
      const nearbyCounts = await Promise.all(
        nearbyDefs.map(async (def) => {
          const count = await prisma.property.count({
            where: {
              lifecycleStatus: "PUBLISHED",
              OR: [
                { localityZone: { contains: def.canonicalName, mode: "insensitive" } },
                { area: { contains: def.canonicalName, mode: "insensitive" } },
              ],
              ...(effectiveType ? { type: effectiveType as PropertyType } : {}),
              ...(effectiveGender ? { gender: effectiveGender as GenderCategory } : {}),
            },
          });
          return { name: def.canonicalName, count };
        })
      );

      const activeNearby = nearbyCounts.filter((item) => item.count > 0);

      if (activeNearby.length > 0) {
        // Fetch top published listings from active nearby areas
        const nearbyNames = activeNearby.map((n) => n.name);
        const rawFallback = await prisma.property.findMany({
          where: {
            lifecycleStatus: "PUBLISHED",
            OR: nearbyNames.flatMap((n) => [
              { localityZone: { contains: n, mode: "insensitive" } },
              { area: { contains: n, mode: "insensitive" } },
            ]),
            ...(effectiveType ? { type: effectiveType as PropertyType } : {}),
            ...(effectiveGender ? { gender: effectiveGender as GenderCategory } : {}),
          },
          orderBy: [{ isFeatured: "desc" }, { rating: "desc" }],
          take: 6,
          include: {
            rooms: true,
            media: { orderBy: { displayOrder: "asc" } },
            collegeDistances: { include: { college: true } },
          },
        });

        fallbackProperties = rawFallback.map((p) => toPublicPropertyDTO(p));
        zeroResultFallback = {
          requestedLocality: requestedLocName,
          hasConfiguredNearby: true,
          nearbyLocalities: activeNearby,
        };
      } else {
        zeroResultFallback = {
          requestedLocality: requestedLocName,
          hasConfiguredNearby: true,
          nearbyLocalities: [],
        };
      }
    } else {
      // Locality not in Basera catalog and has no configured nearby relationship
      zeroResultFallback = {
        requestedLocality: requestedLocName,
        hasConfiguredNearby: false,
        nearbyLocalities: [],
      };
    }
  }

  const searchMeta: SearchV2Metadata = {
    normalizedQuery: parsedIntent?.normalizedQuery,
    inferredIntent: parsedIntent
      ? {
          type: parsedIntent.inferredType,
          gender: parsedIntent.inferredGender,
          sharing: parsedIntent.inferredSharing,
          budgetMin: parsedIntent.inferredBudgetMin,
          budgetMax: parsedIntent.inferredBudgetMax,
          locality: parsedIntent.inferredLocality || parsedIntent.unrecognizedLocality,
        }
      : undefined,
    appliedLocality,
    suggestion: suggestedLocality
      ? {
          locality: suggestedLocality,
          text: suggestedLocality,
        }
      : undefined,
    zeroResultFallback,
  };

  return {
    properties,
    total,
    page,
    totalPages: Math.ceil(total / limit),
    searchMeta,
    fallbackProperties,
  };
}

function normalizePropertyIdentifiers(idOrCode: string) {
  let decoded = idOrCode;
  try {
    decoded = decodeURIComponent(idOrCode);
  } catch {}

  const normalizedCode = decoded.toUpperCase().replace(/^PF-/, "PF#");
  const unhyphenatedCode = decoded.toUpperCase().replace("-", "#");
  const directHash =
    decoded.toUpperCase().startsWith("PF") && !decoded.includes("#") && !decoded.includes("-")
      ? `PF#${decoded.slice(2)}`
      : decoded;

  return {
    raw: idOrCode,
    decoded,
    normalizedCode,
    unhyphenatedCode,
    directHash,
  };
}

export async function getPublicPropertyBySlugOrCode(
  slugOrCode: string
): Promise<PublicPropertyDTO | null> {
  const ids = normalizePropertyIdentifiers(slugOrCode);

  const rawProperty = await prisma.property.findFirst({
    where: {
      OR: [
        { id: ids.raw },
        { id: ids.decoded },
        { slug: ids.raw.toLowerCase() },
        { slug: ids.decoded.toLowerCase() },
        { propertyCode: ids.normalizedCode },
        { propertyCode: ids.unhyphenatedCode },
        { propertyCode: ids.directHash },
        { propertyCode: ids.raw },
        { propertyCode: ids.raw.toUpperCase() },
        { propertyCode: ids.decoded },
        { propertyCode: ids.decoded.toUpperCase() },
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
  const ids = normalizePropertyIdentifiers(idOrCode);

  const rawProperty = await prisma.property.findFirst({
    where: {
      OR: [
        { id: ids.raw },
        { id: ids.decoded },
        { slug: ids.raw.toLowerCase() },
        { slug: ids.decoded.toLowerCase() },
        { propertyCode: ids.normalizedCode },
        { propertyCode: ids.unhyphenatedCode },
        { propertyCode: ids.directHash },
        { propertyCode: ids.raw },
        { propertyCode: ids.raw.toUpperCase() },
        { propertyCode: ids.decoded },
        { propertyCode: ids.decoded.toUpperCase() },
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

export async function updateAdminPropertyService(
  idOrCode: string,
  data: Partial<{
    publicName: string;
    internalPropertyName: string | null;
    type: PropertyType;
    gender: GenderCategory;
    localityZone: string;
    area: string | null;
    exactAddress: string;
    depositAmount: number;
    singleRoomRent: number | null;
    doubleRoomRent: number | null;
    tripleRoomRent: number | null;
    food: FoodStatus | null;
    foodCharges: number | null;
    foodPolicy: string | null;
    electricityCharges: number | null;
    electricityType: ElectricityBillingType | null;
    otherCharges: number | null;
    availableRooms: number | null;
    furnishedStatus: FurnishedStatus | null;
    amenities: string[];
    rules: string[];
    description: string;
    ownerName: string | null;
    ownerPhone: string | null;
    ownerType: OwnerType | null;
    photoDriveLink: string | null;
    availabilityStatus: AvailabilityStatus;
    verificationStatus: VerificationStatus;
    verificationNotes: string | null;
    isVerified: boolean;
    lifecycleStatus: PropertyLifecycle;
    internalAdminNotes: string | null;
  }>
): Promise<AdminPropertyDTO> {
  const normalizedCode = idOrCode.toUpperCase().replace(/^PF-/, "PF#");
  const unhyphenatedCode = idOrCode.toUpperCase().replace("-", "#");
  const directHash =
    idOrCode.toUpperCase().startsWith("PF") && !idOrCode.includes("#") && !idOrCode.includes("-")
      ? `PF#${idOrCode.slice(2)}`
      : idOrCode;

  const existing = await prisma.property.findFirst({
    where: {
      OR: [
        { id: idOrCode },
        { slug: idOrCode.toLowerCase() },
        { propertyCode: normalizedCode },
        { propertyCode: unhyphenatedCode },
        { propertyCode: directHash },
        { propertyCode: idOrCode },
        { propertyCode: idOrCode.toUpperCase() },
      ],
    },
    include: { rooms: true },
  });

  if (!existing) {
    throw new ApiError(404, `Property "${idOrCode}" not found`);
  }

  // Calculate updated rentMin / rentMax if room rents are supplied
  const singleRent = data.singleRoomRent !== undefined ? data.singleRoomRent : (existing.singleRoomRent ? Number(existing.singleRoomRent) : null);
  const doubleRent = data.doubleRoomRent !== undefined ? data.doubleRoomRent : (existing.doubleRoomRent ? Number(existing.doubleRoomRent) : null);
  const tripleRent = data.tripleRoomRent !== undefined ? data.tripleRoomRent : (existing.tripleRoomRent ? Number(existing.tripleRoomRent) : null);

  const validRents = [singleRent, doubleRent, tripleRent].filter(
    (r): r is number => r !== null && r !== undefined && r > 0
  );

  let rentMin = existing.rentMin;
  let rentMax = existing.rentMax;
  if (validRents.length > 0) {
    rentMin = Math.min(...validRents);
    rentMax = Math.max(...validRents);
  }

  const updateData: Prisma.PropertyUpdateInput = {};

  if (data.publicName !== undefined) updateData.publicName = data.publicName;
  if (data.internalPropertyName !== undefined) updateData.internalPropertyName = data.internalPropertyName;
  if (data.type !== undefined) updateData.type = data.type;
  if (data.gender !== undefined) updateData.gender = data.gender;
  if (data.localityZone !== undefined) updateData.localityZone = data.localityZone;
  if (data.area !== undefined) updateData.area = data.area;
  if (data.exactAddress !== undefined) updateData.exactAddress = data.exactAddress;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.amenities !== undefined) updateData.amenities = data.amenities;
  if (data.rules !== undefined) updateData.rules = data.rules;
  if (data.internalAdminNotes !== undefined) updateData.internalAdminNotes = data.internalAdminNotes;
  if (data.ownerName !== undefined) updateData.ownerName = data.ownerName;
  if (data.ownerPhone !== undefined) updateData.ownerPhone = data.ownerPhone;
  if (data.ownerType !== undefined) updateData.ownerType = data.ownerType;
  if (data.photoDriveLink !== undefined) updateData.photoDriveLink = data.photoDriveLink;
  if (data.availableRooms !== undefined) updateData.availableRooms = data.availableRooms;
  if (data.furnishedStatus !== undefined) updateData.furnishedStatus = data.furnishedStatus;
  if (data.food !== undefined) {
    let foodVal: any = data.food;
    if (foodVal === "AVAILABLE_EXTRA") foodVal = "AVAILABLE";
    updateData.food = foodVal;
  }
  if (data.foodPolicy !== undefined) updateData.foodPolicy = data.foodPolicy;
  if (data.electricityType !== undefined) {
    let elecVal: any = data.electricityType;
    if (elecVal === "PER_UNIT") elecVal = "BY_METER";
    if (elecVal === "EXTRA_AS_PER_BILL") elecVal = "EXTRA_AS_PER_USAGE";
    updateData.electricityType = elecVal;
  }
  if (data.availabilityStatus !== undefined) updateData.availabilityStatus = data.availabilityStatus;
  if (data.verificationStatus !== undefined) updateData.verificationStatus = data.verificationStatus;
  if (data.verificationNotes !== undefined) updateData.verificationNotes = data.verificationNotes;
  if (data.lifecycleStatus !== undefined) updateData.lifecycleStatus = data.lifecycleStatus;
  if (data.isVerified !== undefined) {
    updateData.isVerified = data.isVerified;
    if (data.isVerified && !existing.verifiedAt) {
      updateData.verifiedAt = new Date();
    }
  }

  if (data.depositAmount !== undefined) {
    updateData.depositAmount = new Prisma.Decimal(data.depositAmount);
  }
  if (data.singleRoomRent !== undefined) {
    updateData.singleRoomRent = data.singleRoomRent !== null ? new Prisma.Decimal(data.singleRoomRent) : null;
  }
  if (data.doubleRoomRent !== undefined) {
    updateData.doubleRoomRent = data.doubleRoomRent !== null ? new Prisma.Decimal(data.doubleRoomRent) : null;
  }
  if (data.tripleRoomRent !== undefined) {
    updateData.tripleRoomRent = data.tripleRoomRent !== null ? new Prisma.Decimal(data.tripleRoomRent) : null;
  }
  if (data.foodCharges !== undefined) {
    updateData.foodCharges = data.foodCharges !== null ? new Prisma.Decimal(data.foodCharges) : null;
  }
  if (data.electricityCharges !== undefined) {
    updateData.electricityCharges = data.electricityCharges !== null ? new Prisma.Decimal(data.electricityCharges) : null;
  }
  if (data.otherCharges !== undefined) {
    updateData.otherCharges = data.otherCharges !== null ? new Prisma.Decimal(data.otherCharges) : null;
  }

  updateData.rentMin = rentMin;
  updateData.rentMax = rentMax;

  const updated = await prisma.property.update({
    where: { id: existing.id },
    data: updateData,
    include: {
      rooms: true,
      media: { orderBy: { displayOrder: "asc" } },
      collegeDistances: { include: { college: true } },
    },
  });

  return toAdminPropertyDTO(updated);
}
