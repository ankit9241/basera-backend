import prisma from "../../lib/prisma";
import { z } from "zod";
import { PropertyType, GenderCategory, SharingType, PropertyLifecycle } from "@prisma/client";

export const bulkRowSchema = z.object({
  publicName: z.string().min(2, "Public name required"),
  type: z.enum(["PG", "FLAT", "CO_LIVING"]),
  gender: z.enum(["GIRLS", "BOYS", "CO_ED"]),
  localityZone: z.string().min(2, "Locality required"),
  rentMin: z.coerce.number().positive("Rent min must be positive"),
  rentMax: z.coerce.number().positive("Rent max must be positive"),
  depositAmount: z.coerce.number().nonnegative(),
  distanceMin: z.coerce.number().int().nonnegative(),
  distanceText: z.string().min(3),
  description: z.string().min(10),
  exactAddress: z.string().min(5, "Exact address required for admin records"),
  ownerName: z.string().optional(),
  ownerPhone: z.string().optional(),
  amenities: z.string().optional(), 
  singleRoomRent: z.coerce.number().optional(),
  doubleRoomRent: z.coerce.number().optional(),
  tripleRoomRent: z.coerce.number().optional(),
});

export type BulkRowInput = z.infer<typeof bulkRowSchema>;

export interface RowError {
  row: number;
  field?: string;
  message: string;
}

export interface IngestionResult {
  totalRows: number;
  validCount: number;
  errorCount: number;
  errors: RowError[];
  importedCodes: string[];
}

export async function processBulkPropertyRows(
  rows: Record<string, unknown>[],
  commit = false
): Promise<IngestionResult> {
  const errors: RowError[] = [];
  const validRows: BulkRowInput[] = [];

  rows.forEach((raw, idx) => {
    const rowNum = idx + 2; 
    const parseRes = bulkRowSchema.safeParse(raw);
    if (!parseRes.success) {
      parseRes.error.errors.forEach((err) => {
        errors.push({
          row: rowNum,
          field: err.path.join("."),
          message: err.message,
        });
      });
    } else {
      validRows.push(parseRes.data);
    }
  });

  const importedCodes: string[] = [];

  if (commit && validRows.length > 0) {
    const lastProperty = await prisma.property.findFirst({
      orderBy: { createdAt: "desc" },
      select: { propertyCode: true },
    });

    let currentNum = 100;
    if (lastProperty?.propertyCode) {
      const match = lastProperty.propertyCode.match(/\d+/);
      if (match) currentNum = Math.max(currentNum, parseInt(match[0]!, 10));
    }

    await prisma.$transaction(async (tx) => {
      for (const item of validRows) {
        currentNum += 1;
        const code = `PF#${currentNum}`;
        const slug = `pf-${currentNum}-${item.localityZone.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

        const amenityList = item.amenities
          ? item.amenities.split(",").map((a) => a.trim()).filter(Boolean)
          : ["Wi-Fi", "Housekeeping"];

        const prop = await tx.property.create({
          data: {
            propertyCode: code,
            slug,
            publicName: item.publicName,
            type: item.type as PropertyType,
            gender: item.gender as GenderCategory,
            localityZone: item.localityZone,
            rentMin: item.rentMin,
            rentMax: item.rentMax,
            depositAmount: item.depositAmount,
            distanceMin: item.distanceMin,
            distanceText: item.distanceText,
            description: item.description,
            exactAddress: item.exactAddress,
            ownerName: item.ownerName || null,
            ownerPhone: item.ownerPhone || null,
            amenities: amenityList,
            lifecycleStatus: PropertyLifecycle.PUBLISHED,
            isVerified: false,
          },
        });

        if (item.singleRoomRent) {
          await tx.roomInventory.create({
            data: {
              propertyId: prop.id,
              label: "Single room",
              sharingType: SharingType.SINGLE,
              occupancyText: "1 student",
              rent: item.singleRoomRent,
              deposit: Math.round(item.singleRoomRent * 1.5),
              totalUnits: 4,
              availableUnits: 2,
            },
          });
        }

        if (item.doubleRoomRent) {
          await tx.roomInventory.create({
            data: {
              propertyId: prop.id,
              label: "Double sharing",
              sharingType: SharingType.DOUBLE,
              occupancyText: "2 students",
              rent: item.doubleRoomRent,
              deposit: Math.round(item.doubleRoomRent * 1.5),
              totalUnits: 6,
              availableUnits: 3,
            },
          });
        }

        importedCodes.push(code);
      }
    });
  }

  return {
    totalRows: rows.length,
    validCount: validRows.length,
    errorCount: errors.length,
    errors,
    importedCodes,
  };
}
