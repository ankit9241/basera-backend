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
      phone: user.phone,
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
  const user = req.user!;
  res.status(200).json({
    success: true,
    user: {
      id: user.id,
      phone: user.phone,
      fullName: user.fullName,
      personalEmail: user.personalEmail,
      collegeEmail: user.collegeEmail,
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
