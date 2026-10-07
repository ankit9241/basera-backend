import { ImageStorageProvider } from "./storage.interface";
import { ImageKitStorageProvider } from "./imagekit.provider";

let storageProviderInstance: ImageStorageProvider | null = null;

export function getImageStorageProvider(): ImageStorageProvider {
  if (!storageProviderInstance) {
    const providerType = (process.env.STORAGE_PROVIDER || "IMAGEKIT").toUpperCase();
    if (providerType === "IMAGEKIT") {
      storageProviderInstance = new ImageKitStorageProvider();
    } else {
      // Future S3 provider would be plugged in here
      storageProviderInstance = new ImageKitStorageProvider();
    }
  }
  return storageProviderInstance;
}

export * from "./storage.interface";
export * from "./imagekit.provider";
