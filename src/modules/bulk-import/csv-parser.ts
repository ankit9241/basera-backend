/**
 * Canonical 25 CSV Headers for Basera Property Listings
 */
export const CANONICAL_25_HEADERS = [
  "Listing ID",
  "Public Name",
  "Listing Type",
  "Gender",
  "Area",
  "Exact Address",
  "Deposit Amount",
  "Single Room Rent",
  "Double Room Rent",
  "Triple Room Rent",
  "Food",
  "Food Charges",
  "Electricity Charges",
  "Other Charges",
  "Available Rooms",
  "Furnished Status",
  "Amenities",
  "House Rules",
  "Owner Name",
  "Owner Phone",
  "Owner Type",
  "Availability Status",
  "Photos / Drive Link",
  "Verification Status",
  "Verification Notes",
  "Deposit Policy",
] as const;

export type CanonicalHeader = (typeof CANONICAL_25_HEADERS)[number];

/**
 * Normalization map for common header aliases from Excel, Google Sheets, and LibreOffice.
 */
export const HEADER_ALIAS_MAP: Record<string, CanonicalHeader> = {
  // 1. Listing ID
  listingid: "Listing ID",
  listing_id: "Listing ID",
  propertycode: "Listing ID",
  property_code: "Listing ID",
  code: "Listing ID",
  id: "Listing ID",
  pgid: "Listing ID",
  pg_id: "Listing ID",
  pg: "Listing ID",
  pgidentifier: "Listing ID",

  // 2. Public Name
  publicname: "Public Name",
  public_name: "Public Name",
  name: "Public Name",
  title: "Public Name",
  propertyname: "Public Name",
  property_name: "Public Name",

  // 3. Listing Type
  listingtype: "Listing Type",
  listing_type: "Listing Type",
  type: "Listing Type",
  propertytype: "Listing Type",
  property_type: "Listing Type",

  // 4. Gender
  gender: "Gender",
  genderpreference: "Gender",
  gender_preference: "Gender",
  category: "Gender",

  // 5. Area
  area: "Area",
  locality: "Area",
  localityzone: "Area",
  locality_zone: "Area",
  zone: "Area",

  // 6. Exact Address
  exactaddress: "Exact Address",
  exact_address: "Exact Address",
  address: "Exact Address",
  fulladdress: "Exact Address",
  full_address: "Exact Address",

  // 7. Deposit Amount (Legacy / Optional) & Deposit Policy
  depositamount: "Deposit Amount",
  deposit_amount: "Deposit Amount",
  deposit: "Deposit Amount",
  securitydeposit: "Deposit Amount",
  depositpolicy: "Deposit Policy",
  deposit_policy: "Deposit Policy",

  // 8. Single Room Rent
  singleroomrent: "Single Room Rent",
  single_room_rent: "Single Room Rent",
  singlerent: "Single Room Rent",
  single: "Single Room Rent",

  // 9. Double Room Rent
  doubleroomrent: "Double Room Rent",
  double_room_rent: "Double Room Rent",
  doublerent: "Double Room Rent",
  double: "Double Room Rent",

  // 10. Triple Room Rent
  tripleroomrent: "Triple Room Rent",
  triple_room_rent: "Triple Room Rent",
  triplerent: "Triple Room Rent",
  triple: "Triple Room Rent",

  // 11. Food
  food: "Food",
  foodstatus: "Food",
  meals: "Food",
  foodincluded: "Food",

  // 12. Food Charges
  foodcharges: "Food Charges",
  food_charges: "Food Charges",
  mealcharges: "Food Charges",
  foodcharge: "Food Charges",

  // 13. Electricity Charges
  electricitycharges: "Electricity Charges",
  electricity_charges: "Electricity Charges",
  electricity: "Electricity Charges",
  electricitytype: "Electricity Charges",
  electricitybillingtype: "Electricity Charges",

  // 14. Other Charges
  othercharges: "Other Charges",
  other_charges: "Other Charges",
  maintenancecharges: "Other Charges",
  maintenance: "Other Charges",

  // 15. Available Rooms
  availablerooms: "Available Rooms",
  available_rooms: "Available Rooms",
  rooms: "Available Rooms",
  units: "Available Rooms",
  availableunits: "Available Rooms",

  // 16. Furnished Status
  furnishedstatus: "Furnished Status",
  furnished_status: "Furnished Status",
  furnished: "Furnished Status",
  furnishing: "Furnished Status",

  // 17. Amenities
  amenities: "Amenities",
  amenity: "Amenities",
  facilities: "Amenities",

  // 18. House Rules
  houserules: "House Rules",
  house_rules: "House Rules",
  rules: "House Rules",
  rule: "House Rules",

  // 19. Owner Name
  ownername: "Owner Name",
  owner_name: "Owner Name",
  landlordname: "Owner Name",
  landlord_name: "Owner Name",
  owner: "Owner Name",

  // 20. Owner Phone
  ownerphone: "Owner Phone",
  owner_phone: "Owner Phone",
  landlordphone: "Owner Phone",
  phone: "Owner Phone",
  mobile: "Owner Phone",
  ownermobile: "Owner Phone",

  // 21. Owner Type
  ownertype: "Owner Type",
  owner_type: "Owner Type",
  landlordtype: "Owner Type",

  // 22. Availability Status
  availabilitystatus: "Availability Status",
  availability_status: "Availability Status",
  availability: "Availability Status",
  status: "Availability Status",

  // 23. Photos / Drive Link
  photosdrivelink: "Photos / Drive Link",
  photos_drive_link: "Photos / Drive Link",
  photos: "Photos / Drive Link",
  drivelink: "Photos / Drive Link",
  drive_link: "Photos / Drive Link",
  driveurl: "Photos / Drive Link",
  photodrivelink: "Photos / Drive Link",
  photo: "Photos / Drive Link",

  // 24. Verification Status
  verificationstatus: "Verification Status",
  verification_status: "Verification Status",
  verification: "Verification Status",
  verifiedstatus: "Verification Status",

  // 25. Verification Notes
  verificationnotes: "Verification Notes",
  verification_notes: "Verification Notes",
  notes: "Verification Notes",
  internalnotes: "Verification Notes",
};

export interface ParseCsvDetailedResult {
  rows: Record<string, string>[];
  headers: string[];
  canonicalHeadersMap: Record<string, CanonicalHeader>;
  unknownHeaders: string[];
  warnings: string[];
}

/**
 * Resolves any header string to its canonical 25 header name, or returns null if unrecognized.
 */
export function resolveCanonicalHeader(rawHeader: string): CanonicalHeader | null {
  const cleaned = rawHeader.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  return HEADER_ALIAS_MAP[cleaned] || null;
}

/**
 * RFC 4180-compliant CSV Parser.
 * Properly handles:
 * - Quoted fields containing commas (e.g. addresses, house rules, amenities)
 * - Escaped double quotes inside quotes ("" -> ")
 * - Quoted fields containing embedded newlines (\r\n or \n)
 * - Leading/trailing whitespace and UTF-8 BOM (\uFEFF)
 * - Empty fields (,, or ,"",)
 * - Trailing blank rows from spreadsheet exports
 * - Header alias normalization to canonical 25 columns
 */
export function parseCsvDetailed(csvText: string): ParseCsvDetailedResult {
  if (!csvText || typeof csvText !== "string") {
    return {
      rows: [],
      headers: [],
      canonicalHeadersMap: {},
      unknownHeaders: [],
      warnings: [],
    };
  }

  // Strip UTF-8 Byte Order Mark (BOM) if present
  const text = csvText.replace(/^\uFEFF/, "");

  // Auto-detect delimiter based on first line outside quotes: ',', '\t', or ';'
  let delimiter = ",";
  const firstLineEnd = text.search(/[\r\n]/);
  const sampleHeader = firstLineEnd !== -1 ? text.slice(0, firstLineEnd) : text;
  let commaCount = 0;
  let tabCount = 0;
  let semiCount = 0;
  let sampleInQuotes = false;
  for (let s = 0; s < sampleHeader.length; s++) {
    const ch = sampleHeader[s];
    if (ch === '"') {
      sampleInQuotes = !sampleInQuotes;
    } else if (!sampleInQuotes) {
      if (ch === ",") commaCount++;
      else if (ch === "\t") tabCount++;
      else if (ch === ";") semiCount++;
    }
  }
  if (tabCount > commaCount && tabCount >= semiCount) {
    delimiter = "\t";
  } else if (semiCount > commaCount && semiCount > tabCount) {
    delimiter = ";";
  }

  const rawLines: string[][] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          // Escaped quote: "" represents a literal "
          currentField += '"';
          i += 2;
          continue;
        } else {
          // Closing quote
          inQuotes = false;
          i++;
          continue;
        }
      } else {
        currentField += char;
        i++;
        continue;
      }
    } else {
      if (char === '"') {
        // Opening quote
        inQuotes = true;
        i++;
        continue;
      } else if (char === delimiter) {
        currentRow.push(currentField);
        currentField = "";
        i++;
        continue;
      } else if (char === '\r') {
        if (nextChar === '\n') {
          i++; // Skip \r in \r\n
        }
        currentRow.push(currentField);
        currentField = "";
        rawLines.push(currentRow);
        currentRow = [];
        i++;
        continue;
      } else if (char === '\n') {
        currentRow.push(currentField);
        currentField = "";
        rawLines.push(currentRow);
        currentRow = [];
        i++;
        continue;
      } else {
        currentField += char;
        i++;
        continue;
      }
    }
  }

  // Push final field/row if any remained unclosed
  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    rawLines.push(currentRow);
  }

  // Filter out any purely blank rows (all columns are empty strings/whitespace)
  const cleanRows = rawLines.filter((r) => r.some((col) => col.trim() !== ""));

  if (cleanRows.length < 2) {
    return {
      rows: [],
      headers: cleanRows[0]?.map((h) => h.trim().replace(/^["']|["']$/g, "")) || [],
      canonicalHeadersMap: {},
      unknownHeaders: [],
      warnings: ["CSV contains fewer than 2 non-empty lines (header + data row required)."],
    };
  }

  const rawHeaders = cleanRows[0]!.map((h) => h.trim().replace(/^["']|["']$/g, ""));
  const canonicalHeadersMap: Record<string, CanonicalHeader> = {};
  const unknownHeaders: string[] = [];
  const warnings: string[] = [];

  rawHeaders.forEach((h) => {
    if (!h) return;
    const canonical = resolveCanonicalHeader(h);
    if (canonical) {
      canonicalHeadersMap[h] = canonical;
    } else {
      unknownHeaders.push(h);
      warnings.push(`Unrecognized column "${h}" will be ignored.`);
    }
  });

  const dataRows: Record<string, string>[] = [];

  for (let r = 1; r < cleanRows.length; r++) {
    const values = cleanRows[r]!;
    const rowObj: Record<string, string> = {};

    for (let c = 0; c < rawHeaders.length; c++) {
      const headerName = rawHeaders[c]!;
      if (!headerName) continue;
      const val = values[c] !== undefined ? values[c]!.trim() : "";
      
      // Store under raw header name
      rowObj[headerName] = val;

      // Also store under resolved canonical header name so mapping works seamlessly
      const canonical = canonicalHeadersMap[headerName];
      if (canonical) {
        rowObj[canonical] = val;
      }
    }
    dataRows.push(rowObj);
  }

  return {
    rows: dataRows,
    headers: rawHeaders,
    canonicalHeadersMap,
    unknownHeaders,
    warnings,
  };
}

/**
 * Backward-compatible helper returning Record<string, string>[] with both canonical and raw headers populated.
 */
export function parseCsvString(csvText: string): Record<string, string>[] {
  return parseCsvDetailed(csvText).rows;
}

/**
 * Pre-formatted Canonical CSV Template for Basera Listings.
 */
export const CANONICAL_CSV_TEMPLATE = `PG_ID,Public Name,Listing Type,Gender,Area,Exact Address,Single Room Rent,Double Room Rent,Triple Room Rent,Food,Food Charges,Electricity Charges,Other Charges,Available Rooms,Furnished Status,Amenities,House Rules,Owner Name,Owner Phone,Owner Type,Availability Status,Photos / Drive Link,Verification Status,Verification Notes
"BAS501","Green Villa Luxury PG","PG","GIRLS","Kamla Nagar","12/4 Block A, Near Chache Di Hatti, Kamla Nagar, Delhi 110007",16000,11000,8500,"Included",0,"As per meter",500,3,"Fully Furnished","Wi-Fi, AC, Geyser, RO Water, Housekeeping, Power Backup, CCTV","Gate closes at 11:00 PM, No smoking, Female guests only, ID proof required","Ramesh Gupta","9811011111","OWNER","AVAILABLE","https://drive.google.com/drive/folders/sample-bas501","VERIFIED","Physical verification completed by Basera team. Biometric entry and 24/7 warden present."
"BAS502","Hudson Student Haven","PG","BOYS","Hudson Lane","45 Hudson Lane, Near GTB Nagar Metro Gate 3, Delhi 110009",18000,12000,"N.A.","Available",2500,"10/unit",0,2,"Semi Furnished","Wi-Fi, AC, Geyser, Refrigerator, RO Water, Power Backup","No loud music after 10:30 PM, Visitors allowed till 8 PM, No alcohol","Sunita Sharma","9811022222","CARETAKER","FEW_ROOMS_LEFT","https://drive.google.com/drive/folders/sample-bas502","VERIFIED","Sub-meter installed for each room. High-speed fiber Wi-Fi verified."`;


