-- Final Launch Listing Data Schema Migration
-- Matches 25-column CSV specification while preserving all existing tables & relations

-- CreateEnum
CREATE TYPE "FoodStatus" AS ENUM ('INCLUDED', 'AVAILABLE', 'NOT_AVAILABLE');

-- CreateEnum
CREATE TYPE "ElectricityBillingType" AS ENUM ('INCLUDED', 'BY_METER', 'FIXED_MONTHLY', 'EXTRA_AS_PER_USAGE');

-- CreateEnum
CREATE TYPE "FurnishedStatus" AS ENUM ('FULLY_FURNISHED', 'SEMI_FURNISHED', 'UNFURNISHED');

-- CreateEnum
CREATE TYPE "OwnerType" AS ENUM ('LANDLORD', 'CARETAKER', 'PROPERTY_MANAGER', 'BROKER', 'OTHER');

-- CreateEnum
CREATE TYPE "AvailabilityStatus" AS ENUM ('AVAILABLE', 'OCCUPIED', 'COMING_SOON', 'UNDER_MAINTENANCE', 'PAUSED');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'IN_REVIEW', 'VERIFIED', 'REJECTED');

-- AlterTable
ALTER TABLE "Property" ADD COLUMN     "area" TEXT,
ADD COLUMN     "availabilityStatus" "AvailabilityStatus" NOT NULL DEFAULT 'AVAILABLE',
ADD COLUMN     "availableRooms" INTEGER DEFAULT 1,
ADD COLUMN     "doubleRoomRent" DECIMAL(10,2),
ADD COLUMN     "electricityCharges" DECIMAL(10,2),
ADD COLUMN     "electricityType" "ElectricityBillingType",
ADD COLUMN     "food" "FoodStatus" DEFAULT 'NOT_AVAILABLE',
ADD COLUMN     "foodCharges" DECIMAL(10,2),
ADD COLUMN     "furnishedStatus" "FurnishedStatus" DEFAULT 'FULLY_FURNISHED',
ADD COLUMN     "otherCharges" DECIMAL(10,2),
ADD COLUMN     "ownerType" "OwnerType" DEFAULT 'LANDLORD',
ADD COLUMN     "photoDriveLink" TEXT,
ADD COLUMN     "singleRoomRent" DECIMAL(10,2),
ADD COLUMN     "tripleRoomRent" DECIMAL(10,2),
ADD COLUMN     "verificationNotes" TEXT,
ADD COLUMN     "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
ALTER COLUMN "rentMin" SET DEFAULT 0,
ALTER COLUMN "rentMax" SET DEFAULT 0,
ALTER COLUMN "depositAmount" SET DEFAULT 0,
ALTER COLUMN "depositAmount" SET DATA TYPE DECIMAL(10,2),
ALTER COLUMN "distanceMin" SET DEFAULT 5,
ALTER COLUMN "distanceText" SET DEFAULT 'Near DU Campus';

-- Backfill area from existing localityZone for existing seeded rows
UPDATE "Property" SET "area" = "localityZone" WHERE "area" IS NULL;

-- Backfill verificationStatus for existing verified properties
UPDATE "Property" SET "verificationStatus" = 'VERIFIED' WHERE "isVerified" = true;

-- CreateIndex
CREATE INDEX "Property_area_idx" ON "Property"("area");

-- CreateIndex
CREATE INDEX "Property_availabilityStatus_idx" ON "Property"("availabilityStatus");

-- CreateIndex
CREATE INDEX "Property_verificationStatus_idx" ON "Property"("verificationStatus");

-- CreateIndex
CREATE INDEX "PropertyMedia_propertyId_displayOrder_idx" ON "PropertyMedia"("propertyId", "displayOrder");
