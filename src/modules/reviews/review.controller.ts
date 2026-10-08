import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import {
  getStudentReviewEligibilityAndExisting,
  createStudentReviewService,
  updateStudentReviewService,
  deleteStudentReviewService,
  getPublicPropertyReviewsService,
  getAdminReviewsService,
  updateAdminReviewStatusService,
  deleteAdminReviewService,
} from "./review.service";
import { ApiError } from "../../middleware/error-handler";
import type { ReviewStatus } from "@prisma/client";

const createReviewSchema = z.object({
  rating: z.number().int().min(1, "Rating must be between 1 and 5").max(5, "Rating must be between 1 and 5"),
  reviewText: z.string().trim().min(10, "Review text must be at least 10 characters").max(2000, "Review text cannot exceed 2000 characters"),
});

const updateReviewSchema = z.object({
  rating: z.number().int().min(1, "Rating must be between 1 and 5").max(5, "Rating must be between 1 and 5").optional(),
  reviewText: z.string().trim().min(10, "Review text must be at least 10 characters").max(2000, "Review text cannot exceed 2000 characters").optional(),
});

const adminStatusSchema = z.object({
  status: z.enum(["PENDING", "APPROVED", "REJECTED"]),
});

// ============================================================================
// STUDENT HANDLERS
// ============================================================================

export async function getStudentPropertyReview(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const student = req.user;
    if (!student) {
      throw new ApiError(401, "Authentication required.");
    }

    const propertyId = String(req.params.propertyId || "");
    if (!propertyId) {
      throw new ApiError(400, "Property ID is required.");
    }

    const data = await getStudentReviewEligibilityAndExisting(student.id, propertyId);
    res.status(200).json({
      success: true,
      ...data,
    });
  } catch (error) {
    next(error);
  }
}

export async function createStudentReview(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const student = req.user;
    if (!student) {
      throw new ApiError(401, "Authentication required.");
    }

    const propertyId = String(req.params.propertyId || "");
    if (!propertyId) {
      throw new ApiError(400, "Property ID is required.");
    }

    const { rating, reviewText } = createReviewSchema.parse(req.body);

    const review = await createStudentReviewService({
      userId: student.id,
      propertyId,
      rating,
      reviewText,
    });

    res.status(201).json({
      success: true,
      message: "Your review has been submitted for moderation. Thank you for your feedback!",
      review: {
        id: review.id,
        propertyId: review.propertyId,
        rating: review.rating,
        reviewText: review.reviewText,
        status: review.status,
        createdAt: review.createdAt.toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function updateStudentReview(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const student = req.user;
    if (!student) {
      throw new ApiError(401, "Authentication required.");
    }

    const reviewId = String(req.params.id || "");
    if (!reviewId) {
      throw new ApiError(400, "Review ID is required.");
    }

    const { rating, reviewText } = updateReviewSchema.parse(req.body);
    if (rating === undefined && reviewText === undefined) {
      throw new ApiError(400, "Please provide rating or reviewText to update.");
    }

    const review = await updateStudentReviewService({
      userId: student.id,
      reviewId,
      rating,
      reviewText,
    });

    res.status(200).json({
      success: true,
      message: "Review updated. It has been resubmitted for moderation.",
      review: {
        id: review.id,
        propertyId: review.propertyId,
        rating: review.rating,
        reviewText: review.reviewText,
        status: review.status,
        updatedAt: review.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteStudentReview(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const student = req.user;
    if (!student) {
      throw new ApiError(401, "Authentication required.");
    }

    const reviewId = String(req.params.id || "");
    if (!reviewId) {
      throw new ApiError(400, "Review ID is required.");
    }

    await deleteStudentReviewService(student.id, reviewId);

    res.status(200).json({
      success: true,
      message: "Review deleted successfully.",
    });
  } catch (error) {
    next(error);
  }
}

// ============================================================================
// PUBLIC HANDLERS
// ============================================================================

export async function getPublicPropertyReviews(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const slugOrCode = String(req.params.slugOrCode || "");
    if (!slugOrCode) {
      throw new ApiError(400, "Property slug or code is required.");
    }

    const data = await getPublicPropertyReviewsService(slugOrCode);
    res.status(200).json({
      success: true,
      ...data,
    });
  } catch (error) {
    next(error);
  }
}

// ============================================================================
// ADMIN HANDLERS
// ============================================================================

export async function getAdminReviews(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { status, propertyId, page, limit } = req.query;

    const pageNum = page ? Math.max(1, parseInt(String(page), 10) || 1) : 1;
    const limitNum = limit ? Math.min(100, Math.max(1, parseInt(String(limit), 10) || 50)) : 50;

    const data = await getAdminReviewsService({
      status: status ? String(status).toUpperCase() : undefined,
      propertyId: propertyId ? String(propertyId) : undefined,
      page: pageNum,
      limit: limitNum,
    });

    res.status(200).json({
      success: true,
      ...data,
    });
  } catch (error) {
    next(error);
  }
}

export async function updateAdminReviewStatus(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const admin = req.admin;
    if (!admin) {
      throw new ApiError(401, "Admin authentication required.");
    }

    const reviewId = String(req.params.id || "");
    if (!reviewId) {
      throw new ApiError(400, "Review ID is required.");
    }

    const { status } = adminStatusSchema.parse(req.body);

    const { review, stats } = await updateAdminReviewStatusService(
      reviewId,
      status as ReviewStatus,
      admin.id
    );

    res.status(200).json({
      success: true,
      message: `Review status changed to ${status}.`,
      review,
      propertyStats: stats,
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteAdminReview(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const admin = req.admin;
    if (!admin) {
      throw new ApiError(401, "Admin authentication required.");
    }

    const reviewId = String(req.params.id || "");
    if (!reviewId) {
      throw new ApiError(400, "Review ID is required.");
    }

    const { stats } = await deleteAdminReviewService(reviewId, admin.id);

    res.status(200).json({
      success: true,
      message: "Review permanently deleted.",
      propertyStats: stats,
    });
  } catch (error) {
    next(error);
  }
}
