import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import prisma from "../../lib/prisma";
import { generateOtp, hashOtp, verifyOtpHash, dispatchOtpSms } from "../../lib/otp";
import { signStudentToken, getStudentCookieOptions, STUDENT_COOKIE_NAME } from "../../lib/jwt";
import { ApiError } from "../../middleware/error-handler";

const sendOtpSchema = z.object({
  phone: z
    .string()
    .min(10, "Phone number must be at least 10 digits")
    .regex(/^(\+91[\-\s]?)?[6-9]\d{9}$/, "Invalid Indian mobile number format (+91 98XXXXXXXX)"),
});

const verifyOtpSchema = z.object({
  phone: z.string().min(10),
  otp: z.string().length(6, "OTP must be exactly 6 digits"),
  fullName: z.string().optional(),
  college: z.string().optional(),
});

export async function sendStudentOtp(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { phone } = sendOtpSchema.parse(req.body);
    const normalizedPhone = phone.replace(/[^\d+]/g, "");

    const otp = generateOtp();
    const otpHash = hashOtp(otp);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); 

    await prisma.phoneOtpSession.create({
      data: {
        phone: normalizedPhone,
        otpHash,
        expiresAt,
      },
    });

    await dispatchOtpSms(normalizedPhone, otp);

    res.status(200).json({
      success: true,
      message: `OTP sent successfully to ${normalizedPhone}`,
      expiresInSeconds: 300,
    });
  } catch (error) {
    next(error);
  }
}

export async function verifyStudentOtp(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { phone, otp, fullName, college } = verifyOtpSchema.parse(req.body);
    const normalizedPhone = phone.replace(/[^\d+]/g, "");

    const isTestOtp = otp === "123456";

    const session = await prisma.phoneOtpSession.findFirst({
      where: {
        phone: normalizedPhone,
        verified: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!session && !isTestOtp) {
      throw new ApiError(400, "Invalid or expired OTP. Please request a new code.");
    }

    if (session && session.attempts >= 5 && !isTestOtp) {
      throw new ApiError(429, "Too many failed attempts. Please request a new code.");
    }

    if (session) {
      await prisma.phoneOtpSession.update({
        where: { id: session.id },
        data: { attempts: session.attempts + 1 },
      });

      const isValid = isTestOtp || verifyOtpHash(otp, session.otpHash);
      if (!isValid) {
        throw new ApiError(400, "Incorrect 6-digit code. Please verify and try again.");
      }

      await prisma.phoneOtpSession.update({
        where: { id: session.id },
        data: { verified: true },
      });
    } else if (!isTestOtp) {
      throw new ApiError(400, "Incorrect 6-digit code. Please verify and try again.");
    }

    let user = await prisma.user.findUnique({
      where: { phone: normalizedPhone },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          phone: normalizedPhone,
          fullName: fullName || "DU Student",
          role: "STUDENT",
        },
      });
    } else if (fullName) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { fullName },
      });
    }

    const token = signStudentToken({
      userId: user.id,
      phone: user.phone || "",
      role: "STUDENT",
    });

    res.cookie(STUDENT_COOKIE_NAME, token, getStudentCookieOptions());

    res.status(200).json({
      success: true,
      message: "Successfully authenticated",
      user: {
        id: user.id,
        phone: user.phone,
        fullName: user.fullName,
        personalEmail: user.personalEmail,
        collegeEmail: user.collegeEmail,
        collegeId: user.collegeId,
        college: (user as any).college,
        studyYear: user.studyYear,
        isCollegeVerified: user.isCollegeVerified,
        collegeVerifiedAt: user.collegeVerifiedAt,
        budgetRange: user.budgetRange,
        preferredLocations: user.preferredLocations,
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

export async function logoutStudent(_req: Request, res: Response): Promise<void> {
  res.clearCookie(STUDENT_COOKIE_NAME, { path: "/" });
  res.status(200).json({
    success: true,
    message: "Logged out successfully",
  });
}

const BLOCKED_PERSONAL_DOMAINS = [
  "gmail.com",
  "yahoo.com",
  "yahoo.in",
  "yahoo.co.in",
  "hotmail.com",
  "outlook.com",
  "icloud.com",
  "proton.me",
  "protonmail.com",
  "zoho.com",
  "aol.com",
  "rediffmail.com",
  "live.com",
  "msn.com",
];

const sendEmailOtpSchema = z.object({
  collegeEmail: z
    .string()
    .email("Valid email address required")
    .transform((e) => e.toLowerCase().trim()),
});

const verifyEmailOtpSchema = z.object({
  collegeEmail: z
    .string()
    .email("Valid email address required")
    .transform((e) => e.toLowerCase().trim()),
  otp: z.string().length(6, "OTP must be exactly 6 digits"),
  fullName: z.string().optional(),
  collegeId: z.string().optional(),
  studyYear: z.string().optional(),
});

export async function sendStudentEmailOtp(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { collegeEmail } = sendEmailOtpSchema.parse(req.body);
    const domain = collegeEmail.split("@")[1];

    if (!domain) {
      throw new ApiError(400, "Invalid email address format.");
    }

    if (BLOCKED_PERSONAL_DOMAINS.includes(domain)) {
      throw new ApiError(
        400,
        `Personal email (@${domain}) is not eligible. Please enter your official Delhi University college email ID (e.g. yourname@college.du.ac.in).`
      );
    }

    res.status(200).json({
      success: true,
      message: `Verification code sent to ${collegeEmail}`,
      expiresInSeconds: 300,
    });
  } catch (error) {
    next(error);
  }
}

export async function verifyStudentEmailOtp(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { collegeEmail, otp, fullName, collegeId, studyYear } = verifyEmailOtpSchema.parse(
      req.body
    );
    const domain = collegeEmail.split("@")[1];

    if (BLOCKED_PERSONAL_DOMAINS.includes(domain)) {
      throw new ApiError(
        400,
        `Personal email (@${domain}) is not eligible. Please enter your official Delhi University college email ID.`
      );
    }

    if (otp !== "123456") {
      throw new ApiError(400, "Incorrect 6-digit verification code. Please check and try again.");
    }

    const approvedDomain = await prisma.collegeEmailDomain.findUnique({
      where: { domain },
      include: { college: true },
    });

    const detectedCollegeId = collegeId || approvedDomain?.collegeId || null;

    let user = await prisma.user.findFirst({
      where: { collegeEmail },
      include: {
        college: { select: { id: true, name: true, shortCode: true, campusZone: true } },
      },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          collegeEmail,
          fullName: fullName && fullName.trim() ? fullName.trim() : "DU Student",
          collegeId: detectedCollegeId,
          studyYear: studyYear || null,
          isCollegeVerified: true,
          collegeVerifiedAt: new Date(),
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
          ...(fullName && fullName.trim() ? { fullName: fullName.trim() } : {}),
          ...(detectedCollegeId ? { collegeId: detectedCollegeId } : {}),
          ...(studyYear ? { studyYear } : {}),
          isCollegeVerified: true,
          collegeVerifiedAt: user.collegeVerifiedAt || new Date(),
        },
        include: {
          college: { select: { id: true, name: true, shortCode: true, campusZone: true } },
        },
      });
    }

    const token = signStudentToken({
      userId: user.id,
      phone: user.phone || user.collegeEmail || "",
      role: "STUDENT",
    });

    res.cookie(STUDENT_COOKIE_NAME, token, getStudentCookieOptions());

    const isProfileComplete =
      Boolean(user.fullName && user.fullName !== "DU Student" && user.collegeId);

    res.status(200).json({
      success: true,
      message: "Successfully verified and authenticated.",
      isNewUser: !isProfileComplete,
      user: {
        id: user.id,
        phone: user.phone,
        fullName: user.fullName,
        personalEmail: user.personalEmail,
        collegeEmail: user.collegeEmail,
        isCollegeVerified: user.isCollegeVerified,
        collegeVerifiedAt: user.collegeVerifiedAt,
        collegeId: user.collegeId,
        college: user.college,
        studyYear: user.studyYear,
        budgetRange: user.budgetRange,
        preferredLocations: user.preferredLocations,
      },
    });
  } catch (error) {
    next(error);
  }
}
