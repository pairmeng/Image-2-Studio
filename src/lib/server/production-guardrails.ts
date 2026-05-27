import { AppError } from "./errors";

const weakValues = new Set([
  "",
  "change-me",
  "change-this-password",
  "replace-with-at-least-32-random-characters",
  "replace-with-a-strong-admin-password"
]);

function isWeakSecret(value: string | undefined | null) {
  const normalized = value?.trim() ?? "";
  return weakValues.has(normalized)
    || normalized.toLowerCase().includes("replace-with")
    || normalized.toLowerCase().includes("changeme");
}

function getDatabaseUrlPassword(value: string | undefined | null) {
  if (!value) return "";

  try {
    return new URL(value).password;
  } catch {
    return "";
  }
}

function usesBundledPostgres(value: string | undefined | null) {
  if (!value) return false;

  try {
    const parsed = new URL(value);
    return parsed.hostname === "postgres" && parsed.username === "image2";
  } catch {
    return false;
  }
}

export function assertProductionConfiguration(env: NodeJS.ProcessEnv = process.env) {
  if (env.NODE_ENV !== "production") return;

  const appSecret = env.APP_SECRET?.trim() ?? "";
  if (appSecret.length < 32 || isWeakSecret(appSecret)) {
    throw new AppError("Production APP_SECRET must be at least 32 characters and cannot use example values.", 500);
  }

  const databasePassword = getDatabaseUrlPassword(env.DATABASE_URL);
  if (usesBundledPostgres(env.DATABASE_URL) && isWeakSecret(databasePassword)) {
    throw new AppError("Production bundled PostgreSQL password cannot use a default placeholder value.", 500);
  }

  const postgresPassword = env.POSTGRES_PASSWORD?.trim();
  if (postgresPassword && isWeakSecret(postgresPassword) && usesBundledPostgres(env.DATABASE_URL)) {
    throw new AppError("Production POSTGRES_PASSWORD cannot use a default placeholder value.", 500);
  }

  if (env.INITIAL_ADMIN_PASSWORD && isWeakSecret(env.INITIAL_ADMIN_PASSWORD)) {
    throw new AppError("Production INITIAL_ADMIN_PASSWORD cannot use a default placeholder value.", 500);
  }

  if (env.AUTH_COOKIE_SECURE?.trim().toLowerCase() === "false") {
    throw new AppError("Production AUTH_COOKIE_SECURE=false is not allowed.", 500);
  }
}
