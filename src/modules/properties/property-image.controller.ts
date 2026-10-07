import { Request, Response, NextFunction } from "express";
import {
  getPropertyImages,
  uploadPropertyImages,
  reorderPropertyImages,
  setPrimaryPropertyImage,
  deletePropertyImage,
  getImageKitClientAuth,
} from "./property-image.service";
import { ApiError } from "../../middleware/error-handler";

function getParam(param: string | string[] | undefined): string {
  if (Array.isArray(param)) return param[0] || "";
  return param || "";
}

export async function listPropertyImagesController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const idOrCode = getParam(req.params.idOrCode);
    if (!idOrCode) throw new ApiError(400, "Property ID or code is required.");

    const images = await getPropertyImages(idOrCode);
    res.status(200).json({
      success: true,
      images,
    });
  } catch (error) {
    next(error);
  }
}

export async function uploadPropertyImagesController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const idOrCode = getParam(req.params.idOrCode);
  console.log(`[ImageUpload] [1. REQUEST] Received upload request for property "${idOrCode}"`);

  try {
    if (!idOrCode) throw new ApiError(400, "Property ID or code is required.");

    // Extract files from array, fields dictionary, or single file
    let files: Express.Multer.File[] = [];
    if (Array.isArray(req.files)) {
      files = req.files;
    } else if (req.files && typeof req.files === "object") {
      files = Object.values(req.files).flat();
    } else if (req.file) {
      files = [req.file];
    }

    console.log(`[ImageUpload] [2. MULTER] Received ${files.length} file(s) for "${idOrCode}"`);

    if (!files || files.length === 0) {
      throw new ApiError(400, "No image files received. Please select at least one image to upload.");
    }

    const { altText } = req.body;
    console.log(`[ImageUpload] [3. PIPELINE] Initiating upload pipeline for "${idOrCode}"...`);
    const createdImages = await uploadPropertyImages(idOrCode, files, altText);
    console.log(`[ImageUpload] [7. RESPONSE] Upload pipeline completed for "${idOrCode}". Created ${createdImages.length} record(s).`);

    res.status(201).json({
      success: true,
      message: `Successfully uploaded ${createdImages.length} image(s).`,
      images: createdImages,
    });
  } catch (error: any) {
    console.error(`[ImageUpload] [ERROR] Upload failed for property "${idOrCode}":`, error?.message || error);
    if (error instanceof ApiError) {
      return next(error);
    }
    // Remote ImageKit or connection failure -> 502 Bad Gateway
    if (error?.message && (error.message.includes("ImageKit") || error.message.includes("network") || error.message.includes("storage"))) {
      return next(new ApiError(502, `Storage service error: ${error.message}`));
    }
    next(error);
  }
}

export async function reorderPropertyImagesController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const idOrCode = getParam(req.params.idOrCode);
    const { imageIds } = req.body;

    if (!idOrCode) throw new ApiError(400, "Property ID or code is required.");
    if (!imageIds || !Array.isArray(imageIds)) {
      throw new ApiError(400, "imageIds must be an array of image IDs in desired sort order.");
    }

    const images = await reorderPropertyImages(idOrCode, imageIds);

    res.status(200).json({
      success: true,
      message: "Property images reordered successfully.",
      images,
    });
  } catch (error) {
    next(error);
  }
}

export async function setPrimaryPropertyImageController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const idOrCode = getParam(req.params.idOrCode);
    const imageId = getParam(req.params.imageId);
    if (!idOrCode || !imageId) {
      throw new ApiError(400, "Both property code and imageId are required.");
    }

    const images = await setPrimaryPropertyImage(idOrCode, imageId);

    res.status(200).json({
      success: true,
      message: "Primary cover image set successfully.",
      images,
    });
  } catch (error) {
    next(error);
  }
}

export async function deletePropertyImageController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const idOrCode = getParam(req.params.idOrCode);
    const imageId = getParam(req.params.imageId);
    if (!idOrCode || !imageId) {
      throw new ApiError(400, "Both property code and imageId are required.");
    }

    const result = await deletePropertyImage(idOrCode, imageId);

    res.status(200).json({
      message: "Property image removed successfully.",
      ...result,
    });
  } catch (error) {
    next(error);
  }
}

export async function getImageKitAuthController(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authParams = getImageKitClientAuth();
    res.status(200).json({
      success: true,
      ...authParams,
    });
  } catch (error) {
    next(error);
  }
}
