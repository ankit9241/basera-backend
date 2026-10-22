export type PhotoValidationStatus =
  | "VALID"
  | "UNSUPPORTED"
  | "CORRUPTED"
  | "OVERSIZED"
  | "SVG_REJECTED";

export interface BulkPhotoItem {
  id: string; // Temporary ID within this session
  originalFilename: string;
  entryPath: string;
  size: number;
  mimeType: string;
  thumbnailDataUrl: string; // Base64 data URL for client preview
  status: PhotoValidationStatus;
  error?: string;
  isCoverCandidate?: boolean;
}

export interface BulkPhotoPropertyFolder {
  folderName: string;
  propertyCode: string;
  propertyId?: string;
  propertyName?: string;
  localityZone?: string;
  isMatched: boolean;
  existingPhotoCount: number;
  photos: BulkPhotoItem[];
  validCount: number;
  invalidCount: number;
  warnings: string[];
  errors: string[];
}

export interface BulkPhotoInspectResult {
  sessionId: string;
  zipFileName: string;
  totalZipSize: number;
  totalDecompressedSize: number;
  totalEntries: number;
  totalProperties: number;
  matchedProperties: number;
  unknownProperties: number;
  totalValidPhotos: number;
  totalInvalidPhotos: number;
  properties: BulkPhotoPropertyFolder[];
  globalWarnings: string[];
  globalErrors: string[];
}

export interface BulkPhotoCommitPropertyOptions {
  excludedFileIds?: string[];
  coverImageId?: string; // ID of photo to designate as cover
}

export interface BulkPhotoCommitPropertyResult {
  propertyCode: string;
  propertyId: string;
  propertyName: string;
  uploadedCount: number;
  skippedCount: number;
  failedCount: number;
  images: {
    id: string;
    mediaUrl: string;
    isPrimary: boolean;
    displayOrder: number;
    originalFilename: string;
  }[];
  errors: string[];
}

export interface BulkPhotoBatchCommitOptions {
  excludedPropertyCodes?: string[];
  excludedFileIds?: string[];
  coverImageIds?: Record<string, string>; // propertyCode -> fileId
}

export interface BulkPhotoFinalSummary {
  sessionId: string;
  totalPropertiesProcessed: number;
  totalPhotosUploaded: number;
  totalPhotosSkipped: number;
  totalPhotosFailed: number;
  propertyResults: BulkPhotoCommitPropertyResult[];
}
