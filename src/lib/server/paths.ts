import path from "node:path";

export const ROOT_DIR = process.cwd();
export const PUBLIC_DIR = path.join(ROOT_DIR, "public");
export const GENERATED_DIR = path.join(PUBLIC_DIR, "generated");
export const UPLOADS_DIR = path.join(PUBLIC_DIR, "uploads");
export const STORAGE_DIR = path.join(ROOT_DIR, "storage");
export const STORAGE_GENERATED_DIR = path.join(STORAGE_DIR, "generated");
export const STORAGE_UPLOADS_DIR = path.join(STORAGE_DIR, "uploads");
export const DATA_DIR = path.join(ROOT_DIR, "data");
export const HISTORY_FILE = path.join(DATA_DIR, "images.json");
export const PROVIDER_CONFIG_FILE = path.join(DATA_DIR, "provider-config.json");

export function publicPathToFilePath(publicPath: string) {
  const normalized = publicPath.replace(/^\//, "").replaceAll("/", path.sep);
  const resolved = path.resolve(PUBLIC_DIR, normalized.replace(/^public[\\/]/, ""));

  if (!resolved.startsWith(PUBLIC_DIR)) {
    throw new Error("Invalid public path.");
  }

  return resolved;
}
