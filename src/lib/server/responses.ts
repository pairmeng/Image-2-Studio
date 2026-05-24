import { NextResponse } from "next/server";
import { AppError } from "./errors";

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function handleRouteError(error: unknown) {
  if (error instanceof AppError) {
    return jsonError(error.message, error.status);
  }

  const message = error instanceof Error ? error.message : "Request failed.";
  return jsonError(message, 500);
}
