import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import crypto from "crypto";
import prisma from "../../lib/prisma";
import { ApiError } from "../../middleware/error-handler";
import { logAudit } from "../../lib/audit";

const requestVerificationSchema = z.object({
  collegeEmail: z
    .string()
    .email("Valid email address required")
    .transform((e) => e.toLowerCase().trim()),
});

const confirmTokenSchema = z.object({
  token: z.string().min(10, "Verification token required"),
});

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function sendCollegeVerificationEmail(
  toEmail: string,
  studentName: string,
  collegeName: string,
  verificationUrl: string
): Promise<boolean> {
  console.log(`\n📧 [Email Service Mock] Sending DU Verification to ${toEmail}:`);
  console.log(`🎓 College: ${collegeName}`);
  console.log(`👤 Student: ${studentName}`);
  console.log(`🔗 Verification Link: ${verificationUrl}\n`);
  return true;
}

export async function requestCollegeVerification(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const user = req.user!;
    const { collegeEmail } = requestVerificationSchema.parse(req.body);

    const domain = collegeEmail.split("@")[1];
    if (!domain) {
      throw new ApiError(400, "Invalid email address format.");
    }

    const approvedDomain = await prisma.collegeEmailDomain.findUnique({
      where: { domain },
      include: { college: true },
    });

    if (!approvedDomain || !approvedDomain.isActive) {
      throw new ApiError(
        400,
        `Domain '@${domain}' is not in the approved Delhi University college email whitelist. Please use your official institutional email (e.g. name@mirandahouse.ac.in, name@srcc.du.ac.in).`
      );
    }

    const existingVerifiedUser = await prisma.user.findFirst({
      where: {
        collegeEmail,
        isCollegeVerified: true,
        id: { not: user.id },
      },
    });

    if (existingVerifiedUser) {
      throw new ApiError(400, "This college email address is already verified on another account.");
    }

    const rawToken = crypto.randomBytes(24).toString("hex");
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); 

    await prisma.emailVerificationToken.deleteMany({
      where: { userId: user.id },
    });

    await prisma.emailVerificationToken.create({
      data: {
        userId: user.id,
        email: collegeEmail,
        tokenHash,
        expiresAt,
      },
    });

    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
    const verificationUrl = `${frontendUrl}/verify-email?token=${rawToken}`;

    await sendCollegeVerificationEmail(
      collegeEmail,
      user.fullName,
      approvedDomain.college.name,
      verificationUrl
    );

    res.status(200).json({
      success: true,
      message: `Verification link sent to ${collegeEmail}. Please check your institutional inbox.`,
      college: {
        id: approvedDomain.college.id,
        name: approvedDomain.college.name,
        shortCode: approvedDomain.college.shortCode,
      },
      expiresInSeconds: 900,
    });
  } catch (error) {
    next(error);
  }
}

export async function confirmCollegeVerification(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { token } = confirmTokenSchema.parse(req.query);
    const tokenHash = hashToken(token);

    const record = await prisma.emailVerificationToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!record || record.expiresAt < new Date()) {
      throw new ApiError(400, "Verification link has expired or is invalid. Please request a new one.");
    }

    const domain = record.email.split("@")[1];
    const approvedDomain = await prisma.collegeEmailDomain.findUnique({
      where: { domain },
      include: { college: true },
    });

    const collegeId = approvedDomain?.collegeId ?? null;

    const updatedUser = await prisma.user.update({
      where: { id: record.userId },
      data: {
        collegeEmail: record.email,
        isCollegeVerified: true,
        collegeVerifiedAt: new Date(),
        collegeId: collegeId,
      },
      include: { college: true },
    });

    await prisma.emailVerificationToken.delete({
      where: { id: record.id },
    });

    await logAudit({
      actorId: updatedUser.id,
      action: "STUDENT_COLLEGE_VERIFIED",
      targetEntity: "User",
      targetId: updatedUser.id,
      details: {
        collegeEmail: record.email,
        collegeId,
        collegeName: approvedDomain?.college.name,
      },
    });

    res.status(200).json({
      success: true,
      message: `Congratulations! Your Delhi University student identity (${approvedDomain?.college.name}) has been verified.`,
      user: {
        id: updatedUser.id,
        fullName: updatedUser.fullName,
        collegeEmail: updatedUser.collegeEmail,
        isCollegeVerified: updatedUser.isCollegeVerified,
        collegeVerifiedAt: updatedUser.collegeVerifiedAt,
        college: updatedUser.college
          ? {
              id: updatedUser.college.id,
              name: updatedUser.college.name,
              shortCode: updatedUser.college.shortCode,
            }
          : null,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function getWhitelistedDomains(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const domains = await prisma.collegeEmailDomain.findMany({
      where: { isActive: true },
      include: {
        college: {
          select: { id: true, name: true, shortCode: true, campusZone: true },
        },
      },
      orderBy: { domain: "asc" },
    });

    res.status(200).json({
      success: true,
      domains: domains.map((d) => ({
        domain: `@${d.domain}`,
        collegeName: d.college.name,
        shortCode: d.college.shortCode,
        campus: d.college.campusZone,
      })),
    });
  } catch (error) {
    next(error);
  }
}

const verifyOtpSchema = z.object({
  fullName: z.string().min(2, "Full name must be at least 2 characters").optional(),
  collegeId: z.string().min(1, "Please select your Delhi University college"),
  collegeEmail: z
    .string()
    .email("Valid college email address required")
    .transform((e) => e.toLowerCase().trim()),
  otp: z.string().length(6, "Verification code must be exactly 6 digits"),
});

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

export async function verifyCollegeEmailWithOtp(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const user = req.user!;
    const { fullName, collegeId, collegeEmail, otp } = verifyOtpSchema.parse(req.body);

    const domain = collegeEmail.split("@")[1];
    if (!domain) {
      throw new ApiError(400, "Invalid email address format.");
    }

    if (BLOCKED_PERSONAL_DOMAINS.includes(domain)) {
      throw new ApiError(
        400,
        `Personal email address (@${domain}) cannot be used. Please enter your official Delhi University college email ID (e.g. yourname@college.du.ac.in).`
      );
    }

    const college = await prisma.college.findUnique({
      where: { id: collegeId },
      include: { approvedDomains: true },
    });

    if (!college) {
      throw new ApiError(404, "Selected college not found.");
    }

    const collegeApprovedDomains = college.approvedDomains.map((d) => d.domain.toLowerCase());
    const isCollegeDomainMatch = collegeApprovedDomains.includes(domain);
    const isGeneralDuDomain = domain.endsWith(".du.ac.in") || domain.endsWith(".ac.in") || domain.endsWith(".edu");

    if (!isCollegeDomainMatch && !isGeneralDuDomain) {
      const hint = collegeApprovedDomains.length > 0 ? `@${collegeApprovedDomains[0]}` : `@${college.shortCode.toLowerCase()}.du.ac.in`;
      throw new ApiError(
        400,
        `'@${domain}' is not recognized as an official email domain for ${college.name}. Please use your institutional email (e.g. name${hint}).`
      );
    }

    const existingVerifiedUser = await prisma.user.findFirst({
      where: {
        collegeEmail,
        isCollegeVerified: true,
        id: { not: user.id },
      },
    });

    if (existingVerifiedUser) {
      throw new ApiError(400, "This college email address is already verified on another account.");
    }

    if (otp !== "123456") {
      throw new ApiError(400, "Invalid verification code. Please enter the 6-digit code (use 123456 for testing).");
    }

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        ...(fullName ? { fullName: fullName.trim() } : {}),
        collegeId: college.id,
        collegeEmail,
        isCollegeVerified: true,
        collegeVerifiedAt: new Date(),
      },
      include: {
        college: { select: { id: true, name: true, shortCode: true, campusZone: true } },
      },
    });

    await logAudit({
      actorId: updatedUser.id,
      action: "STUDENT_COLLEGE_OTP_VERIFIED",
      targetEntity: "User",
      targetId: updatedUser.id,
      details: {
        collegeEmail,
        collegeId: college.id,
        collegeName: college.name,
      },
    });

    res.status(200).json({
      success: true,
      message: `Verified! Welcome to ${college.name} student network.`,
      user: {
        id: updatedUser.id,
        phone: updatedUser.phone,
        fullName: updatedUser.fullName,
        collegeEmail: updatedUser.collegeEmail,
        isCollegeVerified: updatedUser.isCollegeVerified,
        collegeVerifiedAt: updatedUser.collegeVerifiedAt,
        college: updatedUser.college,
      },
    });
  } catch (error) {
    next(error);
  }
}
