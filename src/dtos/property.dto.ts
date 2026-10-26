import type { Property, RoomInventory, PropertyMedia, College } from "@prisma/client";

export interface PublicPropertyDTO {
  id: string;
  propertyCode: string; 
  slug: string;         
  publicName: string;
  type: string;
  gender: string;
  localityZone: string;
  area: string;
  rentMin: number;
  rentMax: number;
  depositAmount: number;
  depositPolicy?: string | null;
  singleRoomRent?: number | null;
  doubleRoomRent?: number | null;
  tripleRoomRent?: number | null;
  food?: string | null;
  foodCharges?: number | null;
  foodPolicy: string | null;
  electricityCharges?: number | null;
  electricityType?: string | null;
  electricityDisplay?: string | null;
  electricityDetails?: Record<string, unknown> | null;
  otherCharges?: number | null;
  availableRooms?: number | null;
  furnishedStatus?: string | null;
  distanceMin: number;
  distanceText: string;
  description: string;
  rules: string[];
  houseRules: string[];
  securityDetails: string | null;
  amenities: string[];
  isFeatured: boolean;
  isVerified: boolean;
  verifiedAt: Date | null;
  availabilityStatus: string;
  rating: number;
  reviewCount: number;
  rooms: {
    id: string;
    label: string;
    sharingType: string;
    occupancyText: string;
    rent: number;
    deposit: number;
    availableUnits: number;
    totalUnits?: number;
  }[];
  media: {
    id: string;
    mediaUrl: string;
    isPrimary: boolean;
    displayOrder: number;
    altText?: string | null;
  }[];
  nearbyColleges?: {
    collegeId: string;
    collegeName: string;
    distanceMinutes: number;
    walkingDistanceM?: number | null;
  }[];
}

export interface AdminPropertyDTO extends Omit<PublicPropertyDTO, "media"> {
  internalPropertyName: string | null;
  exactAddress: string;
  latitude: number | null;
  longitude: number | null;
  ownerName: string | null;
  ownerPhone: string | null;
  ownerAlternatePhone: string | null;
  ownerType: string | null;
  photoDriveLink: string | null;
  verificationStatus: string;
  verificationNotes: string | null;
  internalSource: string | null;
  internalAdminNotes: string | null;
  lifecycleStatus: string;
  verificationChecklist: Record<string, unknown> | null;
  media: {
    id: string;
    mediaUrl: string;
    isPrimary: boolean;
    displayOrder: number;
    altText?: string | null;
    storageProvider?: string;
    storageKey?: string | null;
    fileSize?: number | null;
    width?: number | null;
    height?: number | null;
    createdAt?: Date;
  }[];
  createdAt: Date;
  updatedAt: Date;
}

export type PropertyWithRelations = Property & {
  rooms?: RoomInventory[];
  media?: PropertyMedia[];
  collegeDistances?: {
    distanceMinutes: number;
    walkingDistanceM?: number | null;
    college: College;
  }[];
};

/**
 * Formats verified college-distance records into standard comma-separated text
 * e.g., "2 km from Hansraj College, 3 km from Miranda House"
 */
export function formatCollegeDistances(
  records?: Array<{
    college: { name: string; shortCode?: string };
    distanceMinutes?: number | null;
    walkingDistanceM?: number | null;
  }> | null
): string | null {
  if (!records || records.length === 0) {
    return null;
  }

  const parts = records
    .map((record) => {
      const collegeName = record.college?.name;
      if (!collegeName) return null;
      if (record.walkingDistanceM && record.walkingDistanceM > 0) {
        if (record.walkingDistanceM >= 1000) {
          const km = (record.walkingDistanceM / 1000).toFixed(1).replace(/\.0$/, "");
          return `${km} km from ${collegeName}`;
        }
        return `${record.walkingDistanceM} m from ${collegeName}`;
      }
      if (record.distanceMinutes && record.distanceMinutes > 0) {
        return `${record.distanceMinutes} min walk from ${collegeName}`;
      }
      return null;
    })
    .filter((text): text is string => Boolean(text));

  return parts.length > 0 ? parts.join(", ") : null;
}

function normalizeLocalityName(loc?: string | null): string {
  if (!loc) return "";
  const trimmed = loc.trim();
  const unspaced = trimmed.toLowerCase().replace(/[\s-]+/g, "");
  if (unspaced === "vijaynagar") return "Vijay Nagar";
  return trimmed;
}

function normalizePublicListingTitle(title?: string | null): string {
  if (!title) return "";
  return title.replace(/\bVijaynagar\b/gi, "Vijay Nagar");
}

export function toPublicPropertyDTO(prop: PropertyWithRelations): PublicPropertyDTO {
  const rawDeposit = prop.depositAmount ? Number(prop.depositAmount) : 0;
  const depositNum =
    rawDeposit > 0
      ? rawDeposit
      : prop.depositPolicy === "ONE_MONTH_RENT" && prop.rentMin > 0
      ? prop.rentMin
      : 0;
  const singleRent = prop.singleRoomRent ? Number(prop.singleRoomRent) : null;
  const doubleRent = prop.doubleRoomRent ? Number(prop.doubleRoomRent) : null;
  const tripleRent = prop.tripleRoomRent ? Number(prop.tripleRoomRent) : null;
  const foodChargesNum = prop.foodCharges ? Number(prop.foodCharges) : null;
  const electricityChargesNum = prop.electricityCharges ? Number(prop.electricityCharges) : null;
  const otherChargesNum = prop.otherCharges ? Number(prop.otherCharges) : null;

  const verifiedDistanceText = formatCollegeDistances(prop.collegeDistances);
  const verifiedMinMinutes = prop.collegeDistances?.length
    ? Math.min(...prop.collegeDistances.map((cd) => cd.distanceMinutes).filter((m) => m > 0))
    : 0;
  const publicDistanceText = verifiedDistanceText || "College distances coming soon";
  const publicDistanceMin = Number.isFinite(verifiedMinMinutes) && verifiedMinMinutes > 0 ? verifiedMinMinutes : 0;

  return {
    id: prop.id,
    propertyCode: prop.propertyCode,
    slug: prop.slug,
    publicName: normalizePublicListingTitle(prop.publicName),
    type: prop.type,
    gender: prop.gender,
    localityZone: normalizeLocalityName(prop.localityZone),
    area: prop.area ? normalizeLocalityName(prop.area) : normalizeLocalityName(prop.localityZone),
    rentMin: prop.rentMin,
    rentMax: prop.rentMax,
    depositAmount: depositNum,
    depositPolicy: prop.depositPolicy || null,
    singleRoomRent: singleRent,
    doubleRoomRent: doubleRent,
    tripleRoomRent: tripleRent,
    food: prop.food || null,
    foodCharges: foodChargesNum,
    foodPolicy: prop.foodPolicy,
    electricityCharges: electricityChargesNum,
    electricityType: prop.electricityType || null,
    electricityDisplay:
      prop.electricityDetails &&
      typeof prop.electricityDetails === "object" &&
      "displayDescription" in prop.electricityDetails &&
      typeof (prop.electricityDetails as any).displayDescription === "string"
        ? (prop.electricityDetails as any).displayDescription
        : prop.electricityCharges
        ? (Number(prop.electricityCharges) > 50
            ? `₹${Number(prop.electricityCharges).toLocaleString("en-IN")}/mo`
            : `₹${Number(prop.electricityCharges)}/unit`)
        : prop.electricityType === "INCLUDED"
        ? "Included in rent"
        : prop.electricityType === "BY_METER"
        ? "As per meter"
        : "Electricity charges not specified",
    electricityDetails: (prop.electricityDetails as Record<string, unknown>) ?? null,
    otherCharges: otherChargesNum,
    availableRooms: prop.availableRooms ?? (prop.rooms ? prop.rooms.reduce((acc, r) => acc + r.availableUnits, 0) : 1),
    furnishedStatus: prop.furnishedStatus || null,
    distanceMin: publicDistanceMin,
    distanceText: publicDistanceText,
    description: prop.description,
    rules: prop.rules,
    houseRules: prop.rules,
    securityDetails: prop.securityDetails,
    amenities: prop.amenities,
    isFeatured: prop.isFeatured,
    isVerified: prop.isVerified,
    verifiedAt: prop.verifiedAt,
    availabilityStatus: prop.availabilityStatus,
    rating: prop.rating,
    reviewCount: prop.reviewCount,
    rooms:
      prop.rooms?.map((r) => ({
        id: r.id,
        label: r.label,
        sharingType: r.sharingType,
        occupancyText: r.occupancyText,
        rent: r.rent,
        deposit: r.deposit,
        availableUnits: r.availableUnits,
        totalUnits: r.totalUnits,
      })) ?? [],
    media:
      prop.media?.map((m) => ({
        id: m.id,
        mediaUrl: m.mediaUrl,
        mediaType: m.mediaType ?? "image",
        isPrimary: m.isPrimary,
        displayOrder: m.displayOrder,
        altText: m.altText ?? null,
      })) ?? [],
    nearbyColleges:
      prop.collegeDistances?.map((cd) => ({
        collegeId: cd.college.id,
        collegeName: cd.college.name,
        distanceMinutes: cd.distanceMinutes,
        walkingDistanceM: cd.walkingDistanceM ?? null,
      })) ?? [],
  };
}

export function toAdminPropertyDTO(prop: PropertyWithRelations): AdminPropertyDTO {
  const publicDTO = toPublicPropertyDTO(prop);
  return {
    ...publicDTO,
    internalPropertyName: prop.internalPropertyName,
    exactAddress: prop.exactAddress,
    latitude: prop.latitude,
    longitude: prop.longitude,
    ownerName: prop.ownerName,
    ownerPhone: prop.ownerPhone,
    ownerAlternatePhone: prop.ownerAlternatePhone,
    ownerType: prop.ownerType || null,
    photoDriveLink: prop.photoDriveLink || null,
    verificationStatus: prop.verificationStatus,
    verificationNotes: prop.verificationNotes || null,
    internalSource: prop.internalSource,
    internalAdminNotes: prop.internalAdminNotes,
    lifecycleStatus: prop.lifecycleStatus,
    verificationChecklist: (prop.verificationChecklist as Record<string, unknown>) ?? null,
    media:
      prop.media?.map((m) => ({
        id: m.id,
        mediaUrl: m.mediaUrl,
        isPrimary: m.isPrimary,
        displayOrder: m.displayOrder,
        altText: m.altText ?? null,
        storageProvider: m.storageProvider,
        storageKey: m.storageKey,
        fileSize: m.fileSize,
        width: m.width,
        height: m.height,
        createdAt: m.createdAt,
      })) ?? [],
    createdAt: prop.createdAt,
    updatedAt: prop.updatedAt,
  };
}
