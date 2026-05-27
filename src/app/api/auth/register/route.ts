import { NextResponse } from "next/server";
import { createSession, hashPassword, normalizeEmail, toPublicUser } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";
import { readAppSettings } from "@/lib/server/provider-config";
import { handleRouteError, jsonError, readJsonBody } from "@/lib/server/responses";
import { assertAuthRateLimit } from "@/lib/server/security";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const settings = await readAppSettings();
    if (!settings.registrationOpen) {
      return jsonError("Registration is closed.", 403);
    }

    const body = await readJsonBody<{ email?: string; password?: string }>(request);
    const email = normalizeEmail(body.email ?? "");
    const password = body.password ?? "";
    await assertAuthRateLimit(request, "register", [email || "missing-email"]);

    if (!email || password.length < 8) {
      return jsonError("Email and a password of at least 8 characters are required.");
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return jsonError("Email is already registered.", 409);
    }

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword(password)
      }
    });

    await createSession(user.id);
    return NextResponse.json({ user: toPublicUser(user) });
  } catch (error) {
    return handleRouteError(error);
  }
}
