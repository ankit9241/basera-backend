export interface UploadFileOptions {
  buffer: Buffer;
  fileName: string;
  folder: string;
  mimeType: string;
  tags?: string[];
  metadata?: Record<string, string>;
}

export interface UploadResult {
  fileId: string;
  url: string;
  name: string;
  size?: number;
  width?: number;
  height?: number;
  format?: string;
  provider: "IMAGEKIT" | "S3" | "LOCAL";
}

export interface ImageTransformationOptions {
  width?: number;
  height?: number;
  quality?: number;
  format?: "auto" | "webp" | "avif" | "jpg" | "png";
  aspectRatio?: string;
  crop?: "maintain_ratio" | "force" | "at_least" | "at_max";
}

export interface ClientAuthParameters {
  token: string;
  expire: number;
  signature: string;
  publicKey: string;
}

export interface ImageStorageProvider {
  readonly providerName: "IMAGEKIT" | "S3" | "LOCAL";
  upload(options: UploadFileOptions): Promise<UploadResult>;
  delete(fileIdOrKey: string): Promise<boolean>;
  getUrl(pathOrUrl: string, transformations?: ImageTransformationOptions): string;
  getClientAuthParameters?(): ClientAuthParameters;
}
