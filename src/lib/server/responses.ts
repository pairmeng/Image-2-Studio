import { NextResponse } from "next/server";
import { AppError } from "./errors";

const GENERIC_ROUTE_ERROR_MESSAGE = "Request failed.";
type RouteErrorEnv = {
  NODE_ENV?: string;
};

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function readJsonBody<T = Record<string, unknown>>(request: Request): Promise<T> {
  const text = await request.text().catch(() => "");
  if (!text.trim()) return {} as T;

  try {
    const body = JSON.parse(text) as unknown;
    return body && typeof body === "object" && !Array.isArray(body)
      ? body as T
      : {} as T;
  } catch {
    return {} as T;
  }
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
