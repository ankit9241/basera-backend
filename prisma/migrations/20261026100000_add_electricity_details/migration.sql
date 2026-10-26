-- Add electricityDetails JSONB column to Property
ALTER TABLE "Property" ADD COLUMN IF NOT EXISTS "electricityDetails" JSONB;
