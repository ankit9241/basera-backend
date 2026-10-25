/**
 * Generates a clean, privacy-preserving public listing title.
 * Public users will see titles such as:
 * - "Girls PG · Kamla Nagar"
 * - "Boys PG · Vijay Nagar"
 * - "Co-ed PG · Hudson Lane"
 * - "Student Flat · Hudson Lane"
 * - "Girls Flat · Kamla Nagar"
 * - "Co-living · GTB Nagar"
 *
 * Rules:
 * - Does not invent gender or property attributes if missing.
 * - Never includes actual PG/building/landlord names.
 */
export function generatePublicTitle(
  type?: string | null,
  gender?: string | null,
  areaOrLocality?: string | null
): string {
  const cleanLocality = areaOrLocality?.trim();
  const rawType = (type || "").toUpperCase().trim();
  const rawGender = (gender || "").toUpperCase().trim();

  let genderLabel = "";
  if (rawGender === "GIRLS" || rawGender === "FEMALE" || rawGender === "WOMEN") {
    genderLabel = "Girls";
  } else if (rawGender === "BOYS" || rawGender === "MALE" || rawGender === "MEN") {
    genderLabel = "Boys";
  } else if (rawGender === "CO_ED" || rawGender === "COED" || rawGender === "MIXED") {
    genderLabel = "Co-ed";
  }

  // FLAT / APARTMENT
  if (rawType === "FLAT" || rawType === "APARTMENT" || rawType.includes("BHK")) {
    const flatPrefix = genderLabel && genderLabel !== "Co-ed" ? `${genderLabel} ` : "Student ";
    return cleanLocality ? `${flatPrefix}Flat · ${cleanLocality}` : `${flatPrefix}Flat`;
  }

  // CO_LIVING
  if (rawType === "CO_LIVING" || rawType === "COLIVING" || rawType === "CO-LIVING") {
    const prefix = genderLabel && genderLabel !== "Co-ed" ? `${genderLabel} ` : "";
    return cleanLocality ? `${prefix}Co-Living · ${cleanLocality}`.trim() : `${prefix}Co-Living`.trim();
  }

  // HOSTEL
  if (rawType === "HOSTEL") {
    const hostelPrefix = genderLabel ? `${genderLabel} ` : "Student ";
    return cleanLocality ? `${hostelPrefix}Hostel · ${cleanLocality}` : `${hostelPrefix}Hostel`;
  }

  // Fallback if everything is missing
  if (!rawType && !genderLabel && !cleanLocality) {
    return "Student Accommodation";
  }

  // Default PG
  const pgPrefix = genderLabel ? `${genderLabel} ` : "Student ";
  return cleanLocality ? `${pgPrefix}PG · ${cleanLocality}` : `${pgPrefix}PG`;
}

/**
 * Mapping of legacy static staging slugs to canonical Basera property codes (e.g. BAS501..BAS509).
 */
export const STATIC_PROPERTY_CODES: Record<string, string> = {
  "the-study-house": "BAS501",
  "hudson-residences": "BAS502",
  "maurice-coliving": "BAS503",
  "patel-court": "BAS504",
  "the-almond-house": "BAS505",
  "nirvana-lofts": "BAS506",
  "banyan-co-living": "BAS507",
  "stone-lane-house": "BAS508",
  "the-quiet-quarter": "BAS509",
};

/**
 * Returns a standardized, verified public listing ID (e.g. BAS501, BAS505, PF#01).
 * Never returns raw slugs or words like "THE-ALMOND-HOUSE".
 */
export function formatListingId(codeOrSlug?: string | null): string {
  if (!codeOrSlug) return "";
  const trimmed = codeOrSlug.trim();
  const lower = trimmed.toLowerCase();

  // 1. Direct match in static property codes
  if (STATIC_PROPERTY_CODES[lower]) {
    return STATIC_PROPERTY_CODES[lower];
  }
  const hyphenated = lower.replace(/_/g, "-");
  if (STATIC_PROPERTY_CODES[hyphenated]) {
    return STATIC_PROPERTY_CODES[hyphenated];
  }

  // 2. Canonical BAS-prefixed code (e.g. BAS501, BAS-501, BAS#501)
  const basMatch = trimmed.match(/^BAS[-#]?(\d+)$/i);
  if (basMatch) {
    return `BAS${basMatch[1]}`;
  }

  // 3. Canonical PF-prefixed code (e.g. PF#01, PF-01, PF01)
  const pfMatch = trimmed.match(/^PF[-#]?(\d+)$/i);
  if (pfMatch) {
    return `PF#${pfMatch[1]}`;
  }

  // 4. Any compact alphanumeric code with digits (e.g. BAS101, DU204, etc.)
  if (/^[A-Z0-9#]{3,8}$/i.test(trimmed) && /\d/.test(trimmed)) {
    return trimmed.toUpperCase();
  }

  // Reject generic slugs so we never display "THE-ALMOND-HOUSE"
  return "";
}
