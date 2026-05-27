export type AdminUsageRange = "7d" | "30d";

export function normalizeAdminUsageRange(value: string | null | undefined): AdminUsageRange {
  return value === "30d" ? "30d" : "7d";
}
