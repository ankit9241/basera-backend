import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { sendEmail } from "../../lib/email";
import { ApiError } from "../../middleware/error-handler";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

const contactFormSchema = z.object({
  name: z
    .string({ required_error: "Name is required" })
    .trim()
    .min(2, "Name must be at least 2 characters")
    .max(100, "Name must not exceed 100 characters"),
  email: z
    .string({ required_error: "Email is required" })
    .trim()
    .toLowerCase()
    .email("Please provide a valid email address")
    .max(120, "Email must not exceed 120 characters"),
  subject: z
    .string({ required_error: "Subject is required" })
    .trim()
    .min(3, "Subject must be at least 3 characters")
    .max(150, "Subject must not exceed 150 characters"),
  message: z
    .string({ required_error: "Message is required" })
    .trim()
    .min(10, "Message must be at least 10 characters")
    .max(3000, "Message must not exceed 3000 characters"),
});

export async function submitContactMessage(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const parsed = contactFormSchema.safeParse(req.body);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      throw new ApiError(400, firstIssue ? firstIssue.message : "Invalid contact form submission");
    }

    const { name, email, subject, message } = parsed.data;
    const timestamp = new Date();
    const formattedDate = timestamp.toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      dateStyle: "medium",
      timeStyle: "short",
    });

    const destinationEmail =
      process.env.CONTACT_RECEIVER_EMAIL ||
      process.env.SUPPORT_EMAIL ||
      "basera.du.official@gmail.com";

    const textContent = [
      `New contact message submitted on Basera:`,
      `-----------------------------------------`,
      `From: ${name} <${email}>`,
      `Subject: ${subject}`,
      `Date: ${formattedDate} (${timestamp.toISOString()})`,
      ``,
      `Message:`,
      message,
      `-----------------------------------------`,
      `Reply directly to this email to respond to ${name}.`,
    ].join("\n");

    const htmlContent = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1f2937; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 12px;">
        <h2 style="color: #111827; margin-top: 0; font-size: 20px; border-bottom: 1px solid #e5e7eb; padding-bottom: 12px;">New Contact Message — Basera</h2>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 14px;">
          <tr>
            <td style="padding: 6px 0; color: #6b7280; width: 100px;"><strong>Sender:</strong></td>
            <td style="padding: 6px 0; color: #111827;">${escapeHtml(name)}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #6b7280;"><strong>Email:</strong></td>
            <td style="padding: 6px 0; color: #111827;"><a href="mailto:${escapeHtml(email)}" style="color: #2563eb;">${escapeHtml(email)}</a></td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #6b7280;"><strong>Subject:</strong></td>
            <td style="padding: 6px 0; color: #111827;">${escapeHtml(subject)}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #6b7280;"><strong>Time:</strong></td>
            <td style="padding: 6px 0; color: #6b7280;">${escapeHtml(formattedDate)} (${timestamp.toISOString()})</td>
          </tr>
        </table>
        <div style="background-color: #f9fafb; padding: 16px; border-radius: 8px; border: 1px solid #f3f4f6; margin-bottom: 20px;">
          <h4 style="margin: 0 0 8px 0; color: #374151; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em;">Message</h4>
          <p style="margin: 0; white-space: pre-wrap; font-size: 14px; color: #1f2937;">${escapeHtml(message)}</p>
        </div>
        <p style="font-size: 12px; color: #9ca3af; margin: 0;">Hit "Reply" in your email client to respond directly to ${escapeHtml(name)} (${escapeHtml(email)}).</p>
      </div>
    `;

    // Attempt delivery via Resend service
    await sendEmail({
      to: destinationEmail,
      subject: `[Basera Contact] ${subject} - from ${name}`,
      text: textContent,
      html: htmlContent,
      replyTo: email,
    });

    res.status(200).json({
      success: true,
      message: "Message sent successfully. We will get back to you shortly.",
    });
  } catch (error) {
    next(error);
  }
}
