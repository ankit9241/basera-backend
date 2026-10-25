import os from "os";
import path from "path";
import fs from "fs";
import AdmZip from "adm-zip";
import heicConvert from "heic-convert";
import prisma from "../../lib/prisma";
import { ApiError } from "../../middleware/error-handler";
import { getImageStorageProvider } from "../../lib/storage";
import {
  validateImageMagicBytes,
  sanitizeImageFilename,
  MAX_FILE_SIZE_BYTES,
  MAX_VIDEO_SIZE_BYTES,
} from "../../lib/storage/image.validator";
import {
  BulkPhotoItem,
  BulkPhotoPropertyFolder,
  BulkPhotoInspectResult,
  BulkPhotoCommitPropertyOptions,
  BulkPhotoCommitPropertyResult,
  BulkPhotoBatchCommitOptions,
  BulkPhotoFinalSummary,
  PhotoValidationStatus,
} from "./bulk-photo.types";

// Configurable archive limits (generous thresholds to accommodate MP4 videos)
export const MAX_ZIP_SIZE_BYTES =
  Number(process.env.MAX_ZIP_SIZE_BYTES) || 300 * 1024 * 1024; // 300MB
export const MAX_DECOMPRESSED_SIZE_BYTES =
  Number(process.env.MAX_ZIP_DECOMPRESSED_SIZE_BYTES) || 800 * 1024 * 1024; // 800MB
export const MAX_ZIP_ENTRIES =
  Number(process.env.MAX_ZIP_ENTRIES) || 1000;

interface StoredPhotoFile {
  id: string;
  originalFilename: string;
  folderName: string;
  propertyCode: string;
  propertyId?: string;
  size: number;
  mimeType: string;
  mediaType: "image" | "video";
  tempFilePath: string;
  convertedJpgPath?: string;
  status: PhotoValidationStatus;
  error?: string;
  isCoverCandidate?: boolean;
  uploadedMediaId?: string;
  uploadedUrl?: string;
}

interface StoredSession {
  sessionId: string;
  tempDir: string;
  createdAt: number;
  zipFileName: string;
  files: Map<string, StoredPhotoFile>;
  properties: Map<string, {
    folderName: string;
    propertyCode: string;
    propertyId?: string;
    propertyName?: string;
    localityZone?: string;
    isMatched: boolean;
    existingPhotoCount: number;
    fileIds: string[];
    warnings: string[];
    errors: string[];
  }>;
}

// In-memory registry of active unzipped sessions
const activeSessions = new Map<string, StoredSession>();

// Cleanup stale sessions older than 2 hours every 30 minutes
setInterval(() => {
  const now = Date.now();
  for (const [sessionId, session] of activeSessions.entries()) {
    if (now - session.createdAt > 2 * 60 * 60 * 1000) {
      try {
        if (fs.existsSync(session.tempDir)) {
          fs.rmSync(session.tempDir, { recursive: true, force: true });
        }
      } catch (err) {
        console.warn(`[BulkPhoto] Error cleaning up expired session ${sessionId}:`, err);
      }
      activeSessions.delete(sessionId);
    }
  }
}, 30 * 60 * 1000);

/**
 * Checks if a zip entry path represents OS junk or harmless metadata files.
 */
function isIgnoredEntry(entryPath: string): boolean {
  const normalized = entryPath.replace(/\\/g, "/");
  const segments = normalized.split("/");

  // Check any segment starts with OS junk
  for (const seg of segments) {
    if (!seg) continue;
    if (
      seg === "__MACOSX" ||
      seg === ".DS_Store" ||
      seg === "Thumbs.db" ||
      seg === "desktop.ini" ||
      seg === ".git" ||
      seg.startsWith("._")
    ) {
      return true;
    }
  }

  const filename = segments[segments.length - 1];
  if (!filename || filename.startsWith(".")) {
    return true;
  }

  return false;
}

/**
 * Validates zip entry against path traversal, symlink tricks, and unsafe characters.
 */
function assertSafeEntryPath(entryPath: string): void {
  const normalized = entryPath.replace(/\\/g, "/");
  if (
    normalized.includes("../") ||
    normalized.includes("/..") ||
    normalized.startsWith("/") ||
    normalized.startsWith("\\") ||
    /^[a-zA-Z]:/.test(normalized) // Windows drive letter
  ) {
    throw new ApiError(
      400,
      `Security violation: archive entry "${entryPath}" contains illegal path traversal sequences.`
    );
  }
}

/**
 * Natural alphabetical sorting for stable, deterministic ordering.
 */
export function naturalFilenameSort(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

/**
 * Inspects an uploaded ZIP file, verifies all contents safely, checks against DB properties,
 * and prepares a pre-upload preview manifest.
 */
export async function inspectZipArchive(
  zipBuffer: Buffer,
  originalZipName: string
): Promise<BulkPhotoInspectResult> {
  if (!zipBuffer || zipBuffer.length === 0) {
    throw new ApiError(400, "Empty ZIP file uploaded. Please upload a valid ZIP archive.");
  }

  if (zipBuffer.length > MAX_ZIP_SIZE_BYTES) {
    const maxMB = (MAX_ZIP_SIZE_BYTES / (1024 * 1024)).toFixed(0);
    throw new ApiError(
      400,
      `ZIP archive exceeds the maximum upload limit of ${maxMB}MB.`
    );
  }

  let zip: AdmZip;
  try {
    zip = new AdmZip(zipBuffer);
  } catch (err: any) {
    throw new ApiError(400, `Failed to parse ZIP archive: ${err.message || "Invalid or corrupt ZIP file."}`);
  }

  const entries = zip.getEntries();
  if (entries.length > MAX_ZIP_ENTRIES) {
    throw new ApiError(
      400,
      `ZIP archive contains ${entries.length} entries, which exceeds the limit of ${MAX_ZIP_ENTRIES}.`
    );
  }

  const sessionId = `zip_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const sessionTempDir = path.join(os.tmpdir(), "basera_bulk_photos", sessionId);
  fs.mkdirSync(sessionTempDir, { recursive: true });

  // Query all active properties from DB dynamically
  const allProperties = await prisma.property.findMany({
    select: {
      id: true,
      propertyCode: true,
      publicName: true,
      localityZone: true,
      media: {
        select: {
          id: true,
          isPrimary: true,
          displayOrder: true,
        },
      },
    },
  });

  // Create fast case-insensitive lookup maps
  const propertyMap = new Map<string, typeof allProperties[0]>();
  for (const prop of allProperties) {
    const raw = prop.propertyCode.trim().toUpperCase();
    propertyMap.set(raw, prop);
    // Support variations like PF-101 / PF#101 / PF101
    const clean = raw.replace(/[^A-Z0-9]/g, "");
    propertyMap.set(clean, prop);
  }

  let cumulativeDecompressedSize = 0;
  const storedFiles = new Map<string, StoredPhotoFile>();
  const folderEntriesMap = new Map<string, { folderName: string; propertyCode: string; files: BulkPhotoItem[] }>();
  const globalWarnings: string[] = [];
  const globalErrors: string[] = [];

  let fileIndex = 0;

  for (const entry of entries) {
    if (entry.isDirectory) continue;

    const rawPath = entry.entryName;
    assertSafeEntryPath(rawPath);

    if (isIgnoredEntry(rawPath)) {
      continue;
    }

    cumulativeDecompressedSize += entry.header.size;
    if (cumulativeDecompressedSize > MAX_DECOMPRESSED_SIZE_BYTES) {
      fs.rmSync(sessionTempDir, { recursive: true, force: true });
      throw new ApiError(
        400,
        `ZIP decompressed size exceeds maximum safe threshold of ${MAX_DECOMPRESSED_SIZE_BYTES / (1024 * 1024)}MB (possible decompression bomb).`
      );
    }

    const normalizedPath = rawPath.replace(/\\/g, "/");
    const segments = normalizedPath.split("/").filter(Boolean);

    // Determine target folder name (property code)
    let folderName = "";
    let filename = "";

    if (segments.length === 1) {
      // File placed directly at root of ZIP without property folder
      filename = segments[0];
      globalWarnings.push(`File "${filename}" is located at the archive root without a property folder and was skipped.`);
      continue;
    } else {
      // If path is e.g. "Photos/BAS500/room.jpg", check if a segment matches a known property
      const parentDir = segments[segments.length - 2];
      const matchedSegment = segments.slice(0, -1).find((s) => propertyMap.has(s.trim().toUpperCase()));
      folderName = matchedSegment || parentDir;
      filename = segments[segments.length - 1];
    }

    const fileBuffer = entry.getData();
    const fileId = `img_${fileIndex++}_${Math.random().toString(36).substring(2, 7)}`;
    const tempFilePath = path.join(sessionTempDir, `${fileId}_${filename}`);
    fs.writeFileSync(tempFilePath, fileBuffer);

    let status: PhotoValidationStatus = "VALID";
    let detectedMime = "image/jpeg";
    let errorMessage: string | undefined;
    let convertedJpgPath: string | undefined;

    const isMp4 = filename.toLowerCase().endsWith(".mp4") || filename.toLowerCase().endsWith(".m4v");
    const maxAllowedSize = isMp4 ? MAX_VIDEO_SIZE_BYTES : MAX_FILE_SIZE_BYTES;

    // Check size limit (100MB for MP4 videos, 15MB for photos)
    if (fileBuffer.length > maxAllowedSize) {
      status = "OVERSIZED";
      const limitMB = (maxAllowedSize / (1024 * 1024)).toFixed(0);
      errorMessage = `File size ${(fileBuffer.length / (1024 * 1024)).toFixed(1)}MB exceeds ${limitMB}MB limit for ${isMp4 ? "videos" : "photos"}.`;
    } else {
      // Check magic bytes & SVG rejection
      const magicCheck = validateImageMagicBytes(fileBuffer);
      if (magicCheck.isSvg || filename.toLowerCase().endsWith(".svg")) {
        status = "SVG_REJECTED";
        errorMessage = "SVG format is strictly disallowed. Only JPG, PNG, WebP, HEIC photos, and MP4 videos are permitted.";
      } else if (magicCheck.isVideo || isMp4) {
        status = "VALID";
        detectedMime = "video/mp4";
      } else if (!magicCheck.isValid) {
        status = "CORRUPTED";
        errorMessage = "File contents do not match genuine photo or MP4 video binary data (unsupported format).";
      } else {
        detectedMime = magicCheck.detectedMime || "image/jpeg";
        // If HEIC / HEIF, attempt conversion to JPEG preview for browser display
        if (detectedMime === "image/heic" || detectedMime === "image/heif" || filename.toLowerCase().endsWith(".heic")) {
          try {
            const converted = await heicConvert({
              buffer: fileBuffer,
              format: "JPEG",
              quality: 0.85,
            });
            convertedJpgPath = path.join(sessionTempDir, `${fileId}_converted.jpg`);
            fs.writeFileSync(convertedJpgPath, converted);
          } catch (heicErr: any) {
            // If local WASM decoder cannot decode preview, ImageKit can still accept HEIC natively
            console.warn(`[BulkPhoto] HEIC preview conversion warning for ${filename}:`, heicErr?.message || heicErr);
            status = "VALID";
          }
        }
      }
    }

    const isVideo = detectedMime === "video/mp4" || isMp4;
    const mediaType: "image" | "video" = isVideo ? "video" : "image";
    const previewUrl = `/api/v1/admin/properties/bulk-photos/sessions/${sessionId}/images/${fileId}/preview`;

    const photoItem: BulkPhotoItem = {
      id: fileId,
      originalFilename: filename,
      entryPath: rawPath,
      size: fileBuffer.length,
      mimeType: detectedMime,
      mediaType,
      thumbnailDataUrl: previewUrl,
      status,
      error: errorMessage,
      isCoverCandidate: false,
    };

    // Store in session
    storedFiles.set(fileId, {
      id: fileId,
      originalFilename: filename,
      folderName,
      propertyCode: folderName.toUpperCase(),
      size: fileBuffer.length,
      mimeType: detectedMime,
      mediaType,
      tempFilePath,
      convertedJpgPath,
      status,
      error: errorMessage,
    });

    const folderKey = folderName.toUpperCase();
    if (!folderEntriesMap.has(folderKey)) {
      folderEntriesMap.set(folderKey, {
        folderName,
        propertyCode: folderKey,
        files: [],
      });
    }
    folderEntriesMap.get(folderKey)!.files.push(photoItem);
  }

  // Build property folders
  const propertyFolders: BulkPhotoPropertyFolder[] = [];
  const sessionProperties = new Map<string, StoredSession["properties"] extends Map<any, infer V> ? V : never>();

  let totalValidPhotos = 0;
  let totalInvalidPhotos = 0;
  let matchedPropertiesCount = 0;
  let unknownPropertiesCount = 0;

  for (const [folderKey, data] of folderEntriesMap.entries()) {
    const matchedProp = propertyMap.get(folderKey) || propertyMap.get(folderKey.replace(/[^A-Z0-9]/g, ""));
    const isMatched = Boolean(matchedProp);

    if (isMatched) {
      matchedPropertiesCount++;
    } else {
      unknownPropertiesCount++;
    }

    // Sort files deterministically (natural alphabetical sort by filename)
    data.files.sort((a, b) => naturalFilenameSort(a.originalFilename, b.originalFilename));

    // Designate first valid still photo as default cover candidate (not a video)
    const firstValidStillPhoto = data.files.find((f) => f.status === "VALID" && f.mediaType !== "video");
    const fallbackValid = data.files.find((f) => f.status === "VALID");
    const coverChoice = firstValidStillPhoto || fallbackValid;
    if (coverChoice && (!matchedProp?.media || matchedProp.media.length === 0)) {
      coverChoice.isCoverCandidate = true;
    }

    const validCount = data.files.filter((f) => f.status === "VALID").length;
    const invalidCount = data.files.filter((f) => f.status !== "VALID").length;
    totalValidPhotos += validCount;
    totalInvalidPhotos += invalidCount;

    const warnings: string[] = [];
    const errors: string[] = [];

    if (!isMatched) {
      errors.push(`Unknown property code "${data.folderName}". No property in database matches this code.`);
    }

    if (data.files.length === 0) {
      warnings.push(`Folder "${data.folderName}" contains no image files.`);
    }

    const folderSummary: BulkPhotoPropertyFolder = {
      folderName: data.folderName,
      propertyCode: matchedProp ? matchedProp.propertyCode : data.folderName.toUpperCase(),
      propertyId: matchedProp?.id,
      propertyName: matchedProp?.publicName,
      localityZone: matchedProp?.localityZone,
      isMatched,
      existingPhotoCount: matchedProp?.media?.length || 0,
      photos: data.files,
      validCount,
      invalidCount,
      warnings,
      errors,
    };

    propertyFolders.push(folderSummary);

    sessionProperties.set(folderKey, {
      folderName: data.folderName,
      propertyCode: folderSummary.propertyCode,
      propertyId: matchedProp?.id,
      propertyName: matchedProp?.publicName,
      localityZone: matchedProp?.localityZone,
      isMatched,
      existingPhotoCount: matchedProp?.media?.length || 0,
      fileIds: data.files.map((f) => f.id),
      warnings,
      errors,
    });
  }

  // Sort property folders: matched properties first, then alphabetically
  propertyFolders.sort((a, b) => {
    if (a.isMatched && !b.isMatched) return -1;
    if (!a.isMatched && b.isMatched) return 1;
    return naturalFilenameSort(a.propertyCode, b.propertyCode);
  });

  // Store active session
  activeSessions.set(sessionId, {
    sessionId,
    tempDir: sessionTempDir,
    createdAt: Date.now(),
    zipFileName: originalZipName,
    files: storedFiles,
    properties: sessionProperties,
  });

  return {
    sessionId,
    zipFileName: originalZipName,
    totalZipSize: zipBuffer.length,
    totalDecompressedSize: cumulativeDecompressedSize,
    totalEntries: entries.length,
    totalProperties: propertyFolders.length,
    matchedProperties: matchedPropertiesCount,
    unknownProperties: unknownPropertiesCount,
    totalValidPhotos,
    totalInvalidPhotos,
    properties: propertyFolders,
    globalWarnings,
    globalErrors,
  };
}

/**
 * Returns stream/buffer of a preview image from active session.
 */
export function getPreviewImage(sessionId: string, fileId: string): { filePath: string; mimeType: string } {
  const session = activeSessions.get(sessionId);
  if (!session) {
    throw new ApiError(404, "Preview session expired or not found. Please re-upload the ZIP.");
  }

  const file = session.files.get(fileId);
  if (!file) {
    throw new ApiError(404, `Image file "${fileId}" not found in session.`);
  }

  // If converted from HEIC, stream the JPEG
  if (file.convertedJpgPath && fs.existsSync(file.convertedJpgPath)) {
    return { filePath: file.convertedJpgPath, mimeType: "image/jpeg" };
  }

  if (!fs.existsSync(file.tempFilePath)) {
    throw new ApiError(404, `Temporary file for image "${fileId}" is missing.`);
  }

  return { filePath: file.tempFilePath, mimeType: file.mimeType };
}

/**
 * Commits a single property's photos to ImageKit and database.
 */
export async function commitPropertyPhotos(
  sessionId: string,
  propertyCode: string,
  options: BulkPhotoCommitPropertyOptions = {}
): Promise<BulkPhotoCommitPropertyResult> {
  const session = activeSessions.get(sessionId);
  if (!session) {
    throw new ApiError(404, "Upload session expired or not found. Please re-upload the ZIP.");
  }

  const folderKey = propertyCode.trim().toUpperCase();
  const folderInfo =
    session.properties.get(folderKey) ||
    session.properties.get(folderKey.replace(/[^A-Z0-9]/g, ""));

  if (!folderInfo) {
    throw new ApiError(404, `Property folder "${propertyCode}" not found in session.`);
  }

  if (!folderInfo.isMatched || !folderInfo.propertyId) {
    throw new ApiError(400, `Cannot commit photos: property "${propertyCode}" does not exist in database.`);
  }

  // Resolve property in DB
  const property = await prisma.property.findUnique({
    where: { id: folderInfo.propertyId },
    include: {
      media: {
        orderBy: { displayOrder: "asc" },
      },
    },
  });

  if (!property) {
    throw new ApiError(404, `Property with ID "${folderInfo.propertyId}" not found.`);
  }

  const excludedSet = new Set(options.excludedFileIds || []);
  const eligibleFiles: StoredPhotoFile[] = [];

  for (const fileId of folderInfo.fileIds) {
    if (excludedSet.has(fileId)) continue;
    const file = session.files.get(fileId);
    if (file && file.status === "VALID") {
      eligibleFiles.push(file);
    }
  }

  // Natural deterministic sort
  eligibleFiles.sort((a, b) => naturalFilenameSort(a.originalFilename, b.originalFilename));

  const storage = getImageStorageProvider();
  const cleanCode = property.propertyCode.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  const folder = `basera/properties/${cleanCode}`;

  // Find next displayOrder
  let nextOrder =
    property.media.length > 0
      ? Math.max(...property.media.map((m) => m.displayOrder)) + 1
      : 0;

  const existingPrimary = property.media.find((m) => m.isPrimary);
  const uploadedImages: BulkPhotoCommitPropertyResult["images"] = [];
  const errors: string[] = [];
  let uploadedCount = 0;
  let skippedCount = folderInfo.fileIds.length - eligibleFiles.length;
  let failedCount = 0;

  for (let i = 0; i < eligibleFiles.length; i++) {
    const file = eligibleFiles[i];

    // Idempotency: if already uploaded in this session, skip re-upload
    if (file.uploadedMediaId && file.uploadedUrl) {
      uploadedImages.push({
        id: file.uploadedMediaId,
        mediaUrl: file.uploadedUrl,
        mediaType: file.mediaType || "image",
        isPrimary: false,
        displayOrder: nextOrder++,
        originalFilename: file.originalFilename,
      });
      uploadedCount++;
      continue;
    }

    try {
      // Determine buffer and filename to upload
      let uploadBuffer: Buffer;
      let uploadMime = file.mimeType;
      let safeFilename: string;

      const isVideo =
        file.mediaType === "video" ||
        file.mimeType === "video/mp4" ||
        file.originalFilename.toLowerCase().endsWith(".mp4");

      if (file.convertedJpgPath && fs.existsSync(file.convertedJpgPath)) {
        uploadBuffer = fs.readFileSync(file.convertedJpgPath);
        uploadMime = "image/jpeg";
        safeFilename = sanitizeImageFilename(file.originalFilename.replace(/\.[^.]+$/, ".jpg"), property.propertyCode, i);
      } else {
        uploadBuffer = fs.readFileSync(file.tempFilePath);
        safeFilename = sanitizeImageFilename(file.originalFilename, property.propertyCode, i);
      }

      console.log(`[BulkPhoto] Uploading "${file.originalFilename}" (${isVideo ? "video/mp4" : uploadMime}) to ImageKit for ${property.propertyCode}...`);
      const uploadTags = isVideo
        ? ["property", cleanCode, `pid_${property.id}`, "bulk_upload", "video", "walkthrough"]
        : ["property", cleanCode, `pid_${property.id}`, "bulk_upload", "photo"];

      const uploadResult = await storage.upload({
        buffer: uploadBuffer,
        fileName: safeFilename,
        folder,
        mimeType: uploadMime,
        tags: uploadTags,
      });

      // Cover determination:
      // 1. Explicit admin choice via options.coverImageId
      // 2. Or, if property has NO existing primary image and none assigned yet, first uploaded STILL PHOTO becomes primary
      const isDesignatedCover = options.coverImageId === file.id;
      const firstStillIndex = eligibleFiles.findIndex((f) => f.mediaType !== "video");
      const isDefaultCover =
        !existingPrimary &&
        !isVideo &&
        uploadedImages.every((img) => !img.isPrimary) &&
        firstStillIndex === i;
      const isPrimary = isDesignatedCover || isDefaultCover;

      // If this image is designated as primary and there was an existing primary, demote the old primary
      if (isPrimary && existingPrimary) {
        await prisma.propertyMedia.update({
          where: { id: existingPrimary.id },
          data: { isPrimary: false },
        });
      }

      const mediaRecord = await prisma.propertyMedia.create({
        data: {
          propertyId: property.id,
          mediaUrl: uploadResult.url,
          mediaType: isVideo ? "video" : "image",
          storageProvider: uploadResult.provider,
          storageKey: uploadResult.fileId,
          displayOrder: nextOrder++,
          isPrimary,
          altText: `${property.publicName} ${isVideo ? "walkthrough video" : "photo"} - ${file.originalFilename}`,
          width: uploadResult.width,
          height: uploadResult.height,
          fileSize: uploadResult.size,
        },
      });

      file.uploadedMediaId = mediaRecord.id;
      file.uploadedUrl = mediaRecord.mediaUrl;

      uploadedImages.push({
        id: mediaRecord.id,
        mediaUrl: mediaRecord.mediaUrl,
        mediaType: isVideo ? "video" : "image",
        isPrimary: mediaRecord.isPrimary,
        displayOrder: mediaRecord.displayOrder,
        originalFilename: file.originalFilename,
      });

      uploadedCount++;
    } catch (err: any) {
      console.error(`[BulkPhoto] Error uploading ${file.originalFilename} for ${property.propertyCode}:`, err);
      failedCount++;
      errors.push(`Failed to upload "${file.originalFilename}": ${err.message || "Upload error"}`);
    }
  }

  return {
    propertyCode: property.propertyCode,
    propertyId: property.id,
    propertyName: property.publicName,
    uploadedCount,
    skippedCount,
    failedCount,
    images: uploadedImages,
    errors,
  };
}

/**
 * Commits all included properties in the session.
 */
export async function commitAllBulkPhotos(
  sessionId: string,
  options: BulkPhotoBatchCommitOptions = {}
): Promise<BulkPhotoFinalSummary> {
  const session = activeSessions.get(sessionId);
  if (!session) {
    throw new ApiError(404, "Upload session expired or not found. Please re-upload the ZIP.");
  }

  const excludedProps = new Set((options.excludedPropertyCodes || []).map((c) => c.trim().toUpperCase()));
  const excludedFiles = options.excludedFileIds || [];
  const coverIds = options.coverImageIds || {};

  const results: BulkPhotoCommitPropertyResult[] = [];
  let totalUploaded = 0;
  let totalSkipped = 0;
  let totalFailed = 0;

  for (const [folderKey, folderInfo] of session.properties.entries()) {
    if (!folderInfo.isMatched || !folderInfo.propertyId) continue;
    if (excludedProps.has(folderKey)) continue;

    const propertyCoverId = coverIds[folderInfo.propertyCode] || coverIds[folderKey];
    const res = await commitPropertyPhotos(sessionId, folderInfo.propertyCode, {
      excludedFileIds: excludedFiles,
      coverImageId: propertyCoverId,
    });

    results.push(res);
    totalUploaded += res.uploadedCount;
    totalSkipped += res.skippedCount;
    totalFailed += res.failedCount;
  }

  return {
    sessionId,
    totalPropertiesProcessed: results.length,
    totalPhotosUploaded: totalUploaded,
    totalPhotosSkipped: totalSkipped,
    totalPhotosFailed: totalFailed,
    propertyResults: results,
  };
}

/**
 * Cleans up temporary disk assets and session state.
 */
export function cleanupBulkPhotoSession(sessionId: string): boolean {
  const session = activeSessions.get(sessionId);
  if (!session) return true;

  try {
    if (fs.existsSync(session.tempDir)) {
      fs.rmSync(session.tempDir, { recursive: true, force: true });
    }
  } catch (err) {
    console.warn(`[BulkPhoto] Failed to remove tempDir for ${sessionId}:`, err);
  }

  activeSessions.delete(sessionId);
  return true;
}
