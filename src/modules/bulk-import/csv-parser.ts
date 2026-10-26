/**
 * Canonical 25 Spreadsheet Headers for Basera Property Listings
 * Matches the exact 25-column specification in Section 2:
 * 1. PG_ID
 * 2. Public Name
 * 3. Listing Type
 * 4. Gender
 * 5. Area
 * 6. Exact Address
 * 7. Deposit Amount
 * 8. Single Room Rent
 * 9. Double Room Rent
 * 10. Triple Room Rent
 * 11. Food
 * 12. Food Charges
 * 13. Electricity Charges
 * 14. Other Charges
 * 15. Available Rooms
 * 16. Furnished Status
 * 17. Amenities
 * 18. House Rules
 * 19. Owner Name
 * 20. Owner Phone
 * 21. Owner Type
 * 22. Availability Status
 * 23. Photos / Drive Link
 * 24. Verification Status
 * 25. Verification Notes
 */
export const CANONICAL_25_HEADERS = [
  "PG_ID",
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
] as const;

export type CanonicalHeader = (typeof CANONICAL_25_HEADERS)[number];

export const REQUIRED_HEADERS: CanonicalHeader[] = [
  "PG_ID",
  "Public Name",
  "Area",
  "Exact Address",
];

/**
 * Normalization map for common header aliases from Excel, Google Sheets, LibreOffice, and CSV exports.
 */
export const HEADER_ALIAS_MAP: Record<string, CanonicalHeader> = {
  // 1. PG_ID (Listing ID)
  pgid: "PG_ID",
  pg_id: "PG_ID",
  listingid: "PG_ID",
  listing_id: "PG_ID",
  propertycode: "PG_ID",
  property_code: "PG_ID",
  code: "PG_ID",
  id: "PG_ID",
  pg: "PG_ID",
  pgidentifier: "PG_ID",

  // 2. Public Name (Internal Property Name where supported)
  publicname: "Public Name",
  public_name: "Public Name",
  actualpropertyname: "Public Name",
  actual_property_name: "Public Name",
  internalpropertyname: "Public Name",
  internal_property_name: "Public Name",
  actualname: "Public Name",
  actual_name: "Public Name",
  internalname: "Public Name",
  internal_name: "Public Name",
  pgname: "Public Name",
  pg_name: "Public Name",
  propertyname: "Public Name",
  property_name: "Public Name",
  name: "Public Name",
  title: "Public Name",
  publiclistingtitle: "Public Name",
  public_listing_title: "Public Name",
  publictitle: "Public Name",
  public_title: "Public Name",

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

  // 7. Deposit Amount
  depositamount: "Deposit Amount",
  deposit_amount: "Deposit Amount",
  deposit: "Deposit Amount",
  securitydeposit: "Deposit Amount",
  security_deposit: "Deposit Amount",
  depositpolicy: "Deposit Amount",
  deposit_policy: "Deposit Amount",

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
  food_status: "Food",
  meals: "Food",
  foodincluded: "Food",
  food_included: "Food",

  // 12. Food Charges
  foodcharges: "Food Charges",
  food_charges: "Food Charges",
  mealcharges: "Food Charges",
  meal_charges: "Food Charges",
  foodcharge: "Food Charges",

  // 13. Electricity Charges
  electricitycharges: "Electricity Charges",
  electricity_charges: "Electricity Charges",
  electricity: "Electricity Charges",
  electricitytype: "Electricity Charges",
  electricity_type: "Electricity Charges",
  electricitybillingtype: "Electricity Charges",

  // 14. Other Charges
  othercharges: "Other Charges",
  other_charges: "Other Charges",
  maintenancecharges: "Other Charges",
  maintenance_charges: "Other Charges",
  maintenance: "Other Charges",

  // 15. Available Rooms
  availablerooms: "Available Rooms",
  available_rooms: "Available Rooms",
  rooms: "Available Rooms",
  units: "Available Rooms",
  availableunits: "Available Rooms",
  available_units: "Available Rooms",

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
  landlord_phone: "Owner Phone",
  phone: "Owner Phone",
  mobile: "Owner Phone",
  ownermobile: "Owner Phone",
  owner_mobile: "Owner Phone",

  // 21. Owner Type
  ownertype: "Owner Type",
  owner_type: "Owner Type",
  landlordtype: "Owner Type",
  landlord_type: "Owner Type",

  // 22. Availability Status
  availabilitystatus: "Availability Status",
  availability_status: "Availability Status",
  availability: "Availability Status",
  status: "Availability Status",

  // 23. Photos / Drive Link
  photosdrivelink: "Photos / Drive Link",
  photos_drive_link: "Photos / Drive Link",
  photos: "Photos / Drive Link",
  photo: "Photos / Drive Link",
  drivelink: "Photos / Drive Link",
  drive_link: "Photos / Drive Link",
  driveurl: "Photos / Drive Link",
  drive_url: "Photos / Drive Link",
  photodrivelink: "Photos / Drive Link",
  photo_drive_link: "Photos / Drive Link",

  // 24. Verification Status
  verificationstatus: "Verification Status",
  verification_status: "Verification Status",
  verification: "Verification Status",
  verifiedstatus: "Verification Status",
  verified_status: "Verification Status",

  // 25. Verification Notes
  verificationnotes: "Verification Notes",
  verification_notes: "Verification Notes",
  notes: "Verification Notes",
  internalnotes: "Verification Notes",
  internal_notes: "Verification Notes",
};

export interface ParseCsvDetailedResult {
  rows: Record<string, string>[];
  headers: string[];
  canonicalHeadersMap: Record<string, CanonicalHeader>;
  headerCount: number;
  duplicateHeaders: string[];
  missingRequiredHeaders: string[];
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
 * - Detection of duplicate headers, missing required headers, and unknown columns
 */
export function parseCsvDetailed(csvText: string): ParseCsvDetailedResult {
  if (!csvText || typeof csvText !== "string") {
    return {
      rows: [],
      headers: [],
      canonicalHeadersMap: {},
      headerCount: 0,
      duplicateHeaders: [],
      missingRequiredHeaders: [...REQUIRED_HEADERS],
      unknownHeaders: [],
      warnings: ["No file content provided."],
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
          currentField += '"';
          i += 2;
          continue;
        } else {
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
          i++;
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
      headerCount: cleanRows[0]?.length || 0,
      duplicateHeaders: [],
      missingRequiredHeaders: [...REQUIRED_HEADERS],
      unknownHeaders: [],
      warnings: ["Spreadsheet contains fewer than 2 non-empty lines (header + data row required)."],
    };
  }

  const rawHeaders = cleanRows[0]!.map((h) => h.trim().replace(/^["']|["']$/g, ""));
  const canonicalHeadersMap: Record<string, CanonicalHeader> = {};
  const seenHeaders = new Set<string>();
  const duplicateHeaders: string[] = [];
  const unknownHeaders: string[] = [];
  const warnings: string[] = [];

  rawHeaders.forEach((h) => {
    if (!h) return;
    const lowerClean = h.toLowerCase().trim();
    if (seenHeaders.has(lowerClean)) {
      duplicateHeaders.push(h);
      warnings.push(`Duplicate column header "${h}" detected.`);
    } else {
      seenHeaders.add(lowerClean);
    }

    const canonical = resolveCanonicalHeader(h);
    if (canonical) {
      canonicalHeadersMap[h] = canonical;
    } else {
      unknownHeaders.push(h);
      warnings.push(`Unrecognized column "${h}" will be retained as raw data.`);
    }
  });

  // Verify required headers
  const mappedCanonicalSet = new Set(Object.values(canonicalHeadersMap));
  const missingRequiredHeaders = REQUIRED_HEADERS.filter((req) => !mappedCanonicalSet.has(req));
  if (missingRequiredHeaders.length > 0) {
    warnings.push(`Missing required column(s): ${missingRequiredHeaders.join(", ")}`);
  }

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
    headerCount: rawHeaders.length,
    duplicateHeaders,
    missingRequiredHeaders,
    unknownHeaders,
    warnings,
  };
}

export function parseCsvString(csvText: string): Record<string, string>[] {
  return parseCsvDetailed(csvText).rows;
}

/**
 * Pre-formatted Canonical 25-Column CSV Template matching Section 2:
 * 1. PG_ID
 * 2. Public Name
 * 3. Listing Type
 * 4. Gender
 * 5. Area
 * 6. Exact Address
 * 7. Deposit Amount
 * 8. Single Room Rent
 * 9. Double Room Rent
 * 10. Triple Room Rent
 * 11. Food
 * 12. Food Charges
 * 13. Electricity Charges
 * 14. Other Charges
 * 15. Available Rooms
 * 16. Furnished Status
 * 17. Amenities
 * 18. House Rules
 * 19. Owner Name
 * 20. Owner Phone
 * 21. Owner Type
 * 22. Availability Status
 * 23. Photos / Drive Link
 * 24. Verification Status
 * 25. Verification Notes
 */
export const CANONICAL_CSV_TEMPLATE = `PG_ID,Public Name,Listing Type,Gender,Area,Exact Address,Deposit Amount,Single Room Rent,Double Room Rent,Triple Room Rent,Food,Food Charges,Electricity Charges,Other Charges,Available Rooms,Furnished Status,Amenities,House Rules,Owner Name,Owner Phone,Owner Type,Availability Status,Photos / Drive Link,Verification Status,Verification Notes
"BAS-PG-501","Sai Kunj","PG","Boys","Kamla Nagar","71-UB, Jawahar Nagar, Kamla Nagar, Delhi 110007","1 month rent",,12500,10000,"Included in Rent",0,"15/unit",0,1,"Semi Furnished","Wi-Fi, AC, Washing Machine, Study Table, Cupboard, Refrigerator, Geyser, Housekeeping","Gate closes at 11 PM, No loud music","Rupesh Bansal","9873074213","Owner","Available","https://drive.google.com/drive/folders/sample-bas501","",""
"BAS-PG-506","Elite Stay","PG","Boys","Kamla Nagar","14-UB, Jawahar Nagar, Kamla Nagar, Delhi 110007","1 month rent",,12500,10000,"Included in Rent",0,,0,1,"Semi Furnished","Wi-Fi, AC, Washing Machine, Study Table, Cupboard, Refrigerator, Geyser, Housekeeping","Gate closes at 11 PM, Visitors allowed till 8 PM","Sanjay Jain","9811804791","Owner","Available","https://drive.google.com/drive/folders/sample-bas506","Verified","Physical verification completed by Basera coordinator. Sub-meters verified."
"BAS-PG-508","Grand Hostel Girls PG","PG","Girls","Kamla Nagar","23 UA, Jawahar Nagar, Kamla Nagar, Delhi 110007","1 month rent",,13000,11000,"Included in Rent",0,"N.AC -750 AC-16/UNIT",0,1,"Fully Furnished","Wi-Fi, AC, Washing Machine, Study Table, Cupboard, Refrigerator, Geyser, Housekeeping","No entry after 10:30 PM, Female guests only","Manish Kumar","7979725470","Owner","Available","https://drive.google.com/drive/folders/sample-bas508","Verified","Dual electricity rate verified: Non-AC ₹750/mo and AC ₹16/unit."
"BAS-PG-509","Sunrise Residency","PG","Boys","Kamla Nagar","38 UA, Jawahar Nagar, Kamla Nagar, Delhi 110007","1 month rent",,14000,11000,"Included in Rent",0,"1000 rs",0,1,"Fully Furnished","Wi-Fi, AC, Washing Machine, Study Table, Cupboard, Refrigerator, Geyser, Housekeeping","ID required, Visitors till 8 PM","Ramesh Verma","9811099999","Owner","Available","https://drive.google.com/drive/folders/sample-bas509","Verified","Fixed electricity charge ₹1,000."`;
