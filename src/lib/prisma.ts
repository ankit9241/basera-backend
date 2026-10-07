import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient | undefined;
}

function getDatabaseUrl(): string | undefined {
  let url = process.env.DATABASE_URL;
  if (!url) return undefined;
  if (!url.includes("connect_timeout")) {
    url += (url.includes("?") ? "&" : "?") + "connect_timeout=30&pool_timeout=30";
  }
  return url;
}

const dbUrl = getDatabaseUrl();

export const prisma =
  globalThis.prismaGlobal ??
  new PrismaClient({
    datasources: dbUrl ? { db: { url: dbUrl } } : undefined,
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.prismaGlobal = prisma;
}

export default prisma;
