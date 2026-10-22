import { Request, Response, NextFunction } from "express";
import fs from "fs";
import {
  inspectZipArchive,
  getPreviewImage,
  commitPropertyPhotos,
  commitAllBulkPhotos,
  cleanupBulkPhotoSession,
} from "./bulk-photo.service";
import { ApiError } from "../../middleware/error-handler";

export async function inspectBulkPhotoZipController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.file || !req.file.buffer) {
      throw new ApiError(400, "Please upload a ZIP file containing property photo folders.");
    }

    const originalName = req.file.originalname || "photos.zip";
    if (!originalName.toLowerCase().endsWith(".zip") && req.file.mimetype !== "application/zip" && req.file.mimetype !== "application/x-zip-compressed") {
      throw new ApiError(400, `Uploaded file "${originalName}" is not a valid ZIP archive. Please select a .zip file.`);
    }

    console.log(`[BulkPhoto] Inspecting ZIP archive "${originalName}" (${(req.file.size / (1024 * 1024)).toFixed(2)}MB)...`);
    const result = await inspectZipArchive(req.file.buffer, originalName);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

function getParam(param: string | string[] | undefined): string {
  if (Array.isArray(param)) return param[0] || "";
  return param || "";
}

export function getBulkPhotoPreviewImageController(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    const sessionId = getParam(req.params.sessionId);
    const fileId = getParam(req.params.fileId);
    if (!sessionId || !fileId) {
      throw new ApiError(400, "Missing sessionId or fileId parameters.");
    }

    const { filePath, mimeType } = getPreviewImage(sessionId, fileId);
    res.setHeader("Content-Type", mimeType);
    res.setHeader("Cache-Control", "private, max-age=3600");
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  } catch (err) {
    next(err);
  }
}

export async function commitBulkPhotosForPropertyController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { sessionId, propertyCode, excludedFileIds, coverImageId } = req.body;
    if (!sessionId) {
      throw new ApiError(400, "sessionId is required.");
    }
    if (!propertyCode) {
      throw new ApiError(400, "propertyCode is required.");
    }

    console.log(`[BulkPhoto] Committing photos for property "${propertyCode}" in session ${sessionId}...`);
    const result = await commitPropertyPhotos(sessionId, propertyCode, {
      excludedFileIds,
      coverImageId,
    });

    res.status(200).json({
      success: true,
      result,
    });
  } catch (err) {
    next(err);
  }
}

export async function commitAllBulkPhotosController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { sessionId, excludedPropertyCodes, excludedFileIds, coverImageIds } = req.body;
    if (!sessionId) {
      throw new ApiError(400, "sessionId is required.");
    }

    console.log(`[BulkPhoto] Committing all bulk photos in session ${sessionId}...`);
    const summary = await commitAllBulkPhotos(sessionId, {
      excludedPropertyCodes,
      excludedFileIds,
      coverImageIds,
    });

    res.status(200).json({
      success: true,
      summary,
    });
  } catch (err) {
    next(err);
  }
}

export function cleanupBulkPhotoSessionController(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    const sessionId = req.body.sessionId || req.params.sessionId;
    if (!sessionId) {
      throw new ApiError(400, "sessionId is required.");
    }

    cleanupBulkPhotoSession(sessionId);
    res.status(200).json({
      success: true,
      message: "Session cleaned up successfully.",
    });
  } catch (err) {
    next(err);
  }
}
