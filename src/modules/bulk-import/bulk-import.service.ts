import prisma from "../../lib/prisma";
import {
  Prisma,
  PropertyType,
  GenderCategory,
  SharingType,
  PropertyLifecycle,
  FoodStatus,
  ElectricityBillingType,
  FurnishedStatus,
  OwnerType,
  AvailabilityStatus,
  VerificationStatus,
} from "@prisma/client";
import { parseCsvDetailed, resolveCanonicalHeader } from "./csv-parser";

/**
 * Normalizes an arbitrary object's keys to canonical keys via the alias resolver.
 */
function normalizeRawRow(raw: Record<string, unknown>): Record<string, unknown> {
  const norm: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    const canonical = resolveCanonicalHeader(k);
    const key = canonical
      ? canonical.toLowerCase().replace(/[^a-z0-9]/g, "")
      : k.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    norm[key] = typeof v === "string" ? v.trim() : v;
  }
  return norm;
}

/**
 * Safely parses currency or numbers, removing currency signs (₹, Rs, etc.), commas, and whitespace.
 * Returns { value: number | null, error?: string }
 */
function cleanNumericAmount(
  val: unknown,
  fieldName: string,
  options: { allowNegative?: boolean; integerOnly?: boolean; defaultValue?: number | null } = {}
): { value: number | null; error?: string } {
  if (val === undefined || val === null || String(val).trim() === "") {
    return { value: options.defaultValue !== undefined ? options.defaultValue : null };
  }

  let s = String(val).trim();
  // Strip currency symbols (₹, $, €, £, Rs, Rs., INR, /-)
  s = s.replace(/^[₹\$\€\£]\s*/, "");
  s = s.replace(/^Rs\.?\s*/i, "");
  s = s.replace(/^INR\s*/i, "");
  s = s.replace(/\s*\/-$/, "");
  s = s.replace(/,/g, ""); // Remove commas e.g. 15,000 -> 15000
  s = s.replace(/\s+/g, ""); // Remove whitespace e.g. 15 000 -> 15000

  if (s === "") {
    return { value: options.defaultValue !== undefined ? options.defaultValue : null };
  }

  const num = Number(s);
  if (isNaN(num)) {
    return { value: null, error: `${fieldName}: "${val}" is not a valid amount.` };
  }

  if (!options.allowNegative && num < 0) {
    return { value: null, error: `${fieldName} cannot be negative.` };
  }

  if (options.integerOnly && !Number.isInteger(num)) {
    return { value: null, error: `${fieldName} must be a whole number.` };
  }

  return { value: num };
}

// ---------------------------------------------------------------------------
// ENUM NORMALIZERS
// ---------------------------------------------------------------------------

function normalizePropertyType(val: unknown): { value: PropertyType; error?: string } {
  if (!val || String(val).trim() === "") return { value: PropertyType.PG };
  const s = String(val).toUpperCase().replace(/[^A-Z0-9_]/g, "");

  if (s === "PG" || s.includes("PAYINGGUEST") || s.includes("HOSTEL")) {
    return { value: PropertyType.PG };
  }
  if (s === "FLAT" || s.includes("APARTMENT") || s === "1BHK" || s === "2BHK" || s === "3BHK") {
    return { value: PropertyType.FLAT };
  }
  if (s.includes("COLIVING") || s.includes("SHARED") || s.includes("CO_LIVING")) {
    return { value: PropertyType.CO_LIVING };
  }

  return {
    value: PropertyType.PG,
    error: `Invalid Listing Type: "${val}". Allowed: PG, Flat, Co-living`,
  };
}

function normalizeGender(val: unknown): { value: GenderCategory; error?: string } {
  if (!val || String(val).trim() === "") return { value: GenderCategory.CO_ED };
  const s = String(val).toUpperCase().replace(/[^A-Z]/g, "");

  if (s.includes("GIRL") || s.includes("FEMALE") || s.includes("WOMEN") || s.includes("LADIES") || s === "F") {
    return { value: GenderCategory.GIRLS };
  }
  if (s.includes("BOY") || s.includes("MALE") || s.includes("MEN") || s.includes("GENTS") || s === "M") {
    return { value: GenderCategory.BOYS };
  }
  if (s.includes("COED") || s.includes("UNISEX") || s.includes("ANY") || s.includes("BOTH") || s.includes("ALL")) {
    return { value: GenderCategory.CO_ED };
  }

  return {
    value: GenderCategory.CO_ED,
    error: `Invalid Gender: "${val}". Allowed: Boys, Girls, Co-ed`,
  };
}

function normalizeFoodStatus(val: unknown): { value: FoodStatus; error?: string } {
  if (!val || String(val).trim() === "") return { value: FoodStatus.NOT_AVAILABLE };
  const s = String(val).toUpperCase();

  if (s.includes("INCLUDED") || s.includes("YES") || s.includes("FREE") || s.includes("INCLUSIVE") || s.includes("WITH FOOD")) {
    return { value: FoodStatus.INCLUDED };
  }
  if (s.includes("AVAIL") || s.includes("OPTIONAL") || s.includes("EXTRA") || s.includes("ON DEMAND") || s.includes("PAID")) {
    return { value: FoodStatus.AVAILABLE };
  }
  if (s.includes("NOT") || s.includes("NO") || s.includes("NONE") || s.includes("NIL") || s === "NA" || s === "N/A") {
    return { value: FoodStatus.NOT_AVAILABLE };
  }

  return {
    value: FoodStatus.NOT_AVAILABLE,
    error: `Invalid Food status: "${val}". Allowed: Included, Available, Not Available`,
  };
}

function normalizeFurnishedStatus(val: unknown): { value: FurnishedStatus; error?: string } {
  if (!val || String(val).trim() === "") return { value: FurnishedStatus.FULLY_FURNISHED };
  const s = String(val).toUpperCase();

  if (s.includes("SEMI") || s.includes("PARTIAL")) {
    return { value: FurnishedStatus.SEMI_FURNISHED };
  }
  if (s.includes("UN") || s.includes("NO") || s.includes("BARE") || s.includes("NONE")) {
    return { value: FurnishedStatus.UNFURNISHED };
  }
  if (s.includes("FULL") || s.includes("YES") || s === "FURNISHED") {
    return { value: FurnishedStatus.FULLY_FURNISHED };
  }

  return {
    value: FurnishedStatus.FULLY_FURNISHED,
    error: `Invalid Furnished Status: "${val}". Allowed: Fully Furnished, Semi Furnished, Unfurnished`,
  };
}

function normalizeOwnerType(val: unknown): { value: OwnerType; error?: string } {
  if (!val || String(val).trim() === "") return { value: OwnerType.LANDLORD };
  const s = String(val).toUpperCase();

  if (s.includes("CARE") || s.includes("WARDEN")) {
    return { value: OwnerType.CARETAKER };
  }
  if (s.includes("MANAGER") || s.includes("OPERATOR") || s.includes("MANAGEMENT")) {
    return { value: OwnerType.PROPERTY_MANAGER };
  }
  if (s.includes("BROKER") || s.includes("AGENT") || s.includes("DEALER")) {
    return { value: OwnerType.BROKER };
  }
  if (s.includes("LANDLORD") || s.includes("OWNER") || s.includes("INDIVIDUAL")) {
    return { value: OwnerType.LANDLORD };
  }

  return {
    value: OwnerType.LANDLORD,
    error: `Invalid Owner Type: "${val}". Allowed: Landlord, Caretaker, Property Manager, Broker`,
  };
}

function normalizeAvailabilityStatus(val: unknown): { value: AvailabilityStatus; error?: string } {
  if (!val || String(val).trim() === "") return { value: AvailabilityStatus.AVAILABLE };
  const s = String(val).toUpperCase();

  if (s.includes("OCCUPIED") || s.includes("FULL") || s.includes("BOOKED")) {
    return { value: AvailabilityStatus.OCCUPIED };
  }
  if (s.includes("SOON") || s.includes("UPCOMING")) {
    return { value: AvailabilityStatus.COMING_SOON };
  }
  if (s.includes("MAINT") || s.includes("REPAIR") || s.includes("RENOVAT")) {
    return { value: AvailabilityStatus.UNDER_MAINTENANCE };
  }
  if (s.includes("PAUS") || s.includes("HOLD") || s.includes("INACTIVE")) {
    return { value: AvailabilityStatus.PAUSED };
  }
  if (s.includes("AVAIL") || s.includes("OPEN") || s.includes("VACANT") || s.includes("READY")) {
    return { value: AvailabilityStatus.AVAILABLE };
  }

  return {
    value: AvailabilityStatus.AVAILABLE,
    error: `Invalid Availability Status: "${val}". Allowed: Available, Occupied, Coming Soon, Under Maintenance, Paused`,
  };
}

function normalizeVerificationStatus(val: unknown): { value: VerificationStatus; error?: string } {
  if (!val || String(val).trim() === "") return { value: VerificationStatus.PENDING };
  const s = String(val).toUpperCase();

  if (s.includes("VERIF") || s.includes("APPROV")) {
    return { value: VerificationStatus.VERIFIED };
  }
  if (s.includes("REVIEW") || s.includes("IN_REVIEW")) {
    return { value: VerificationStatus.IN_REVIEW };
  }
  if (s.includes("REJECT") || s.includes("DECLIN")) {
    return { value: VerificationStatus.REJECTED };
  }
  if (s.includes("PEND") || s.includes("DRAFT") || s.includes("NEW")) {
    return { value: VerificationStatus.PENDING };
  }

  return {
    value: VerificationStatus.PENDING,
    error: `Invalid Verification Status: "${val}". Allowed: Verified, In Review, Pending, Rejected`,
  };
}

function normalizeElectricity(
  rawElec: unknown
): { type: ElectricityBillingType | null; charges: number | null; error?: string } {
  if (rawElec === undefined || rawElec === null || String(rawElec).trim() === "") {
    return { type: null, charges: null };
  }

  const elecVal = String(rawElec).trim();
  const upper = elecVal.toUpperCase();

  if (upper.includes("INCLUDED") || upper === "FREE") {
    return { type: ElectricityBillingType.INCLUDED, charges: 0 };
  }

  if (upper.includes("METER") || upper.includes("UNIT") || upper.includes("/UNIT")) {
    const numClean = cleanNumericAmount(elecVal.replace(/[^0-9.]/g, ""), "Electricity Charges");
    return {
      type: ElectricityBillingType.BY_METER,
      charges: numClean.value !== null ? numClean.value : null,
    };
  }

  if (upper.includes("USAGE") || upper.includes("BILL")) {
    const numClean = cleanNumericAmount(elecVal.replace(/[^0-9.]/g, ""), "Electricity Charges");
    return {
      type: ElectricityBillingType.EXTRA_AS_PER_USAGE,
      charges: numClean.value !== null ? numClean.value : null,
    };
  }

  const numClean = cleanNumericAmount(elecVal, "Electricity Charges");
  if (numClean.value !== null) {
    return {
      type: ElectricityBillingType.FIXED_MONTHLY,
      charges: numClean.value,
    };
  }

  return {
    type: ElectricityBillingType.FIXED_MONTHLY,
    charges: null,
  };
}

// ---------------------------------------------------------------------------
// TYPES & INTERFACES
// ---------------------------------------------------------------------------

export interface ParsedBulkRow {
  propertyCode?: string;
  publicName: string;
  type: PropertyType;
  gender: GenderCategory;
  area: string;
  exactAddress: string;
  depositAmount: number;
  singleRoomRent: number | null;
  doubleRoomRent: number | null;
  tripleRoomRent: number | null;
  food: FoodStatus;
  foodCharges: number | null;
  electricityCharges: number | null;
  electricityType: ElectricityBillingType | null;
  otherCharges: number | null;
  availableRooms: number;
  furnishedStatus: FurnishedStatus;
  amenities: string[];
  rules: string[];
  ownerName: string | null;
  ownerPhone: string | null;
  ownerType: OwnerType;
  availabilityStatus: AvailabilityStatus;
  photoDriveLink: string | null;
  verificationStatus: VerificationStatus;
  verificationNotes: string | null;
  rentMin: number;
  rentMax: number;
  description: string;
}

export interface RowError {
  row: number;
  field?: string;
  message: string;
}

export interface RowChange {
  field: string;
  from: string | number | null;
  to: string | number | null;
}

export interface RowAction {
  row: number;
  propertyCode: string;
  publicName: string;
  action: "NEW" | "UPDATE" | "UNCHANGED" | "ERROR";
  changes?: RowChange[];
  error?: string;
}

export interface IngestionResult {
  totalRows: number;
  validCount: number;
  newCount: number;
  updateCount: number;
  unchangedCount: number;
  errorCount: number;
  errors: RowError[];
  rowActions: RowAction[];
  importedCodes: string[];
  updatedCodes: string[];
  unknownHeaders?: string[];
  warnings?: string[];
}

/**
 * Compares incoming row against existing DB property and returns changed fields.
 */
function diffPropertyFields(existing: any, incoming: ParsedBulkRow): RowChange[] {
  const changes: RowChange[] = [];

  const check = (field: string, oldVal: any, newVal: any) => {
    const formattedOld = oldVal === undefined || oldVal === null ? null : oldVal;
    const formattedNew = newVal === undefined || newVal === null ? null : newVal;
    if (String(formattedOld ?? "") !== String(formattedNew ?? "")) {
      changes.push({ field, from: formattedOld, to: formattedNew });
    }
  };

  check("Public Name", existing.publicName, incoming.publicName);
  check("Listing Type", existing.type, incoming.type);
  check("Gender", existing.gender, incoming.gender);
  check("Area", existing.area || existing.localityZone, incoming.area);
  check("Exact Address", existing.exactAddress, incoming.exactAddress);
  check("Deposit Amount", existing.depositAmount ? Number(existing.depositAmount) : 0, incoming.depositAmount);
  check("Single Room Rent", existing.singleRoomRent ? Number(existing.singleRoomRent) : null, incoming.singleRoomRent);
  check("Double Room Rent", existing.doubleRoomRent ? Number(existing.doubleRoomRent) : null, incoming.doubleRoomRent);
  check("Triple Room Rent", existing.tripleRoomRent ? Number(existing.tripleRoomRent) : null, incoming.tripleRoomRent);
  check("Food", existing.food, incoming.food);
  check("Food Charges", existing.foodCharges ? Number(existing.foodCharges) : null, incoming.foodCharges);
  check("Electricity Charges", existing.electricityCharges ? Number(existing.electricityCharges) : null, incoming.electricityCharges);
  check("Electricity Type", existing.electricityType, incoming.electricityType);
  check("Other Charges", existing.otherCharges ? Number(existing.otherCharges) : null, incoming.otherCharges);
  check("Available Rooms", existing.availableRooms, incoming.availableRooms);
  check("Furnished Status", existing.furnishedStatus, incoming.furnishedStatus);
  check("Owner Name", existing.ownerName, incoming.ownerName);
  check("Owner Phone", existing.ownerPhone, incoming.ownerPhone);
  check("Owner Type", existing.ownerType, incoming.ownerType);
  check("Availability Status", existing.availabilityStatus, incoming.availabilityStatus);
  check("Verification Status", existing.verificationStatus, incoming.verificationStatus);
  check("Verification Notes", existing.verificationNotes, incoming.verificationNotes);
  check("Photos / Drive Link", existing.photoDriveLink, incoming.photoDriveLink);

  // Compare amenities array
  const oldAmenities = (existing.amenities || []).slice().sort().join(", ");
  const newAmenities = incoming.amenities.slice().sort().join(", ");
  if (oldAmenities !== newAmenities) {
    changes.push({ field: "Amenities", from: oldAmenities || "None", to: newAmenities || "None" });
  }

  // Compare house rules array
  const oldRules = (existing.rules || []).slice().sort().join(", ");
  const newRules = incoming.rules.slice().sort().join(", ");
  if (oldRules !== newRules) {
    changes.push({ field: "House Rules", from: oldRules || "None", to: newRules || "None" });
  }

  return changes;
}

// ---------------------------------------------------------------------------
// CORE INGESTION & UPSERT ENGINE
// ---------------------------------------------------------------------------

export async function processBulkPropertyRows(
  rows: Record<string, unknown>[],
  commit = false
): Promise<IngestionResult> {
  const errors: RowError[] = [];
  const parsedRows: { rowNum: number; data: ParsedBulkRow }[] = [];
  const rowActions: RowAction[] = [];
  const seenListingIds = new Map<string, number>();

  rows.forEach((raw, idx) => {
    const rowNum = idx + 2; // 1-indexed header is row 1
    const norm = normalizeRawRow(raw);

    // 1. Listing ID / Property Code
    const rawCode = (norm.listingid || norm.propertycode || "") as string;
    const propertyCode = rawCode ? rawCode.trim().toUpperCase() : undefined;

    if (propertyCode) {
      if (seenListingIds.has(propertyCode)) {
        const prevRow = seenListingIds.get(propertyCode)!;
        errors.push({
          row: rowNum,
          field: "Listing ID",
          message: `Duplicate Listing ID "${propertyCode}" in this CSV (first defined on Row ${prevRow}).`,
        });
      } else {
        seenListingIds.set(propertyCode, rowNum);
      }
    }

    // 2. Public Name (Required)
    const publicName = ((norm.publicname || norm.name || "") as string).trim();
    if (!publicName || publicName.length < 2) {
      errors.push({
        row: rowNum,
        field: "Public Name",
        message: 'Public name is required and must be at least 2 characters.',
      });
    }

    // 3. Area & Exact Address (Required)
    const area = ((norm.area || norm.localityzone || norm.locality || "") as string).trim();
    if (!area || area.length < 2) {
      errors.push({
        row: rowNum,
        field: "Area",
        message: 'Area / Locality is required.',
      });
    }

    const exactAddress = ((norm.exactaddress || norm.address || "") as string).trim();
    if (!exactAddress || exactAddress.length < 3) {
      errors.push({
        row: rowNum,
        field: "Exact Address",
        message: 'Exact address is required for admin records (min 3 characters).',
      });
    }

    // 4. Enums
    const typeRes = normalizePropertyType(norm.listingtype || norm.type);
    if (typeRes.error) errors.push({ row: rowNum, field: "Listing Type", message: typeRes.error });

    const genderRes = normalizeGender(norm.gender);
    if (genderRes.error) errors.push({ row: rowNum, field: "Gender", message: genderRes.error });

    const foodRes = normalizeFoodStatus(norm.food);
    if (foodRes.error) errors.push({ row: rowNum, field: "Food", message: foodRes.error });

    const furnishedRes = normalizeFurnishedStatus(norm.furnishedstatus || norm.furnished);
    if (furnishedRes.error) errors.push({ row: rowNum, field: "Furnished Status", message: furnishedRes.error });

    const ownerTypeRes = normalizeOwnerType(norm.ownertype);
    if (ownerTypeRes.error) errors.push({ row: rowNum, field: "Owner Type", message: ownerTypeRes.error });

    const availRes = normalizeAvailabilityStatus(norm.availabilitystatus || norm.availability);
    if (availRes.error) errors.push({ row: rowNum, field: "Availability Status", message: availRes.error });

    const verifRes = normalizeVerificationStatus(norm.verificationstatus);
    if (verifRes.error) errors.push({ row: rowNum, field: "Verification Status", message: verifRes.error });

    // 5. Numeric Fields
    const depositClean = cleanNumericAmount(norm.depositamount, "Deposit Amount", { defaultValue: 0 });
    if (depositClean.error) errors.push({ row: rowNum, field: "Deposit Amount", message: depositClean.error });

    const singleRentClean = cleanNumericAmount(norm.singleroomrent, "Single Room Rent");
    if (singleRentClean.error) errors.push({ row: rowNum, field: "Single Room Rent", message: singleRentClean.error });

    const doubleRentClean = cleanNumericAmount(norm.doubleroomrent, "Double Room Rent");
    if (doubleRentClean.error) errors.push({ row: rowNum, field: "Double Room Rent", message: doubleRentClean.error });

    const tripleRentClean = cleanNumericAmount(norm.tripleroomrent, "Triple Room Rent");
    if (tripleRentClean.error) errors.push({ row: rowNum, field: "Triple Room Rent", message: tripleRentClean.error });

    const foodChargesClean = cleanNumericAmount(norm.foodcharges, "Food Charges");
    if (foodChargesClean.error) errors.push({ row: rowNum, field: "Food Charges", message: foodChargesClean.error });

    const otherChargesClean = cleanNumericAmount(norm.othercharges, "Other Charges");
    if (otherChargesClean.error) errors.push({ row: rowNum, field: "Other Charges", message: otherChargesClean.error });

    const roomsClean = cleanNumericAmount(norm.availablerooms, "Available Rooms", {
      integerOnly: true,
      defaultValue: 1,
    });
    if (roomsClean.error) errors.push({ row: rowNum, field: "Available Rooms", message: roomsClean.error });

    const elecRes = normalizeElectricity(
      norm.electricitycharges !== undefined && norm.electricitycharges !== ""
        ? norm.electricitycharges
        : norm.electricity || norm.electricitytype || norm.electricitybillingtype
    );
    if (elecRes.error) errors.push({ row: rowNum, field: "Electricity Charges", message: elecRes.error });

    // 6. Amenities (Array)
    let amenities: string[] = [];
    if (norm.amenities) {
      if (Array.isArray(norm.amenities)) {
        amenities = norm.amenities.map(String).map((s) => s.trim()).filter(Boolean);
      } else {
        amenities = String(norm.amenities).split(/[,;]/).map((s) => s.trim()).filter(Boolean);
      }
    }
    amenities = Array.from(new Set(amenities)); // deduplicate

    // 7. House Rules (Array)
    let rules: string[] = [];
    const rawRules = norm.houserules || norm.rules;
    if (rawRules) {
      if (Array.isArray(rawRules)) {
        rules = rawRules.map(String).map((s) => s.trim()).filter(Boolean);
      } else {
        rules = String(rawRules).split(/[\n,;]/).map((s) => s.trim()).filter(Boolean);
      }
    }
    rules = Array.from(new Set(rules)); // deduplicate

    // 8. Contact & Additional Fields
    const ownerName = (norm.ownername || null) as string | null;
    const ownerPhone = (norm.ownerphone || null) as string | null;
    const photoDriveLink = (norm.photosdrivelink || norm.drivelink || norm.photos || norm.photodrivelink || null) as string | null;
    const verificationNotes = (norm.verificationnotes || null) as string | null;

    // Derived rents
    const rents = [singleRentClean.value, doubleRentClean.value, tripleRentClean.value].filter(
      (r): r is number => typeof r === "number" && r > 0
    );
    const rentMin = norm.rentmin
      ? cleanNumericAmount(norm.rentmin, "Rent Min").value || 10000
      : rents.length > 0
      ? Math.min(...rents)
      : 10000;
    const rentMax = norm.rentmax
      ? cleanNumericAmount(norm.rentmax, "Rent Max").value || 15000
      : rents.length > 0
      ? Math.max(...rents)
      : 15000;

    const description =
      (norm.description as string) ||
      `${publicName} is a verified ${typeRes.value} in ${area} tailored for Delhi University students.`;

    const rowCandidate: ParsedBulkRow = {
      propertyCode,
      publicName,
      type: typeRes.value,
      gender: genderRes.value,
      area,
      exactAddress,
      depositAmount: depositClean.value ?? 0,
      singleRoomRent: singleRentClean.value,
      doubleRoomRent: doubleRentClean.value,
      tripleRoomRent: tripleRentClean.value,
      food: foodRes.value,
      foodCharges: foodChargesClean.value,
      electricityCharges: elecRes.charges,
      electricityType: elecRes.type,
      otherCharges: otherChargesClean.value,
      availableRooms: roomsClean.value ?? 1,
      furnishedStatus: furnishedRes.value,
      amenities: amenities.length ? amenities : ["Wi-Fi", "Housekeeping"],
      rules: rules.length ? rules : ["Entry till 11:00 PM", "No smoking"],
      ownerName: ownerName?.trim() || null,
      ownerPhone: ownerPhone?.trim() || null,
      ownerType: ownerTypeRes.value,
      availabilityStatus: availRes.value,
      photoDriveLink: photoDriveLink?.trim() || null,
      verificationStatus: verifRes.value,
      verificationNotes: verificationNotes?.trim() || null,
      rentMin,
      rentMax,
      description,
    };

    parsedRows.push({ rowNum, data: rowCandidate });
  });

  // Query existing database properties for all supplied propertyCodes
  const suppliedCodes = parsedRows
    .map((r) => r.data.propertyCode)
    .filter((c): c is string => Boolean(c));

  const existingProperties = suppliedCodes.length > 0
    ? await prisma.property.findMany({
        where: { propertyCode: { in: suppliedCodes } },
        include: { rooms: true },
      })
    : [];

  const existingMap = new Map(existingProperties.map((p) => [p.propertyCode, p]));

  // Auto-generation counter for properties without codes
  const lastProperty = await prisma.property.findFirst({
    orderBy: { createdAt: "desc" },
    select: { propertyCode: true },
  });
  let currentNum = 100;
  if (lastProperty?.propertyCode) {
    const match = lastProperty.propertyCode.match(/\d+/);
    if (match) currentNum = Math.max(currentNum, parseInt(match[0]!, 10));
  }

  // Pre-classify rows into NEW, UPDATE, UNCHANGED, or ERROR
  let newCount = 0;
  let updateCount = 0;
  let unchangedCount = 0;

  const validActionItems: {
    rowNum: number;
    action: "NEW" | "UPDATE" | "UNCHANGED";
    code: string;
    item: ParsedBulkRow;
    existing?: any;
    changes?: RowChange[];
  }[] = [];

  parsedRows.forEach(({ rowNum, data: item }) => {
    const rowErrors = errors.filter((e) => e.row === rowNum);
    if (rowErrors.length > 0) {
      rowActions.push({
        row: rowNum,
        propertyCode: item.propertyCode || "Auto-assign",
        publicName: item.publicName || "(Missing)",
        action: "ERROR",
        error: rowErrors.map((e) => e.message).join("; "),
      });
      return;
    }

    if (item.propertyCode && existingMap.has(item.propertyCode)) {
      const existing = existingMap.get(item.propertyCode)!;
      const changes = diffPropertyFields(existing, item);

      if (changes.length > 0) {
        updateCount++;
        rowActions.push({
          row: rowNum,
          propertyCode: item.propertyCode,
          publicName: item.publicName,
          action: "UPDATE",
          changes,
        });
        validActionItems.push({
          rowNum,
          action: "UPDATE",
          code: item.propertyCode,
          item,
          existing,
          changes,
        });
      } else {
        unchangedCount++;
        rowActions.push({
          row: rowNum,
          propertyCode: item.propertyCode,
          publicName: item.publicName,
          action: "UNCHANGED",
        });
        validActionItems.push({
          rowNum,
          action: "UNCHANGED",
          code: item.propertyCode,
          item,
          existing,
        });
      }
    } else {
      newCount++;
      let code = item.propertyCode;
      if (!code) {
        currentNum += 1;
        code = `PF#${currentNum}`;
      }
      rowActions.push({
        row: rowNum,
        propertyCode: code,
        publicName: item.publicName,
        action: "NEW",
      });
      validActionItems.push({
        rowNum,
        action: "NEW",
        code,
        item,
      });
    }
  });

  const importedCodes: string[] = [];
  const updatedCodes: string[] = [];

  // ATOMIC COMMIT TRANSACTION:
  // If commit is requested, there must be ZERO errors anywhere in the batch.
  if (commit && errors.length === 0 && validActionItems.length > 0) {
    try {
      await prisma.$transaction(
        async (tx) => {
          for (const actionItem of validActionItems) {
            const { action, code, item, existing } = actionItem;

            if (action === "UNCHANGED") {
              // Nothing to update in DB
              continue;
            }

            const isVerifiedBool = item.verificationStatus === VerificationStatus.VERIFIED;

            if (action === "NEW") {
              const safeCodeNum = code.replace(/[^0-9]/g, "") || String(currentNum);
              const slug = `pf-${safeCodeNum}-${item.area.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

              const roomsToCreate: Prisma.RoomInventoryCreateWithoutPropertyInput[] = [];

              if (item.singleRoomRent) {
                roomsToCreate.push({
                  label: "Single room",
                  sharingType: SharingType.SINGLE,
                  occupancyText: "1 student",
                  rent: Math.round(Number(item.singleRoomRent)),
                  deposit: Math.round(Number(item.singleRoomRent) * 1.5),
                  totalUnits: 4,
                  availableUnits: Math.max(1, Math.min(item.availableRooms ?? 1, 2)),
                });
              }

              if (item.doubleRoomRent) {
                roomsToCreate.push({
                  label: "Double sharing",
                  sharingType: SharingType.DOUBLE,
                  occupancyText: "2 students",
                  rent: Math.round(Number(item.doubleRoomRent)),
                  deposit: Math.round(Number(item.doubleRoomRent) * 1.5),
                  totalUnits: 6,
                  availableUnits: Math.max(1, Math.min(item.availableRooms ?? 1, 3)),
                });
              }

              if (item.tripleRoomRent) {
                roomsToCreate.push({
                  label: "Triple sharing",
                  sharingType: SharingType.TRIPLE,
                  occupancyText: "3 students",
                  rent: Math.round(Number(item.tripleRoomRent)),
                  deposit: Math.round(Number(item.tripleRoomRent) * 1.5),
                  totalUnits: 4,
                  availableUnits: 1,
                });
              }

              const propertyData: Prisma.PropertyCreateInput = {
                propertyCode: code,
                slug,
                publicName: item.publicName,
                type: item.type,
                gender: item.gender,
                localityZone: item.area,
                area: item.area,
                rentMin: item.rentMin,
                rentMax: item.rentMax,
                depositAmount: item.depositAmount,
                singleRoomRent: item.singleRoomRent,
                doubleRoomRent: item.doubleRoomRent,
                tripleRoomRent: item.tripleRoomRent,
                food: item.food,
                foodCharges: item.foodCharges,
                electricityCharges: item.electricityCharges,
                electricityType: item.electricityType,
                otherCharges: item.otherCharges,
                availableRooms: item.availableRooms,
                furnishedStatus: item.furnishedStatus,
                amenities: item.amenities,
                rules: item.rules,
                ownerName: item.ownerName,
                ownerPhone: item.ownerPhone,
                ownerType: item.ownerType,
                photoDriveLink: item.photoDriveLink,
                availabilityStatus: item.availabilityStatus,
                verificationStatus: item.verificationStatus,
                verificationNotes: item.verificationNotes,
                isVerified: isVerifiedBool,
                verifiedAt: isVerifiedBool ? new Date() : null,
                lifecycleStatus: PropertyLifecycle.PUBLISHED,
                exactAddress: item.exactAddress,
                distanceMin: 5,
                distanceText: `5 min to ${item.area} campus`,
                description: item.description,
                ...(roomsToCreate.length > 0 ? { rooms: { create: roomsToCreate } } : {}),
              };

              await tx.property.create({ data: propertyData });
              importedCodes.push(code);
            } else if (action === "UPDATE" && existing) {
              const updateData: Prisma.PropertyUpdateInput = {
                publicName: item.publicName,
                type: item.type,
                gender: item.gender,
                localityZone: item.area,
                area: item.area,
                exactAddress: item.exactAddress,
                depositAmount: item.depositAmount,
                singleRoomRent: item.singleRoomRent,
                doubleRoomRent: item.doubleRoomRent,
                tripleRoomRent: item.tripleRoomRent,
                rentMin: item.rentMin,
                rentMax: item.rentMax,
                food: item.food,
                foodCharges: item.foodCharges,
                electricityCharges: item.electricityCharges,
                electricityType: item.electricityType,
                otherCharges: item.otherCharges,
                availableRooms: item.availableRooms,
                furnishedStatus: item.furnishedStatus,
                amenities: item.amenities,
                rules: item.rules,
                ownerName: item.ownerName,
                ownerPhone: item.ownerPhone,
                ownerType: item.ownerType,
                photoDriveLink: item.photoDriveLink,
                availabilityStatus: item.availabilityStatus,
                verificationStatus: item.verificationStatus,
                verificationNotes: item.verificationNotes,
                isVerified: isVerifiedBool,
                verifiedAt: isVerifiedBool && !existing.verifiedAt ? new Date() : existing.verifiedAt,
                lifecycleStatus: PropertyLifecycle.PUBLISHED,
                description: item.description,
              };

              await tx.property.update({
                where: { id: existing.id },
                data: updateData,
              });

              // Synchronize RoomInventory records for existing property (No duplicates created)
              const existingRooms: any[] = existing.rooms || [];

              const syncRoom = async (
                sharingType: SharingType,
                rentVal: number | null,
                label: string,
                occupancyText: string,
                defaultUnits: number
              ) => {
                const roomMatch = existingRooms.find((r) => r.sharingType === sharingType);
                if (rentVal !== null && rentVal > 0) {
                  const rent = Math.round(rentVal);
                  const deposit = Math.round(rentVal * 1.5);
                  if (roomMatch) {
                    await tx.roomInventory.update({
                      where: { id: roomMatch.id },
                      data: {
                        rent,
                        deposit,
                        availableUnits: Math.max(1, Math.min(item.availableRooms ?? 1, defaultUnits)),
                      },
                    });
                  } else {
                    await tx.roomInventory.create({
                      data: {
                        propertyId: existing.id,
                        label,
                        sharingType,
                        occupancyText,
                        rent,
                        deposit,
                        totalUnits: defaultUnits + 2,
                        availableUnits: Math.max(1, Math.min(item.availableRooms ?? 1, defaultUnits)),
                      },
                    });
                  }
                }
              };

              await syncRoom(SharingType.SINGLE, item.singleRoomRent, "Single room", "1 student", 2);
              await syncRoom(SharingType.DOUBLE, item.doubleRoomRent, "Double sharing", "2 students", 3);
              await syncRoom(SharingType.TRIPLE, item.tripleRoomRent, "Triple sharing", "3 students", 2);

              updatedCodes.push(code);
            }
          }
        },
        {
          maxWait: 15000,
          timeout: 60000,
        }
      );
    } catch (err: any) {
      importedCodes.length = 0;
      updatedCodes.length = 0;
      errors.push({
        row: 0,
        message: err?.message
          ? `Bulk import transaction failed and was rolled back: ${err.message}`
          : "Bulk import transaction failed and was rolled back.",
      });
    }
  }

  const validCount = rows.length - errors.length;

  return {
    totalRows: rows.length,
    validCount: commit && errors.length > 0 ? 0 : validCount,
    newCount: commit && errors.length > 0 ? 0 : newCount,
    updateCount: commit && errors.length > 0 ? 0 : updateCount,
    unchangedCount: commit && errors.length > 0 ? 0 : unchangedCount,
    errorCount: errors.length,
    errors,
    rowActions,
    importedCodes,
    updatedCodes,
  };
}
