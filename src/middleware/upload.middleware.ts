import multer from "multer";
import { MAX_FILE_SIZE_BYTES, MAX_IMAGES_PER_UPLOAD } from "../lib/storage/image.validator";
import { ApiError } from "./error-handler";

const storage = multer.memoryStorage();

export const uploadImagesMiddleware = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
    files: MAX_IMAGES_PER_UPLOAD,
  },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (allowed.includes(file.mimetype.toLowerCase())) {
      cb(null, true);
    } else {
      cb(
        new ApiError(
          400,
          `Invalid file format "${file.originalname}". Only JPEG, PNG, and WebP images are permitted.`
        )
      );
    }
  },
});
