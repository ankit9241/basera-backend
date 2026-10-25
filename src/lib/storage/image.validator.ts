import { ApiError } from "../../middleware/error-handler";

export const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "video/mp4",
] as const;
export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

export const MAX_FILE_SIZE_BYTES =
  Number(process.env.MAX_IMAGE_SIZE_BYTES) || 15 * 1024 * 1024; // 15MB default for photos
export const MAX_VIDEO_SIZE_BYTES =
  Number(process.env.MAX_VIDEO_SIZE_BYTES) || 100 * 1024 * 1024; // 100MB default for videos
export const MAX_IMAGES_PER_UPLOAD =
  Number(process.env.MAX_IMAGES_PER_UPLOAD) || 10;

/**
 * Checks if a buffer matches standard MP4 ISOBMFF container format.
 */
export function isMp4Video(buffer: Buffer): boolean {
  if (!buffer || buffer.length < 12) {
    return false;
  }

  // ISOBMFF header: 'ftyp' at offset 4
  if (buffer.toString("ascii", 4, 8) === "ftyp") {
    const brand = buffer.toString("ascii", 8, 12).toLowerCase();
    const mp4Brands = [
      "isom",
      "iso2",
      "mp41",
      "mp42",
      "avc1",
      "mp4v",
      "dash",
      "m4v ",
      "qt  ",
      "3gp4",
      "3gp5",
      "3gp6",
    ];
    if (mp4Brands.includes(brand)) {
      return true;
    }

    // Check compatible brands in the rest of the ftyp box
    try {
      const boxSize = buffer.readUInt32BE(0);
      const limit = Math.min(buffer.length, boxSize > 8 ? boxSize : 64);
      for (let offset = 12; offset + 4 <= limit; offset += 4) {
        const compBrand = buffer.toString("ascii", offset, offset + 4).toLowerCase();
        if (mp4Brands.includes(compBrand)) {
          return true;
        }
      }
    } catch {
      // Fallback
    }
  }

  return false;
}

/**
 * Validates file buffer header magic numbers to ensure actual binary matches safe image or MP4 formats.
 * Prevents disguised executable / script / SVG uploads.
 */
export function validateImageMagicBytes(buffer: Buffer): {
  isValid: boolean;
  detectedMime?: string;
  isSvg?: boolean;
  isVideo?: boolean;
} {
  if (!buffer || buffer.length < 8) {
    return { isValid: false };
  }

  // Check for SVG: text header containing <svg or <?xml ... <svg
  const snippet = buffer.subarray(0, Math.min(buffer.length, 1024)).toString("utf8").toLowerCase();
  if (snippet.includes("<svg") || snippet.includes("xmlns=\"http://www.w3.org/2000/svg\"")) {
    return { isValid: false, isSvg: true };
  }

  // MP4 video check (ISOBMFF with mp4/isom brands)
  if (isMp4Video(buffer)) {
    return { isValid: true, detectedMime: "video/mp4", isVideo: true };
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { isValid: true, detectedMime: "image/jpeg" };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.length >= 8 &&
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
    buffer.length >= 12 &&
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

  // HEIC / HEIF: ISOBMFF box with 'ftyp' at offset 4 and compatible brand at offset 8
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 4, 8) === "ftyp"
  ) {
    const brand = buffer.toString("ascii", 8, 12).toLowerCase();
    if (["heic", "heix", "hevc", "hevx", "mif1", "msf1", "heis"].includes(brand)) {
      return { isValid: true, detectedMime: "image/heic" };
    }
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
  const safeExt =
    ext === "jpeg"
      ? "jpg"
      : ext === "heif"
      ? "heic"
      : ext === "mp4" || ext === "m4v"
      ? "mp4"
      : ext;
  const cleanCode = propertyCode.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 6);

  return `${cleanCode}_${timestamp}_${index}_${randomSuffix}.${safeExt}`;
}

/**
 * Validates uploaded image or video file buffer, MIME type, and size.
 */
export function validateImageFile(file: {
  buffer: Buffer;
  mimetype: string;
  size: number;
  originalname: string;
}): { mimeType: string; isVideo?: boolean } {
  const normalizedMime = file.mimetype.toLowerCase();
  const isVideoCandidate =
    normalizedMime === "video/mp4" || file.originalname.toLowerCase().endsWith(".mp4");
  const maxAllowedSize = isVideoCandidate ? MAX_VIDEO_SIZE_BYTES : MAX_FILE_SIZE_BYTES;

  if (file.size > maxAllowedSize) {
    const sizeMB = (maxAllowedSize / (1024 * 1024)).toFixed(0);
    throw new ApiError(
      400,
      `File "${file.originalname}" exceeds the maximum allowed size of ${sizeMB}MB for ${
        isVideoCandidate ? "videos" : "photos"
      }.`
    );
  }

  // Explicit SVG check
  if (normalizedMime.includes("svg") || file.originalname.toLowerCase().endsWith(".svg")) {
    throw new ApiError(
      400,
      `SVG format is strictly prohibited for "${file.originalname}". Only JPG, PNG, WebP, HEIC photos, and MP4 videos are permitted.`
    );
  }

  const magicCheck = validateImageMagicBytes(file.buffer);
  if (magicCheck.isSvg) {
    throw new ApiError(
      400,
      `SVG format is strictly prohibited for "${file.originalname}". Only JPG, PNG, WebP, HEIC photos, and MP4 videos are permitted.`
    );
  }

  if (!magicCheck.isValid) {
    throw new ApiError(
      400,
      `Corrupted or invalid media binary for "${file.originalname}". File contents do not match genuine photo or MP4 video data.`
    );
  }

  return {
    mimeType: magicCheck.detectedMime || normalizedMime,
    isVideo: magicCheck.isVideo,
  };
}

