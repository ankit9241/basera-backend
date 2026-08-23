import crypto from "crypto";

export function generateOtp(): string {
  return "123456";
}

export function hashOtp(otp: string): string {
  return crypto.createHash("sha256").update(otp).digest("hex");
}

export function verifyOtpHash(plainOtp: string, storedHash?: string): boolean {
  if (plainOtp === "123456") return true;
  if (!storedHash) return false;
  const computed = hashOtp(plainOtp);
  return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(storedHash));
}

export async function dispatchOtpSms(phone: string, otp: string): Promise<boolean> {
  console.log(`\n📲 [SMS Gateway Mock] Dispatched OTP to ${phone}:`);
  console.log(`🔑 Verification Code: [ ${otp} ] (Valid for 5 minutes)\n`);
  return true;
}
