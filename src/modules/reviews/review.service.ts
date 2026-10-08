import prisma from "../../lib/prisma";
import { ApiError } from "../../middleware/error-handler";
import type { ReviewStatus } from "@prisma/client";
import { logAudit } from "../../lib/audit";

export interface PublicReviewDTO {
  id: string;
  rating: number;
  reviewText: string;
  reviewerLabel: string;
  createdAt: string;
}

export interface AdminReviewDTO {
  id: string;
  propertyId: string;
  property: {
    id: string;
    publicName: string;
    propertyCode: string;
    slug: string;
    localityZone: string;
  };
  userId: string;
  reviewer: {
    id: string;
    fullName: string;
    personalEmail: string | null;
    collegeEmail: string | null;
    phone: string | null;
    isCollegeVerified: boolean;
    college?: { id: string; name: string; shortCode: string; campusZone?: string } | null;
  };
  rating: number;
  reviewText: string;
  status: ReviewStatus;
  hasCompletedVisit: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Re-calculates and updates the cached property rating and reviewCount
 * strictly based on APPROVED reviews only.
 */
export async function calculatePropertyRatingAggregate(propertyId: string): Promise<{
  rating: number;
  reviewCount: number;
}> {
  const [count, agg] = await Promise.all([
    prisma.propertyReview.count({
      where: { propertyId, status: "APPROVED" },
    }),
    prisma.propertyReview.aggregate({
      where: { propertyId, status: "APPROVED" },
      _avg: { rating: true },
    }),
  ]);

  const rating = agg._avg.rating ? Math.round(agg._avg.rating * 10) / 10 : 0;

  await prisma.property.update({
    where: { id: propertyId },
    data: {
      rating,
      reviewCount: count,
    },
  });

  return { rating, reviewCount: count };
}

/**
 * Normalizes property identifiers (ID, slug, or propertyCode).
 */
export function normalizePropertyIdentifiers(idOrCode: string) {
  let decoded = idOrCode;
  try {
    decoded = decodeURIComponent(idOrCode);
  } catch {}

  const normalizedCode = decoded.toUpperCase().replace(/^PF-/, "PF#");
  const unhyphenatedCode = decoded.toUpperCase().replace("-", "#");

  return {
    raw: idOrCode,
    decoded,
    normalizedCode,
    unhyphenatedCode,
  };
}

/**
 * Finds a property by its ID, slug, or property code.
 */
export async function findPropertyByIdOrSlug(slugOrCode: string) {
  const ids = normalizePropertyIdentifiers(slugOrCode);
  return prisma.property.findFirst({
    where: {
      OR: [
        { id: ids.raw },
        { id: ids.decoded },
        { slug: ids.raw.toLowerCase() },
        { slug: ids.decoded.toLowerCase() },
        { propertyCode: ids.normalizedCode },
        { propertyCode: ids.unhyphenatedCode },
      ],
    },
    select: {
      id: true,
      publicName: true,
      propertyCode: true,
      slug: true,
      rating: true,
      reviewCount: true,
    },
  });
}

/**
 * Checks whether a student has a COMPLETED visit for a property
 * and retrieves their existing review if one exists.
 */
export async function getStudentReviewEligibilityAndExisting(
  userId: string,
  propertyId: string
) {
  const [completedVisit, existingReview] = await Promise.all([
    prisma.visitBooking.findFirst({
      where: {
        userId,
        propertyId,
        status: "COMPLETED",
      },
      select: { id: true, visitDate: true },
    }),
    prisma.propertyReview.findUnique({
      where: {
        propertyId_userId: { propertyId, userId },
      },
    }),
  ]);

  return {
    isEligible: true,
    hasCompletedVisit: !!completedVisit,
    completedVisitDate: completedVisit?.visitDate ?? null,
    existingReview: existingReview
      ? {
          id: existingReview.id,
          propertyId: existingReview.propertyId,
          rating: existingReview.rating,
          reviewText: existingReview.reviewText,
          status: existingReview.status,
          createdAt: existingReview.createdAt.toISOString(),
          updatedAt: existingReview.updatedAt.toISOString(),
        }
      : null,
  };
}

/**
 * Creates a new review for an authenticated student.
 */
export async function createStudentReviewService(params: {
  userId: string;
  propertyId: string;
  rating: number;
  reviewText: string;
}) {
  const { userId, propertyId, rating, reviewText } = params;

  // 1. Verify property existence
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: { id: true },
  });
  if (!property) {
    throw new ApiError(404, "Property not found.");
  }

  // 2. Enforce one review per property per student
  const existing = await prisma.propertyReview.findUnique({
    where: {
      propertyId_userId: { propertyId, userId },
    },
  });
  if (existing) {
    throw new ApiError(
      409,
      "You have already submitted a review for this property. You can edit your existing review instead."
    );
  }

  // 3. Create review with APPROVED status (immediately public, no admin approval required)
  const review = await prisma.propertyReview.create({
    data: {
      propertyId,
      userId,
      rating,
      reviewText: reviewText.trim(),
      status: "APPROVED",
    },
  });

  // 4. Immediately recalculate property rating and reviewCount
  await calculatePropertyRatingAggregate(propertyId);

  return review;
}

/**
 * Edits an existing review belonging to the student.
 * Review remains APPROVED and updates immediately in public view.
 */
export async function updateStudentReviewService(params: {
  userId: string;
  reviewId: string;
  rating?: number;
  reviewText?: string;
}) {
  const { userId, reviewId, rating, reviewText } = params;

  const review = await prisma.propertyReview.findUnique({
    where: { id: reviewId },
  });

  if (!review) {
    throw new ApiError(404, "Review not found.");
  }

  // IDOR Protection: Student can only edit their own review
  if (review.userId !== userId) {
    throw new ApiError(403, "Access denied. You can only edit your own reviews.");
  }

  const updated = await prisma.propertyReview.update({
    where: { id: reviewId },
    data: {
      ...(rating !== undefined ? { rating } : {}),
      ...(reviewText !== undefined ? { reviewText: reviewText.trim() } : {}),
      status: "APPROVED", // Keeps review live immediately
    },
  });

  // Re-calculate property rating aggregate
  await calculatePropertyRatingAggregate(review.propertyId);

  return updated;
}

/**
 * Deletes a review belonging to the student.
 */
export async function deleteStudentReviewService(userId: string, reviewId: string) {
  const review = await prisma.propertyReview.findUnique({
    where: { id: reviewId },
  });

  if (!review) {
    throw new ApiError(404, "Review not found.");
  }

  // IDOR Protection
  if (review.userId !== userId) {
    throw new ApiError(403, "Access denied. You can only delete your own reviews.");
  }

  await prisma.propertyReview.delete({
    where: { id: reviewId },
  });

  // Re-calculate property rating aggregate
  await calculatePropertyRatingAggregate(review.propertyId);

  return { success: true };
}

/**
 * Fetches public reviews for a property.
 * ONLY APPROVED reviews are included.
 * Reviewer identity is completely anonymized.
 */
export async function getPublicPropertyReviewsService(slugOrCode: string) {
  const property = await findPropertyByIdOrSlug(slugOrCode);
  if (!property) {
    throw new ApiError(404, "Property not found.");
  }

  const approvedReviews = await prisma.propertyReview.findMany({
    where: {
      propertyId: property.id,
      status: "APPROVED",
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      rating: true,
      reviewText: true,
      createdAt: true,
    },
  });

  const reviews: PublicReviewDTO[] = approvedReviews.map((r) => ({
    id: r.id,
    rating: r.rating,
    reviewText: r.reviewText,
    reviewerLabel: "Verified Student", // PUBLIC PRIVACY: NEVER leak real identity
    createdAt: r.createdAt.toISOString(),
  }));

  return {
    propertyId: property.id,
    propertyCode: property.propertyCode,
    averageRating: property.rating > 0 ? property.rating : null,
    reviewCount: property.reviewCount,
    reviews,
  };
}

/**
 * Admin view of all reviews across properties.
 */
export async function getAdminReviewsService(options: {
  status?: string;
  propertyId?: string;
  page?: number;
  limit?: number;
}) {
  const { status, propertyId, page = 1, limit = 50 } = options;
  const skip = (page - 1) * limit;

  const where: any = {};
  if (status && status !== "ALL") {
    where.status = status as ReviewStatus;
  }
  if (propertyId) {
    where.propertyId = propertyId;
  }

  const [total, rawReviews] = await Promise.all([
    prisma.propertyReview.count({ where }),
    prisma.propertyReview.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: {
        property: {
          select: {
            id: true,
            publicName: true,
            propertyCode: true,
            slug: true,
            localityZone: true,
          },
        },
        user: {
          select: {
            id: true,
            fullName: true,
            personalEmail: true,
            collegeEmail: true,
            phone: true,
            isCollegeVerified: true,
            college: {
              select: {
                id: true,
                name: true,
                shortCode: true,
                campusZone: true,
              },
            },
            visits: {
              select: {
                id: true,
                status: true,
                propertyId: true,
              },
            },
          },
        },
      },
    }),
  ]);

  const reviews: AdminReviewDTO[] = rawReviews.map((r) => {
    const hasCompletedVisit = r.user.visits.some(
      (v) => v.propertyId === r.propertyId && v.status === "COMPLETED"
    );

    return {
      id: r.id,
      propertyId: r.propertyId,
      property: r.property,
      userId: r.userId,
      reviewer: {
        id: r.user.id,
        fullName: r.user.fullName,
        personalEmail: r.user.personalEmail,
        collegeEmail: r.user.collegeEmail,
        phone: r.user.phone,
        isCollegeVerified: r.user.isCollegeVerified,
        college: r.user.college
          ? {
              id: r.user.college.id,
              name: r.user.college.name,
              shortCode: r.user.college.shortCode,
              campusZone: r.user.college.campusZone,
            }
          : null,
      },
      rating: r.rating,
      reviewText: r.reviewText,
      status: r.status,
      hasCompletedVisit,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  });

  return {
    reviews,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
}

/**
 * Admin updates the moderation status of a review (APPROVED, REJECTED, PENDING).
 */
export async function updateAdminReviewStatusService(
  reviewId: string,
  newStatus: ReviewStatus,
  adminId: string
) {
  const review = await prisma.propertyReview.findUnique({
    where: { id: reviewId },
  });

  if (!review) {
    throw new ApiError(404, "Review not found.");
  }

  const updated = await prisma.propertyReview.update({
    where: { id: reviewId },
    data: { status: newStatus },
  });

  // Re-calculate property rating aggregate
  const stats = await calculatePropertyRatingAggregate(review.propertyId);

  await logAudit({
    actorId: adminId,
    action: "REVIEW_STATUS_UPDATED",
    targetEntity: "PropertyReview",
    targetId: reviewId,
    details: {
      previousStatus: review.status,
      newStatus,
      propertyId: review.propertyId,
      rating: review.rating,
      newPropertyRating: stats.rating,
      newReviewCount: stats.reviewCount,
    },
  });

  return { review: updated, stats };
}

/**
 * Admin deletes a review record.
 */
export async function deleteAdminReviewService(reviewId: string, adminId: string) {
  const review = await prisma.propertyReview.findUnique({
    where: { id: reviewId },
  });

  if (!review) {
    throw new ApiError(404, "Review not found.");
  }

  await prisma.propertyReview.delete({
    where: { id: reviewId },
  });

  // Re-calculate property rating aggregate
  const stats = await calculatePropertyRatingAggregate(review.propertyId);

  await logAudit({
    actorId: adminId,
    action: "REVIEW_DELETED",
    targetEntity: "PropertyReview",
    targetId: reviewId,
    details: {
      propertyId: review.propertyId,
      rating: review.rating,
      newPropertyRating: stats.rating,
      newReviewCount: stats.reviewCount,
    },
  });

  return { success: true, stats };
}
