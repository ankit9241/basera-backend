import type { Property, RoomInventory, PropertyMedia, College } from "@prisma/client";

export interface PublicPropertyDTO {
  id: string;
  propertyCode: string; 
  slug: string;         
  publicName: string;
  type: string;
  gender: string;
  localityZone: string;
  rentMin: number;
  rentMax: number;
  depositAmount: number;
  distanceMin: number;
  distanceText: string;
  description: string;
  rules: string[];
  foodPolicy: string | null;
  securityDetails: string | null;
  amenities: string[];
  isFeatured: boolean;
  isVerified: boolean;
  verifiedAt: Date | null;
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
  }[];
  media: {
    id: string;
    mediaUrl: string;
    isPrimary: boolean;
    displayOrder: number;
  }[];
  nearbyColleges?: {
    collegeId: string;
    collegeName: string;
    distanceMinutes: number;
  }[];
}

export interface AdminPropertyDTO extends PublicPropertyDTO {
  internalPropertyName: string | null;
  exactAddress: string;
  latitude: number | null;
  longitude: number | null;
  ownerName: string | null;
  ownerPhone: string | null;
  ownerAlternatePhone: string | null;
  internalSource: string | null;
  internalAdminNotes: string | null;
  lifecycleStatus: string;
  verificationChecklist: Record<string, unknown> | null;
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
  return {
    id: prop.id,
    propertyCode: prop.propertyCode,
    slug: prop.slug,
    publicName: prop.publicName,
    type: prop.type,
    gender: prop.gender,
    localityZone: prop.localityZone,
    rentMin: prop.rentMin,
    rentMax: prop.rentMax,
    depositAmount: prop.depositAmount,
    distanceMin: prop.distanceMin,
    distanceText: prop.distanceText,
    description: prop.description,
    rules: prop.rules,
    foodPolicy: prop.foodPolicy,
    securityDetails: prop.securityDetails,
    amenities: prop.amenities,
    isFeatured: prop.isFeatured,
    isVerified: prop.isVerified,
    verifiedAt: prop.verifiedAt,
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
      })) ?? [],
    media:
      prop.media?.map((m) => ({
        id: m.id,
        mediaUrl: m.mediaUrl,
        isPrimary: m.isPrimary,
        displayOrder: m.displayOrder,
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
    internalSource: prop.internalSource,
    internalAdminNotes: prop.internalAdminNotes,
    lifecycleStatus: prop.lifecycleStatus,
    verificationChecklist: (prop.verificationChecklist as Record<string, unknown>) ?? null,
    createdAt: prop.createdAt,
    updatedAt: prop.updatedAt,
  };
}
