-- Add DepositPolicy enum and column to Property
CREATE TYPE "DepositPolicy" AS ENUM ('ONE_MONTH_RENT', 'FIXED_AMOUNT', 'CUSTOM');

ALTER TABLE "Property" ADD COLUMN "depositPolicy" "DepositPolicy";
