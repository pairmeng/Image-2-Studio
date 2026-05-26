import { NextResponse } from "next/server";
import { hashPassword, normalizeEmail, requireAdmin, toPublicUser } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";
import { jsonError, handleRouteError, readJsonBody } from "@/lib/server/responses";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const body = await readJsonBody<{
      email?: string;
      password?: string;
      role?: "ADMIN" | "USER";
    }>(request);
    const email = normalizeEmail(body.email ?? "");
    const password = body.password ?? "";

    if (!email || password.length < 8) {
      return jsonError("Email and a password of at least 8 characters are required.");
    }

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword(password),
        role: body.role === "ADMIN" ? "ADMIN" : "USER"
      }
    });

    return NextResponse.json({ user: toPublicUser(user) });
  } catch (error) {
    return handleRouteError(error);
  }
}
