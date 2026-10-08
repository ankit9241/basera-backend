/**
 * Basera Search V2
 * 
 * Reusable normalization, canonical locality matching, fuzzy typo tolerance,
 * and deterministic natural search query parsing.
 */

export interface LocalityDefinition {
  canonicalName: string;
  normalizedName: string;
  zone: "North Campus" | "South Campus" | "Other";
  aliases: string[];
  nearbyLocalities: string[];
}

export type MatchConfidence = "HIGH" | "MEDIUM" | "LOW";

export interface LocalityMatchResult {
  locality: LocalityDefinition;
  confidence: MatchConfidence;
  score: number;
  matchedToken: string;
  isAlias: boolean;
}

export interface ParsedSearchIntent {
  rawQuery: string;
  normalizedQuery: string;
  inferredType?: "PG" | "FLAT" | "CO_LIVING";
  inferredGender?: "GIRLS" | "BOYS" | "CO_ED";
  inferredSharing?: "SINGLE" | "DOUBLE" | "TRIPLE";
  inferredBudgetMin?: number;
  inferredBudgetMax?: number;
  inferredLocality?: string; // High-confidence canonical locality name
  suggestedLocality?: string; // Medium-confidence canonical locality name
  unrecognizedLocality?: string; // Locality mentioned (e.g., "Rohini") not in catalog
  remainingQuery: string; // Meaningful free-text left over (e.g. property name or unique keyword)
}

// ---------------------------------------------------------------------------
// 1. CANONICAL LOCALITY CATALOG & NEARBY RELATIONSHIPS
// ---------------------------------------------------------------------------

export const CANONICAL_LOCALITIES: LocalityDefinition[] = [
  {
    canonicalName: "Kamla Nagar",
    normalizedName: "kamla nagar",
    zone: "North Campus",
    aliases: [
      "kamla",
      "kmla",
      "kamlla",
      "kamla nagr",
      "kamla ngr",
      "kamlanagar",
      "k nagar",
      "k ngr",
      "knagar",
    ],
    nearbyLocalities: ["Roop Nagar", "Shakti Nagar", "Malka Ganj", "Vijay Nagar", "Hudson Lane", "Patel Chest"],
  },
  {
    canonicalName: "Hudson Lane",
    normalizedName: "hudson lane",
    zone: "North Campus",
    aliases: [
      "hudson",
      "hudsn",
      "hudsen",
      "hudson lane",
      "hudson ln",
      "hudsonlane",
      "hudsonline",
    ],
    nearbyLocalities: ["Vijay Nagar", "GTB Nagar", "Kamla Nagar", "Old Gupta Colony", "Patel Chest"],
  },
  {
    canonicalName: "Vijay Nagar",
    normalizedName: "vijay nagar",
    zone: "North Campus",
    aliases: [
      "vijay",
      "vjay",
      "vijaynagar",
      "vijay nagar",
      "vijay ngr",
      "v nagar",
    ],
    nearbyLocalities: ["Hudson Lane", "GTB Nagar", "Kamla Nagar", "Old Gupta Colony", "Mukherjee Nagar"],
  },
  {
    canonicalName: "GTB Nagar",
    normalizedName: "gtb nagar",
    zone: "North Campus",
    aliases: [
      "gtb",
      "gtb nagar",
      "gtbnagar",
      "g.t.b.",
      "g.t.b nagar",
      "gtb ngr",
      "guru tegh bahadur nagar",
    ],
    nearbyLocalities: ["Hudson Lane", "Vijay Nagar", "Mukherjee Nagar", "Model Town", "Old Gupta Colony"],
  },
  {
    canonicalName: "Mukherjee Nagar",
    normalizedName: "mukherjee nagar",
    zone: "North Campus",
    aliases: [
      "mukherjee",
      "mukherji",
      "mukhargee",
      "mukherjee nagar",
      "mukherjinagar",
      "mukherjee ngr",
      "mnagar",
    ],
    nearbyLocalities: ["GTB Nagar", "Vijay Nagar", "Hudson Lane", "Model Town"],
  },
  {
    canonicalName: "Roop Nagar",
    normalizedName: "roop nagar",
    zone: "North Campus",
    aliases: [
      "roop",
      "rup nagar",
      "roop nagar",
      "roopnagar",
      "rupnagar",
      "roop ngr",
    ],
    nearbyLocalities: ["Kamla Nagar", "Shakti Nagar", "Malka Ganj", "Patel Chest"],
  },
  {
    canonicalName: "Shakti Nagar",
    normalizedName: "shakti nagar",
    zone: "North Campus",
    aliases: [
      "shakti",
      "shakthi",
      "shakti nagar",
      "shaktinagar",
      "shakti ngr",
    ],
    nearbyLocalities: ["Kamla Nagar", "Roop Nagar", "Malka Ganj", "Model Town"],
  },
  {
    canonicalName: "Malka Ganj",
    normalizedName: "malka ganj",
    zone: "North Campus",
    aliases: [
      "malka",
      "malkaganj",
      "malka ganj",
      "malkaganj chowk",
    ],
    nearbyLocalities: ["Kamla Nagar", "Roop Nagar", "Patel Chest", "Shakti Nagar"],
  },
  {
    canonicalName: "Patel Chest",
    normalizedName: "patel chest",
    zone: "North Campus",
    aliases: [
      "patel chest",
      "patelchest",
      "vppc",
      "patel chest institute",
      "vp chest",
    ],
    nearbyLocalities: ["Kamla Nagar", "Hudson Lane", "Vijay Nagar", "Roop Nagar"],
  },
  {
    canonicalName: "Model Town",
    normalizedName: "model town",
    zone: "North Campus",
    aliases: [
      "model town",
      "modeltown",
      "model twn",
    ],
    nearbyLocalities: ["GTB Nagar", "Mukherjee Nagar", "Kamla Nagar"],
  },
  {
    canonicalName: "Old Gupta Colony",
    normalizedName: "old gupta colony",
    zone: "North Campus",
    aliases: [
      "gupta colony",
      "old gupta",
      "old gupta colony",
      "guptacolony",
    ],
    nearbyLocalities: ["Vijay Nagar", "Hudson Lane", "GTB Nagar"],
  },
  {
    canonicalName: "North Campus",
    normalizedName: "north campus",
    zone: "North Campus",
    aliases: [
      "north campus",
      "northcampus",
      "nc",
      "du north",
      "du north campus",
      "delhi university north campus",
      "du",
      "delhi university",
    ],
    nearbyLocalities: ["Kamla Nagar", "Hudson Lane", "Vijay Nagar", "GTB Nagar", "Patel Chest"],
  },
  {
    canonicalName: "Satya Niketan",
    normalizedName: "satya niketan",
    zone: "South Campus",
    aliases: [
      "satya",
      "satya niketan",
      "satyaniketan",
      "satya nktan",
      "satya nktn",
      "satyaniktn",
    ],
    nearbyLocalities: ["South Moti Bagh", "Anand Niketan", "South Campus"],
  },
  {
    canonicalName: "South Moti Bagh",
    normalizedName: "south moti bagh",
    zone: "South Campus",
    aliases: [
      "moti bagh",
      "south moti bagh",
      "motibagh",
      "south motibagh",
    ],
    nearbyLocalities: ["Satya Niketan", "Anand Niketan", "South Campus"],
  },
  {
    canonicalName: "Anand Niketan",
    normalizedName: "anand niketan",
    zone: "South Campus",
    aliases: [
      "anand niketan",
      "anandniketan",
    ],
    nearbyLocalities: ["Satya Niketan", "South Moti Bagh", "South Campus"],
  },
  {
    canonicalName: "South Campus",
    normalizedName: "south campus",
    zone: "South Campus",
    aliases: [
      "south campus",
      "southcampus",
      "sc",
      "du south",
      "du south campus",
      "delhi university south campus",
    ],
    nearbyLocalities: ["Satya Niketan", "South Moti Bagh", "Anand Niketan"],
  },
];

// Common external localities not covered by Basera (for friendly zero-result handling without fake proximity)
export const KNOWN_EXTERNAL_LOCALITIES = [
  "rohini",
  "dwarka",
  "laxmi nagar",
  "kalu sarai",
  "hauz khas",
  "saket",
  "pitampura",
  "janakpuri",
  "noida",
  "gurgaon",
  "gurugram",
  "faridabad",
  "ghaziabad",
  "karol bagh",
  "rajouri garden",
];

// ---------------------------------------------------------------------------
// 2. SEARCH NORMALIZATION LAYER
// ---------------------------------------------------------------------------

/**
 * Normalizes user search input:
 * - lowercase
 * - trim
 * - collapse repeated whitespace
 * - remove harmless punctuation (keeps alphanumeric, # for property code, +, -)
 * - normalize common separators
 */
export function normalizeSearchText(input: string): string {
  if (!input) return "";
  return input
    .toLowerCase()
    .replace(/['"`,.?/\\!@$%^&*()_{}[\]:;~=<>|]/g, " ") // replace harmless punctuation with space
    .replace(/[-_]+/g, " ") // normalize dash/underscore separators
    .replace(/\s+/g, " ") // collapse multiple spaces
    .trim();
}

// ---------------------------------------------------------------------------
// 3. DETERMINISTIC STRING SIMILARITY / FUZZY MATCHING
// ---------------------------------------------------------------------------

/**
 * Damerau-Levenshtein distance (handles insertions, deletions, substitutions, and transpositions).
 */
export function damerauLevenshtein(a: string, b: string): number {
  const al = a.length;
  const bl = b.length;
  if (al === 0) return bl;
  if (bl === 0) return al;

  const matrix: number[][] = [];
  for (let i = 0; i <= al; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= bl; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= al; i++) {
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let min = Math.min(
        matrix[i - 1][j] + 1, // deletion
        matrix[i][j - 1] + 1, // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );

      // Transposition
      if (
        i > 1 &&
        j > 1 &&
        a[i - 1] === b[j - 2] &&
        a[i - 2] === b[j - 1]
      ) {
        min = Math.min(min, matrix[i - 2][j - 2] + cost);
      }

      matrix[i][j] = min;
    }
  }

  return matrix[al][bl];
}

/**
 * Jaro-Winkler string similarity (between 0.0 and 1.0).
 */
export function jaroWinkler(s1: string, s2: string): number {
  if (s1 === s2) return 1.0;
  if (!s1 || !s2) return 0.0;

  const len1 = s1.length;
  const len2 = s2.length;
  const matchDistance = Math.floor(Math.max(len1, len2) / 2) - 1;

  const matches1 = new Array(len1).fill(false);
  const matches2 = new Array(len2).fill(false);

  let matches = 0;
  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - matchDistance);
    const end = Math.min(i + matchDistance + 1, len2);
    for (let j = start; j < end; j++) {
      if (!matches2[j] && s1[i] === s2[j]) {
        matches1[i] = true;
        matches2[j] = true;
        matches++;
        break;
      }
    }
  }

  if (matches === 0) return 0.0;

  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < len1; i++) {
    if (matches1[i]) {
      while (!matches2[k]) k++;
      if (s1[i] !== s2[k]) transpositions++;
      k++;
    }
  }

  const jaro =
    (matches / len1 +
      matches / len2 +
      (matches - transpositions / 2) / matches) /
    3.0;

  // Prefix scale: count common prefix up to 4 chars
  let prefix = 0;
  for (let i = 0; i < Math.min(4, Math.min(len1, len2)); i++) {
    if (s1[i] === s2[i]) prefix++;
    else break;
  }

  const p = 0.1;
  return jaro + prefix * p * (1.0 - jaro);
}

/**
 * Computes deterministic similarity score between target string and candidate string.
 */
export function computeStringSimilarity(target: string, candidate: string): number {
  if (target === candidate) return 1.0;
  const dist = damerauLevenshtein(target, candidate);
  const jw = jaroWinkler(target, candidate);
  const maxLen = Math.max(target.length, candidate.length);
  const editScore = maxLen > 0 ? (maxLen - dist) / maxLen : 1.0;

  // Weighted combination
  return jw * 0.6 + editScore * 0.4;
}

// ---------------------------------------------------------------------------
// 4. CANONICAL LOCALITY MATCHER WITH CONFIDENCE THRESHOLDS
// ---------------------------------------------------------------------------

export const GENERIC_LOCALITY_SUFFIXES = new Set([
  "nagar",
  "lane",
  "colony",
  "chowk",
  "campus",
  "marg",
  "road",
  "bazaar",
  "block",
  "sector",
]);

/**
 * Matches a candidate text (e.g. "kmla", "kamlla", "kamla nagr", "rohini") against canonical localities.
 */
export function matchLocality(rawCandidate: string): LocalityMatchResult | null {
  const norm = normalizeSearchText(rawCandidate);
  if (!norm || norm.length < 2) return null;
  if (GENERIC_LOCALITY_SUFFIXES.has(norm)) return null;

  let bestMatch: LocalityMatchResult | null = null;
  let runnerUpScore = 0;
  let runnerUpLocalityName = "";

  for (const loc of CANONICAL_LOCALITIES) {
    // 1. Direct exact match on canonical or normalized name
    if (norm === loc.normalizedName) {
      return {
        locality: loc,
        confidence: "HIGH",
        score: 1.0,
        matchedToken: loc.canonicalName,
        isAlias: false,
      };
    }

    // 2. Direct exact match on configured alias
    for (const alias of loc.aliases) {
      if (norm === alias) {
        return {
          locality: loc,
          confidence: "HIGH",
          score: 1.0,
          matchedToken: alias,
          isAlias: true,
        };
      }
    }

    // 3. Algorithmic fuzzy similarity against canonical name, normalized name, and aliases
    const candidatesToCompare = [loc.normalizedName, ...loc.aliases];
    for (const cand of candidatesToCompare) {
      const score = computeStringSimilarity(norm, cand);
      const dist = damerauLevenshtein(norm, cand);

      // Determine confidence
      let confidence: MatchConfidence = "LOW";

      // High confidence rules:
      // - length <= 4 and dist <= 1 with high JW score (e.g. "kmla" vs "kamla")
      // - length 5..7 and dist <= 1 (e.g. "kamlla" vs "kamla")
      // - length >= 8 and dist <= 2 (e.g. "kamla nagr" vs "kamla nagar", "hudsn lane" vs "hudson lane")
      // - score >= 0.88
      if (
        (norm.length <= 4 && dist <= 1 && score >= 0.82) ||
        (norm.length >= 5 && norm.length <= 7 && dist <= 1 && score >= 0.84) ||
        (norm.length >= 8 && dist <= 2 && score >= 0.85) ||
        score >= 0.88
      ) {
        confidence = "HIGH";
      } else if (score >= 0.70) {
        confidence = "MEDIUM";
      }

      if (!bestMatch || score > bestMatch.score) {
        if (bestMatch && bestMatch.locality.canonicalName !== loc.canonicalName) {
          runnerUpScore = bestMatch.score;
          runnerUpLocalityName = bestMatch.locality.canonicalName;
        }
        bestMatch = {
          locality: loc,
          confidence,
          score,
          matchedToken: cand,
          isAlias: cand !== loc.normalizedName,
        };
      } else if (
        loc.canonicalName !== bestMatch.locality.canonicalName &&
        score > runnerUpScore
      ) {
        runnerUpScore = score;
        runnerUpLocalityName = loc.canonicalName;
      }
    }
  }

  if (!bestMatch) return null;

  // Ambiguity guard: If best match and runner-up from a DIFFERENT locality are both medium/high and within 0.05,
  // downgrade confidence to MEDIUM so we don't silently pick the wrong locality.
  if (
    runnerUpScore > 0 &&
    runnerUpLocalityName !== bestMatch.locality.canonicalName &&
    bestMatch.score - runnerUpScore < 0.05 &&
    bestMatch.score < 0.98
  ) {
    bestMatch.confidence = "MEDIUM";
  }

  if (bestMatch.confidence === "LOW") {
    return null;
  }

  return bestMatch;
}

// ---------------------------------------------------------------------------
// 5. NATURAL QUERY PARSER
// ---------------------------------------------------------------------------

/**
 * Parses user search query into structured search intent, location intent, and remaining text.
 * Deterministic, fast, and maintainable without NLP/LLM dependencies.
 */
export function parseNaturalSearchQuery(rawQuery: string): ParsedSearchIntent {
  const normalized = normalizeSearchText(rawQuery);
  if (!normalized) {
    return {
      rawQuery,
      normalizedQuery: "",
      remainingQuery: "",
    };
  }

  let workingTokens = normalized.split(" ");
  let inferredType: "PG" | "FLAT" | "CO_LIVING" | undefined;
  let inferredGender: "GIRLS" | "BOYS" | "CO_ED" | undefined;
  let inferredSharing: "SINGLE" | "DOUBLE" | "TRIPLE" | undefined;
  let inferredBudgetMin: number | undefined;
  let inferredBudgetMax: number | undefined;
  let inferredLocality: string | undefined;
  let suggestedLocality: string | undefined;
  let unrecognizedLocality: string | undefined;

  // Track which token indices have been consumed by intent parsing
  const consumedIndices = new Set<number>();

  // A. Property Type Detection
  // Check multi-word phrases first
  const fullText = workingTokens.join(" ");
  if (/\bpaying guest(s)?\b/.test(fullText)) {
    inferredType = "PG";
    workingTokens.forEach((t, i) => {
      if (t === "paying" || t === "guest" || t === "guests") consumedIndices.add(i);
    });
  } else if (/\b(co living|coliving|co-living)\b/.test(fullText)) {
    inferredType = "CO_LIVING";
    workingTokens.forEach((t, i) => {
      if (t === "co" || t === "living" || t === "coliving") consumedIndices.add(i);
    });
  } else if (/\b(flat|flats|apartment|apartments|1bhk|2bhk|3bhk)\b/.test(fullText)) {
    inferredType = "FLAT";
    workingTokens.forEach((t, i) => {
      if (["flat", "flats", "apartment", "apartments", "1bhk", "2bhk", "3bhk"].includes(t)) {
        consumedIndices.add(i);
      }
    });
  } else if (/\b(pg|pgs|hostel|hostels)\b/.test(fullText)) {
    inferredType = "PG";
    workingTokens.forEach((t, i) => {
      if (["pg", "pgs", "hostel", "hostels"].includes(t)) {
        consumedIndices.add(i);
      }
    });
  }

  // B. Gender Preference Detection
  if (/\b(girls|girl|female|women|ladies)\b/.test(fullText)) {
    inferredGender = "GIRLS";
    workingTokens.forEach((t, i) => {
      if (["girls", "girl", "female", "women", "ladies"].includes(t)) {
        consumedIndices.add(i);
      }
    });
  } else if (/\b(boys|boy|male|men|gents)\b/.test(fullText)) {
    inferredGender = "BOYS";
    workingTokens.forEach((t, i) => {
      if (["boys", "boy", "male", "men", "gents"].includes(t)) {
        consumedIndices.add(i);
      }
    });
  } else if (/\b(coed|co ed|mixed|unisex)\b/.test(fullText)) {
    inferredGender = "CO_ED";
    workingTokens.forEach((t, i) => {
      if (["coed", "co", "ed", "mixed", "unisex"].includes(t)) {
        consumedIndices.add(i);
      }
    });
  }

  // C. Room Sharing Detection
  if (/\b(single|private room|single room)\b/.test(fullText)) {
    inferredSharing = "SINGLE";
    workingTokens.forEach((t, i) => {
      if (["single", "private"].includes(t)) consumedIndices.add(i);
    });
  } else if (/\b(double|double sharing|2 sharing|twin sharing)\b/.test(fullText)) {
    inferredSharing = "DOUBLE";
    workingTokens.forEach((t, i) => {
      if (["double", "twin"].includes(t)) consumedIndices.add(i);
    });
  } else if (/\b(triple|triple sharing|3 sharing)\b/.test(fullText)) {
    inferredSharing = "TRIPLE";
    workingTokens.forEach((t, i) => {
      if (["triple"].includes(t)) consumedIndices.add(i);
    });
  }

  // D. Budget Detection (e.g. "under 10k", "under 10000", "below 15k", "20k+")
  const budgetUnderMatch = fullText.match(/\b(?:under|below|less than)\s*(\d{1,2}k|\d{4,6})\b/);
  if (budgetUnderMatch) {
    const rawNum = budgetUnderMatch[1];
    const val = rawNum.endsWith("k") ? parseInt(rawNum) * 1000 : parseInt(rawNum);
    if (!isNaN(val)) {
      if (val <= 10000) {
        inferredBudgetMax = 10000;
      } else if (val <= 15000) {
        inferredBudgetMin = 10000;
        inferredBudgetMax = 15000;
      } else if (val <= 20000) {
        inferredBudgetMin = 15000;
        inferredBudgetMax = 20000;
      } else {
        inferredBudgetMax = val;
      }
    }
  }

  // Consume budget words
  workingTokens.forEach((t, i) => {
    if (
      ["under", "below", "less", "than"].includes(t) &&
      (workingTokens[i + 1]?.match(/^(\d{1,2}k|\d{4,6})$/) ||
        workingTokens[i - 1]?.match(/^(\d{1,2}k|\d{4,6})$/))
    ) {
      consumedIndices.add(i);
    }
    if (t.match(/^(\d{1,2}k|\d{4,6})$/)) {
      consumedIndices.add(i);
    }
  });

  // E. Stop words / filler prepositions
  const stopWords = new Set([
    "in",
    "at",
    "near",
    "around",
    "for",
    "students",
    "student",
    "accommodation",
    "housing",
    "room",
    "rooms",
    "sharing",
    "only",
  ]);

  // F. Locality Extraction
  // First, check unconsumed tokens as potential multi-token or single-token locality phrases
  const remainingTokenList = workingTokens.filter((_, i) => !consumedIndices.has(i));
  const remainingTokensString = remainingTokenList.join(" ");

  // 1. Check known external localities first (e.g. "rohini", "dwarka")
  for (const ext of KNOWN_EXTERNAL_LOCALITIES) {
    const extRegex = new RegExp(`\\b${ext}\\b`);
    if (extRegex.test(remainingTokensString)) {
      unrecognizedLocality = ext.charAt(0).toUpperCase() + ext.slice(1);
      // Consume the external locality token
      workingTokens.forEach((t, i) => {
        if (ext.split(" ").includes(t)) consumedIndices.add(i);
      });
      break;
    }
  }

  // 2. If not external, match against canonical localities
  if (!unrecognizedLocality) {
    // Try n-grams from the unconsumed tokens (3-gram down to 1-gram)
    // to find the most specific locality match
    let bestLocalityMatch: LocalityMatchResult | null = null;
    let bestMatchTokenSpan: { start: number; end: number } | null = null;

    // Filter candidate sub-phrases
    const cleanTokens = workingTokens.map((t, i) => (consumedIndices.has(i) ? "" : t));

    for (let spanLen = Math.min(cleanTokens.length, 4); spanLen >= 1; spanLen--) {
      for (let i = 0; i <= cleanTokens.length - spanLen; i++) {
        const slice = cleanTokens.slice(i, i + spanLen).filter(Boolean);
        if (slice.length === 0) continue;

        // Skip if slice is purely stop words
        if (slice.every((t) => stopWords.has(t))) continue;

        const candidatePhrase = slice.join(" ");
        const match = matchLocality(candidatePhrase);

        if (match) {
          if (!bestLocalityMatch || match.score > bestLocalityMatch.score) {
            bestLocalityMatch = match;
            bestMatchTokenSpan = { start: i, end: i + spanLen };
            if (match.score === 1.0) break; // Perfect match
          }
        }
      }
      if (bestLocalityMatch && bestLocalityMatch.score === 1.0) break;
    }

    if (bestLocalityMatch && bestMatchTokenSpan) {
      if (bestLocalityMatch.confidence === "HIGH") {
        inferredLocality = bestLocalityMatch.locality.canonicalName;
        // Mark tokens consumed
        for (let i = bestMatchTokenSpan.start; i < bestMatchTokenSpan.end; i++) {
          consumedIndices.add(i);
        }
      } else if (bestLocalityMatch.confidence === "MEDIUM") {
        suggestedLocality = bestLocalityMatch.locality.canonicalName;
      }
    }
  }

  // G. Consume stop words if they were adjacent to location/intent
  workingTokens.forEach((t, i) => {
    if (stopWords.has(t)) {
      consumedIndices.add(i);
    }
  });

  // H. Gather remaining free-text tokens
  const remainingTokens = workingTokens
    .filter((_, i) => !consumedIndices.has(i))
    .filter((t) => !stopWords.has(t))
    .join(" ")
    .trim();

  return {
    rawQuery,
    normalizedQuery: normalized,
    inferredType,
    inferredGender,
    inferredSharing,
    inferredBudgetMin,
    inferredBudgetMax,
    inferredLocality,
    suggestedLocality,
    unrecognizedLocality,
    remainingQuery: remainingTokens,
  };
}

// ---------------------------------------------------------------------------
// 6. NEARBY LOCALITY RECOMMENDATION HELPER
// ---------------------------------------------------------------------------

/**
 * Returns the configured nearby localities for a canonical locality.
 */
export function getNearbyLocalities(localityName: string): LocalityDefinition[] {
  const norm = normalizeSearchText(localityName);
  const found = CANONICAL_LOCALITIES.find(
    (l) => l.normalizedName === norm || l.canonicalName.toLowerCase() === norm
  );
  if (!found || !found.nearbyLocalities.length) return [];

  const results: LocalityDefinition[] = [];
  for (const nearbyName of found.nearbyLocalities) {
    const nearbyLoc = CANONICAL_LOCALITIES.find((l) => l.canonicalName === nearbyName);
    if (nearbyLoc) results.push(nearbyLoc);
  }
  return results;
}
