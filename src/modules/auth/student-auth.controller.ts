import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import prisma from "../../lib/prisma";
import { signStudentToken, getStudentCookieOptions, getStudentClearCookieOptions, STUDENT_COOKIE_NAME } from "../../lib/jwt";
import { verifyGoogleCredential } from "../../lib/google-auth";

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

    let user = await prisma.user.findFirst({
      where: {
        OR: [
          { googleId: verifiedUser.sub },
          { personalEmail: verifiedUser.email },
        ],
      },
      include: {
        college: { select: { id: true, name: true, shortCode: true, campusZone: true } },
      },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          googleId: verifiedUser.sub,
          personalEmail: verifiedUser.email,
          fullName: verifiedUser.name || verifiedUser.email.split("@")[0] || "Student",
          avatarUrl: verifiedUser.picture,
          role: "STUDENT",
        },
        include: {
          college: { select: { id: true, name: true, shortCode: true, campusZone: true } },
        },
      });
    } else {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          googleId: user.googleId || verifiedUser.sub,
          personalEmail: user.personalEmail || verifiedUser.email,
          fullName:
            (!user.fullName || user.fullName === "DU Student" || user.fullName === "Student") && verifiedUser.name
              ? verifiedUser.name
              : user.fullName,
          avatarUrl: user.avatarUrl || verifiedUser.picture,
        },
        include: {
          college: { select: { id: true, name: true, shortCode: true, campusZone: true } },
        },
      });
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
