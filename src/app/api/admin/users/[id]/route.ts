import { NextResponse } from "next/server";
import { hashPassword, requireAdmin, toPublicUser } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";
import { handleRouteError, jsonError, readJsonBody } from "@/lib/server/responses";

export const runtime = "nodejs";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const { id } = await context.params;
    const body = await readJsonBody<{
      disabled?: boolean;
      password?: string;
      role?: "ADMIN" | "USER";
    }>(request);

    const data: {
      disabled?: boolean;
      passwordHash?: string;
      role?: "ADMIN" | "USER";
    } = {};

    if (typeof body.disabled === "boolean") {
      data.disabled = id === admin.id ? false : body.disabled;
    }

    if (typeof body.password === "string" && body.password.length >= 8) {
      data.passwordHash = await hashPassword(body.password);
    }

    if (body.role === "ADMIN" || body.role === "USER") {
      data.role = body.role;
    }

    const user = await prisma.user.update({
      where: { id },
      data
    });

    return NextResponse.json({ user: toPublicUser(user) });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const { id } = await context.params;

    if (id === admin.id) {
      return jsonError("You cannot delete your own admin account.", 400);
    }

    const user = await prisma.user.findUnique({
      where: { id }
    });

    if (!user) {
      return jsonError("User not found.", 404);
    }

    if (user.role === "ADMIN") {
      const adminCount = await prisma.user.count({
        where: { role: "ADMIN" }
      });

      if (adminCount <= 1) {
        return jsonError("Cannot delete the last admin account.", 400);
      }
    }

    await prisma.user.delete({
      where: { id }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
