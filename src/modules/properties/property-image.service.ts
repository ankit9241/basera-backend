import prisma from "../../lib/prisma";
import { ApiError } from "../../middleware/error-handler";
import { getImageStorageProvider } from "../../lib/storage";
import {
  validateImageFile,
  sanitizeImageFilename,
  MAX_IMAGES_PER_UPLOAD,
} from "../../lib/storage/image.validator";

/**
 * Normalizes property identifier (slug, code, id, or PF101/PF-101/PF#101)
 */
async function resolveProperty(idOrCode: string) {
  let decoded = idOrCode;
  try {
    decoded = decodeURIComponent(idOrCode);
  } catch {}

  const normalizedCode = decoded.toUpperCase().replace(/^PF-/, "PF#");
  const directHash =
    decoded.toUpperCase().startsWith("PF") && !decoded.includes("#") && !decoded.includes("-")
      ? `PF#${decoded.slice(2)}`
      : decoded;

  const property = await prisma.property.findFirst({
    where: {
      OR: [
        { id: idOrCode },
        { id: decoded },
        { propertyCode: idOrCode },
        { propertyCode: decoded },
        { propertyCode: normalizedCode },
        { propertyCode: directHash },
        { slug: idOrCode.toLowerCase() },
        { slug: decoded.toLowerCase() },
      ],
    },
  });

  if (!property) {
    throw new ApiError(404, `Property "${idOrCode}" not found.`);
  }

  return property;
}

export async function getPropertyImages(idOrCode: string) {
  const property = await resolveProperty(idOrCode);

  const images = await prisma.propertyMedia.findMany({
    where: { propertyId: property.id },
    orderBy: { displayOrder: "asc" },
  });

  return images;
}

export async function uploadPropertyImages(
  idOrCode: string,
  files: Express.Multer.File[],
  altText?: string
) {
  console.log(`[ImageUpload] [4. RESOLUTION] Resolving property identifier "${idOrCode}"...`);
  const property = await resolveProperty(idOrCode);
  console.log(`[ImageUpload] [4. RESOLUTION] Resolved to ${property.propertyCode} (ID: ${property.id}, Public: ${property.publicName})`);

  if (!files || files.length === 0) {
    throw new ApiError(400, "No image files provided for upload.");
  }

  if (files.length > MAX_IMAGES_PER_UPLOAD) {
    throw new ApiError(
      400,
      `Exceeded batch upload limit. Maximum ${MAX_IMAGES_PER_UPLOAD} images can be uploaded simultaneously.`
    );
  }

  // 1. Validate all files before uploading any
  console.log(`[ImageUpload] [5. VALIDATION] Validating ${files.length} file(s)...`);
  for (const file of files) {
    validateImageFile(file);
  }
  console.log(`[ImageUpload] [5. VALIDATION] All ${files.length} file(s) passed MIME, size, and magic byte checks.`);

  const storage = getImageStorageProvider();
  const cleanCode = property.propertyCode.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  const folder = `basera/properties/${cleanCode}`;

  // 2. Query existing images to compute displayOrder
  const existingImages = await prisma.propertyMedia.findMany({
    where: { propertyId: property.id },
    orderBy: { displayOrder: "desc" },
    take: 1,
  });

  let nextOrder = existingImages.length > 0 ? existingImages[0].displayOrder + 1 : 0;
  const isFirstImageOverall = existingImages.length === 0;

  const createdMediaRecords = [];
  const uploadedStorageKeys: string[] = [];

  try {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const safeFilename = sanitizeImageFilename(file.originalname, property.propertyCode, i);

      // Upload to storage provider
      console.log(`[Storage] Uploading asset ${i + 1}/${files.length} for ${property.propertyCode} to ${storage.providerName}...`);
      const uploadResult = await storage.upload({
        buffer: file.buffer,
        fileName: safeFilename,
        folder,
        mimeType: file.mimetype,
        tags: ["property", cleanCode, `pid_${property.id}`],
      });
      console.log(`[Storage] Upload successful: ${uploadResult.fileId} -> ${uploadResult.url}`);

      uploadedStorageKeys.push(uploadResult.fileId);

      const isPrimary = isFirstImageOverall && i === 0;
      const mediaRecord = await prisma.propertyMedia.create({
        data: {
          propertyId: property.id,
          mediaUrl: uploadResult.url,
          mediaType: "image",
          storageProvider: uploadResult.provider,
          storageKey: uploadResult.fileId,
          displayOrder: nextOrder++,
          isPrimary,
          altText: altText || `${property.publicName} photo ${nextOrder}`,
          width: uploadResult.width,
          height: uploadResult.height,
          fileSize: uploadResult.size,
        },
      });

      createdMediaRecords.push(mediaRecord);
    }

    return createdMediaRecords;
  } catch (error) {
    // If partial upload failed, clean up any storage files that were already uploaded
    console.error("Upload aborted due to error, rolling back storage assets:", error);
    for (const key of uploadedStorageKeys) {
      try {
        await storage.delete(key);
      } catch (cleanupErr) {
        console.warn(`Failed to cleanup orphaned storage key ${key}:`, cleanupErr);
      }
    }
    throw error;
  }
}

export async function reorderPropertyImages(idOrCode: string, imageIds: string[]) {
  const property = await resolveProperty(idOrCode);

  if (!Array.isArray(imageIds) || imageIds.length === 0) {
    throw new ApiError(400, "imageIds array is required for reordering.");
  }

  const existingImages = await prisma.propertyMedia.findMany({
    where: { propertyId: property.id },
  });

  const existingIds = new Set(existingImages.map((img) => img.id));
  for (const id of imageIds) {
    if (!existingIds.has(id)) {
      throw new ApiError(400, `Image ID "${id}" does not belong to this property.`);
    }
  }

  const unmentionedImages = existingImages.filter((img) => !imageIds.includes(img.id));
  const fullOrder = [...imageIds, ...unmentionedImages.map((img) => img.id)];

  // Update in a transaction
  await prisma.$transaction(
    fullOrder.map((id, index) =>
      prisma.propertyMedia.update({
        where: { id },
        data: {
          displayOrder: index,
          isPrimary: index === 0,
        },
      })
    )
  );

  return prisma.propertyMedia.findMany({
    where: { propertyId: property.id },
    orderBy: { displayOrder: "asc" },
  });
}

export async function setPrimaryPropertyImage(idOrCode: string, imageId: string) {
  const property = await resolveProperty(idOrCode);

  const targetImage = await prisma.propertyMedia.findFirst({
    where: { id: imageId, propertyId: property.id },
  });

  if (!targetImage) {
    throw new ApiError(404, `Image "${imageId}" not found on this property.`);
  }

  const allImages = await prisma.propertyMedia.findMany({
    where: { propertyId: property.id },
    orderBy: { displayOrder: "asc" },
  });

  const otherImages = allImages.filter((img) => img.id !== imageId);
  const reordered = [targetImage, ...otherImages];

  await prisma.$transaction(
    reordered.map((img, index) =>
      prisma.propertyMedia.update({
        where: { id: img.id },
        data: {
          displayOrder: index,
          isPrimary: index === 0,
        },
      })
    )
  );

  return prisma.propertyMedia.findMany({
    where: { propertyId: property.id },
    orderBy: { displayOrder: "asc" },
  });
}

export async function deletePropertyImage(idOrCode: string, imageId: string) {
  const property = await resolveProperty(idOrCode);

  const media = await prisma.propertyMedia.findFirst({
    where: { id: imageId, propertyId: property.id },
  });

  if (!media) {
    throw new ApiError(404, `Image "${imageId}" not found on this property.`);
  }

  // 1. Delete from remote storage first if key is present
  if (media.storageKey && media.storageProvider === "IMAGEKIT") {
    const storage = getImageStorageProvider();
    await storage.delete(media.storageKey);
  }

  // 2. Delete database record
  await prisma.propertyMedia.delete({
    where: { id: imageId },
  });

  // 3. Re-normalize remaining images so displayOrder is contiguous and primary is preserved
  const remaining = await prisma.propertyMedia.findMany({
    where: { propertyId: property.id },
    orderBy: { displayOrder: "asc" },
  });

  if (remaining.length > 0) {
    await prisma.$transaction(
      remaining.map((img, index) =>
        prisma.propertyMedia.update({
          where: { id: img.id },
          data: {
            displayOrder: index,
            isPrimary: index === 0,
          },
        })
      )
    );
  }

  return { success: true, deletedId: imageId };
}

export function getImageKitClientAuth() {
  const storage = getImageStorageProvider();
  if (storage.getClientAuthParameters) {
    return storage.getClientAuthParameters();
  }
  throw new ApiError(501, "Storage provider does not support client upload auth parameters.");
}
