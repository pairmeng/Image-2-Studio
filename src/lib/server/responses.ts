import { NextResponse } from "next/server";
import { AppError } from "./errors";
import { readLimitedJsonBody } from "./security";

const GENERIC_ROUTE_ERROR_MESSAGE = "Request failed.";
type RouteErrorEnv = {
  NODE_ENV?: string;
};

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function readJsonBody<T = Record<string, unknown>>(request: Request): Promise<T> {
  return readLimitedJsonBody<T>(request);
}

export function handleRouteError(error: unknown, env: RouteErrorEnv = process.env) {
  if (error instanceof AppError) {
    return jsonError(error.message, error.status);
  }

  console.error("[route] Unexpected error", error);

  const message = env.NODE_ENV === "production"
    ? GENERIC_ROUTE_ERROR_MESSAGE
    : (error instanceof Error && error.message ? error.message : GENERIC_ROUTE_ERROR_MESSAGE);

  return jsonError(message, 500);
}
