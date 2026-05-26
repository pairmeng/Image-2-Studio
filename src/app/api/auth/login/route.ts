import { NextResponse } from "next/server";
import { createSession, normalizeEmail, toPublicUser, verifyPassword } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";
import { jsonError, readJsonBody } from "@/lib/server/responses";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await readJsonBody<{ email?: string; password?: string }>(request);
  const email = normalizeEmail(body.email ?? "");
  const password = body.password ?? "";

  if (!email || !password) {
    return jsonError("Email and password are required.");
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.disabled || !(await verifyPassword(password, user.passwordHash))) {
    return jsonError("Invalid email or password.", 401);
  }

  await createSession(user.id);
  return NextResponse.json({ user: toPublicUser(user) });
}
