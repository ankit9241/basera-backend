/**
 * India Standard Time (IST - UTC+05:30) Date & Time Utilities
 */

export const IST_TIMEZONE = "Asia/Kolkata";

export function formatISTDate(date: Date | string | number): string {
  const d = typeof date === "object" ? date : new Date(date);
  return d.toLocaleDateString("en-IN", {
    timeZone: IST_TIMEZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatISTTime(date: Date | string | number): string {
  const d = typeof date === "object" ? date : new Date(date);
  return d.toLocaleTimeString("en-IN", {
    timeZone: IST_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

export function formatISTDateTime(date: Date | string | number): string {
  return `${formatISTDate(date)}, ${formatISTTime(date)} IST`;
}
