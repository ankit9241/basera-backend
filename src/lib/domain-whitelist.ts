import prisma from "./prisma";

export interface DomainValidationResult {
  isApproved: boolean;
  collegeId: string | null;
  domain: string;
}

/**
 * Validates whether an email belongs to an approved Delhi University institutional domain.
 *
 * Rules:
 * 1. Allow `@du.ac.in` and any subdomain ending in `.du.ac.in` (e.g. `@kmc.du.ac.in`, `@hrc.du.ac.in`, `@srcc.du.ac.in`).
 * 2. Database whitelist fallback: Allows legitimate DU institutional domains configured in the database
 *    outside `*.du.ac.in` (e.g. `hinducollege.ac.in`, `mirandahouse.ac.in`, `svc.ac.in`, `lsr.edu.in`).
 * 3. Strictly reject personal email providers (Gmail, Yahoo, etc.) and all non-DU domains.
 */
export async function validateInstitutionalDomain(email: string): Promise<DomainValidationResult> {
  const normalized = email.toLowerCase().trim();
  const parts = normalized.split("@");
  if (parts.length !== 2 || !parts[1]) {
    return { isApproved: false, collegeId: null, domain: "" };
  }

  const domain = parts[1];

  // 1. Check if domain is du.ac.in or any subdomain ending in .du.ac.in
  const isDuDomain = domain === "du.ac.in" || domain.endsWith(".du.ac.in");

  // Query database-backed approved college domains for college mapping and fallback validation
  const approvedDomains = await prisma.collegeEmailDomain.findMany({
    where: { isActive: true },
    select: {
      domain: true,
      collegeId: true,
    },
  });

  // Attempt to match college from database
  const exactMatch = approvedDomains.find((d) => d.domain.toLowerCase() === domain);
  const parentMatch = approvedDomains.find((d) => domain.endsWith("." + d.domain.toLowerCase()));
  const matchedCollegeRecord = exactMatch || parentMatch;

  if (isDuDomain) {
    return {
      isApproved: true,
      collegeId: matchedCollegeRecord?.collegeId || null,
      domain,
    };
  }

  // 2. Database fallback for legitimate DU institutional domains outside *.du.ac.in
  if (matchedCollegeRecord) {
    return {
      isApproved: true,
      collegeId: matchedCollegeRecord.collegeId,
      domain,
    };
  }

  // 3. Reject all other non-DU domains
  return {
    isApproved: false,
    collegeId: null,
    domain,
  };
}
