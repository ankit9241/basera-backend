import { ApiError } from "../../middleware/error-handler";

export const ALLOWED_MIME_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"] as const;
export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

export const MAX_FILE_SIZE_BYTES =
  Number(process.env.MAX_IMAGE_SIZE_BYTES) || 10 * 1024 * 1024; // 10MB default
export const MAX_IMAGES_PER_UPLOAD =
  Number(process.env.MAX_IMAGES_PER_UPLOAD) || 10;

/**
 * Validates file buffer header magic numbers to ensure actual binary matches safe image formats.
 * Prevents disguised executable / script / SVG uploads.
 */
export function validateImageMagicBytes(buffer: Buffer): { isValid: boolean; detectedMime?: string } {
  if (!buffer || buffer.length < 12) {
    return { isValid: false };
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { isValid: true, detectedMime: "image/jpeg" };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { isValid: true, detectedMime: "image/png" };
  }

  // WebP: RIFF (4 bytes) + file size (4 bytes) + WEBP (4 bytes)
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return { isValid: true, detectedMime: "image/webp" };
  }

  return { isValid: false };
}

/**
 * Sanitizes and generates a safe, deterministic filename.
 */
export function sanitizeImageFilename(
  originalName: string,
  propertyCode: string,
  index: number = 0
): string {
  const ext = originalName.split(".").pop()?.toLowerCase() || "jpg";
  const safeExt = ext === "jpeg" ? "jpg" : ext;
  const cleanCode = propertyCode.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 6);

  return `${cleanCode}_${timestamp}_${index}_${randomSuffix}.${safeExt}`;
}

/**
 * Validates uploaded image file buffer, MIME type, and size.
 */
export function validateImageFile(file: {
  buffer: Buffer;
  mimetype: string;
  size: number;
  originalname: string;
}): { mimeType: string } {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    const sizeMB = (MAX_FILE_SIZE_BYTES / (1024 * 1024)).toFixed(0);
    throw new ApiError(400, `File "${file.originalname}" exceeds the maximum allowed size of ${sizeMB}MB.`);
  }

  const normalizedMime = file.mimetype.toLowerCase();
  if (!ALLOWED_MIME_TYPES.includes(normalizedMime as any)) {
    throw new ApiError(
      400,
      `Unsupported file format for "${file.originalname}". Only JPEG, PNG, and WebP images are permitted. SVG is strictly disallowed.`
    );
  }

  const magicCheck = validateImageMagicBytes(file.buffer);
  if (!magicCheck.isValid) {
    throw new ApiError(
      400,
      `Corrupted or invalid image binary for "${file.originalname}". File contents do not match genuine image data.`
    );
  }

  return { mimeType: magicCheck.detectedMime || normalizedMime };
}
