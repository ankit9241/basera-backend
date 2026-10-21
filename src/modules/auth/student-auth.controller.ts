import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import prisma from "../../lib/prisma";
import { signStudentToken, getStudentCookieOptions, getStudentClearCookieOptions, STUDENT_COOKIE_NAME } from "../../lib/jwt";
import { verifyGoogleCredential } from "../../lib/google-auth";
import { ApiError } from "../../middleware/error-handler";
import { Prisma } from "@prisma/client";

const googleAuthSchema = z.object({
  idToken: z.string().optional(),
  accessToken: z.string().optional(),
  code: z.string().optional(),
  redirectUri: z.string().optional(),
});

export async function googleStudentAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { idToken, accessToken, code, redirectUri } = googleAuthSchema.parse(req.body);

    const verifiedUser = await verifyGoogleCredential({
      idToken,
      accessToken,
      code,
      redirectUri,
    });

    // 1. Require a verified Google email before account creation or linking
    if (!verifiedUser.emailVerified) {
      throw new ApiError(401, "Your Google email isn't verified. Verify it with Google and try again.");
    }

    const normalizedEmail = verifiedUser.email.toLowerCase().trim();
    const googleSub = verifiedUser.sub;

    let isNewUser = false;
    let user;

    // 2. Identify existing accounts
    const userByGoogleId = await prisma.user.findUnique({
      where: { googleId: googleSub },
      include: {
        college: { select: { id: true, name: true, shortCode: true, campusZone: true } },
      },
    });

    const userByEmail = await prisma.user.findFirst({
      where: { personalEmail: normalizedEmail },
      include: {
        college: { select: { id: true, name: true, shortCode: true, campusZone: true } },
      },
    });

    // 3. Reject if Google ID and email resolve to two different user records
    if (userByGoogleId && userByEmail && userByGoogleId.id !== userByEmail.id) {
      throw new ApiError(409, "This Google account and email conflict with an existing account. Please sign in with the account you originally used or contact support.");
    }

    if (userByGoogleId) {
      // Returning user matched by Google ID
      user = await prisma.user.update({
        where: { id: userByGoogleId.id },
        data: {
          personalEmail: userByGoogleId.personalEmail || normalizedEmail,
          fullName:
            (!userByGoogleId.fullName || userByGoogleId.fullName === "DU Student" || userByGoogleId.fullName === "Student") && verifiedUser.name
              ? verifiedUser.name
              : userByGoogleId.fullName,
          avatarUrl: userByGoogleId.avatarUrl || verifiedUser.picture,
        },
        include: {
          college: { select: { id: true, name: true, shortCode: true, campusZone: true } },
        },
      });
      isNewUser = false;
    } else if (userByEmail) {
      // Existing user matched by email
      if (userByEmail.googleId && userByEmail.googleId !== googleSub) {
        throw new ApiError(409, "This email is linked to a different Google account. Try the account you originally used or contact support.");
      }

      // Safely link Google identity to this account
      user = await prisma.user.update({
        where: { id: userByEmail.id },
        data: {
          googleId: googleSub,
          fullName:
            (!userByEmail.fullName || userByEmail.fullName === "DU Student" || userByEmail.fullName === "Student") && verifiedUser.name
              ? verifiedUser.name
              : userByEmail.fullName,
          avatarUrl: userByEmail.avatarUrl || verifiedUser.picture,
        },
        include: {
          college: { select: { id: true, name: true, shortCode: true, campusZone: true } },
        },
      });
      isNewUser = false;
    } else {
      // First-time user creation
      try {
        user = await prisma.user.create({
          data: {
            googleId: googleSub,
            personalEmail: normalizedEmail,
            fullName: verifiedUser.name || normalizedEmail.split("@")[0] || "Student",
            avatarUrl: verifiedUser.picture,
            role: "STUDENT",
          },
          include: {
            college: { select: { id: true, name: true, shortCode: true, campusZone: true } },
          },
        });
        isNewUser = true;
      } catch (createErr: any) {
        if (createErr instanceof Prisma.PrismaClientKnownRequestError && createErr.code === "P2002") {
          // Concurrent request created user with this googleId
          const concurrentUser = await prisma.user.findUnique({
            where: { googleId: googleSub },
            include: {
              college: { select: { id: true, name: true, shortCode: true, campusZone: true } },
            },
          });
          if (concurrentUser && (!concurrentUser.personalEmail || concurrentUser.personalEmail === normalizedEmail)) {
            user = concurrentUser;
            isNewUser = false;
          } else {
            throw new ApiError(409, "This email is linked to a different Google account. Try the account you originally used or contact support.");
          }
        } else {
          throw createErr;
        }
      }
    }

    const token = signStudentToken({
      userId: user.id,
      phone: user.phone || user.personalEmail || "",
      role: "STUDENT",
    });

    res.cookie(STUDENT_COOKIE_NAME, token, getStudentCookieOptions(req));

    res.status(200).json({
      success: true,
      message: "Successfully authenticated with Google",
      isNewUser,
      token,
      user: {
        id: user.id,
        phone: user.phone,
        fullName: user.fullName,
        personalEmail: user.personalEmail,
        collegeEmail: user.collegeEmail,
        googleId: user.googleId,
        avatarUrl: user.avatarUrl,
        collegeId: user.collegeId,
        college: user.college,
        studyYear: user.studyYear,
        isCollegeVerified: user.isCollegeVerified,
        collegeVerifiedAt: user.collegeVerifiedAt,
        budgetRange: user.budgetRange,
        gender: user.gender,
        preferredLocations: user.preferredLocations,
        notifyVisits: user.notifyVisits,
        notifyMatches: user.notifyMatches,
        notifyOffers: user.notifyOffers,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    res.clearCookie(STUDENT_COOKIE_NAME, getStudentClearCookieOptions(req));
    next(error);
  }
}

export async function getStudentMe(req: Request, res: Response): Promise<void> {
  const user = req.user as any;
  res.status(200).json({
    success: true,
    user: {
      id: user.id,
      phone: user.phone,
      fullName: user.fullName,
      personalEmail: user.personalEmail,
      collegeEmail: user.collegeEmail,
      collegeId: user.collegeId,
      college: user.college,
      studyYear: user.studyYear,
      isCollegeVerified: user.isCollegeVerified,
      collegeVerifiedAt: user.collegeVerifiedAt,
      budgetRange: user.budgetRange,
      gender: user.gender,
      preferredLocations: user.preferredLocations,
      notifyVisits: user.notifyVisits,
      notifyMatches: user.notifyMatches,
      notifyOffers: user.notifyOffers,
      createdAt: user.createdAt,
    },
  });
}

export async function logoutStudent(req: Request, res: Response): Promise<void> {
  res.clearCookie(STUDENT_COOKIE_NAME, getStudentClearCookieOptions(req));
  res.status(200).json({
    success: true,
    message: "Logged out successfully",
  });
}
