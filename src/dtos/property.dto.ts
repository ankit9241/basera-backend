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
  singleRoomRent?: number | null;
  doubleRoomRent?: number | null;
  tripleRoomRent?: number | null;
  food?: string | null;
  foodCharges?: number | null;
  foodPolicy: string | null;
  electricityCharges?: number | null;
  electricityType?: string | null;
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
    college: College;
  }[];
};

export function toPublicPropertyDTO(prop: PropertyWithRelations): PublicPropertyDTO {
  const depositNum = prop.depositAmount ? Number(prop.depositAmount) : 0;
  const singleRent = prop.singleRoomRent ? Number(prop.singleRoomRent) : null;
  const doubleRent = prop.doubleRoomRent ? Number(prop.doubleRoomRent) : null;
  const tripleRent = prop.tripleRoomRent ? Number(prop.tripleRoomRent) : null;
  const foodChargesNum = prop.foodCharges ? Number(prop.foodCharges) : null;
  const electricityChargesNum = prop.electricityCharges ? Number(prop.electricityCharges) : null;
  const otherChargesNum = prop.otherCharges ? Number(prop.otherCharges) : null;

  return {
    id: prop.id,
    propertyCode: prop.propertyCode,
    slug: prop.slug,
    publicName: prop.publicName,
    type: prop.type,
    gender: prop.gender,
    localityZone: prop.localityZone,
    area: prop.area || prop.localityZone,
    rentMin: prop.rentMin,
    rentMax: prop.rentMax,
    depositAmount: depositNum,
    singleRoomRent: singleRent,
    doubleRoomRent: doubleRent,
    tripleRoomRent: tripleRent,
    food: prop.food || null,
    foodCharges: foodChargesNum,
    foodPolicy: prop.foodPolicy,
    electricityCharges: electricityChargesNum,
    electricityType: prop.electricityType || null,
    otherCharges: otherChargesNum,
    availableRooms: prop.availableRooms ?? (prop.rooms ? prop.rooms.reduce((acc, r) => acc + r.availableUnits, 0) : 1),
    furnishedStatus: prop.furnishedStatus || null,
    distanceMin: prop.distanceMin,
    distanceText: prop.distanceText,
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
        isPrimary: m.isPrimary,
        displayOrder: m.displayOrder,
        altText: m.altText ?? null,
      })) ?? [],
    nearbyColleges:
      prop.collegeDistances?.map((cd) => ({
        collegeId: cd.college.id,
        collegeName: cd.college.name,
        distanceMinutes: cd.distanceMinutes,
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
