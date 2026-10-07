import ImageKit from "imagekit";
import {
  ImageStorageProvider,
  UploadFileOptions,
  UploadResult,
  ImageTransformationOptions,
  ClientAuthParameters,
} from "./storage.interface";

export class ImageKitStorageProvider implements ImageStorageProvider {
  readonly providerName = "IMAGEKIT" as const;
  private imagekit: ImageKit;
  private publicKey: string;
  private privateKey: string;
  private urlEndpoint: string;

  constructor() {
    this.publicKey = process.env.IMAGEKIT_PUBLIC_KEY || "";
    this.privateKey = process.env.IMAGEKIT_PRIVATE_KEY || "";
    this.urlEndpoint = process.env.IMAGEKIT_URL_ENDPOINT || "";

    this.imagekit = new ImageKit({
      publicKey: this.publicKey,
      privateKey: this.privateKey,
      urlEndpoint: this.urlEndpoint,
    });
  }

  private isConfigured(): boolean {
    return Boolean(
      this.publicKey &&
      this.privateKey &&
      this.urlEndpoint &&
      !this.privateKey.startsWith("mock_")
    );
  }

  async upload(options: UploadFileOptions): Promise<UploadResult> {
    if (!this.isConfigured()) {
      throw new Error(
        "ImageKit is not fully configured. Please provide IMAGEKIT_PUBLIC_KEY, IMAGEKIT_PRIVATE_KEY, and IMAGEKIT_URL_ENDPOINT in your backend environment variables."
      );
    }

    const base64File = options.buffer.toString("base64");

    const uploadParams: any = {
      file: base64File,
      fileName: options.fileName,
      folder: options.folder,
      tags: options.tags || ["basera", "property"],
      useUniqueFileName: true,
    };

    if (options.metadata && Object.keys(options.metadata).length > 0) {
      uploadParams.customMetadata = options.metadata;
    }

    const response = await this.imagekit.upload(uploadParams);

    return {
      fileId: response.fileId,
      url: response.url,
      name: response.name,
      size: response.size,
      width: response.width,
      height: response.height,
      format: (response as any).format || options.mimeType.split("/")[1] || "jpeg",
      provider: "IMAGEKIT",
    };
  }

  async delete(fileIdOrKey: string): Promise<boolean> {
    if (!this.isConfigured()) {
      console.warn("ImageKit is not configured. Skipping remote file deletion for:", fileIdOrKey);
      return true;
    }

    try {
      await this.imagekit.deleteFile(fileIdOrKey);
      return true;
    } catch (err: any) {
      // If the file already doesn't exist on ImageKit (404), treat as successfully removed
      if (err?.status === 404 || err?.statusCode === 404) {
        return true;
      }
      console.error(`Failed to delete ImageKit asset with fileId ${fileIdOrKey}:`, err);
      throw new Error(err.message || "Failed to delete image from ImageKit storage.");
    }
  }

  getUrl(pathOrUrl: string, transformations?: ImageTransformationOptions): string {
    if (!this.urlEndpoint || !transformations) {
      return pathOrUrl;
    }

    // Build transformation options for ImageKit
    const ikTransform: Record<string, string | number> = {};
    if (transformations.width) ikTransform.width = transformations.width;
    if (transformations.height) ikTransform.height = transformations.height;
    if (transformations.quality) ikTransform.quality = transformations.quality;
    if (transformations.format && transformations.format !== "auto") {
      ikTransform.format = transformations.format;
    }
    if (transformations.aspectRatio) {
      ikTransform.aspectRatio = transformations.aspectRatio;
    }
    if (transformations.crop) {
      ikTransform.crop = transformations.crop;
    }

    try {
      if (pathOrUrl.startsWith("http")) {
        return this.imagekit.url({
          src: pathOrUrl,
          transformation: [ikTransform],
        });
      }

      return this.imagekit.url({
        path: pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`,
        urlEndpoint: this.urlEndpoint,
        transformation: [ikTransform],
      });
    } catch {
      return pathOrUrl;
    }
  }

  getClientAuthParameters(): ClientAuthParameters {
    if (!this.isConfigured()) {
      throw new Error("ImageKit is not configured. Cannot generate client upload signature.");
    }

    const auth = this.imagekit.getAuthenticationParameters();
    return {
      token: auth.token,
      expire: auth.expire,
      signature: auth.signature,
      publicKey: this.publicKey,
    };
  }
}
