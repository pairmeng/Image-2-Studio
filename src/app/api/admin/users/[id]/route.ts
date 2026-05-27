import { NextResponse } from "next/server";
import { hashPassword, requireAdmin, toPublicUser } from "@/lib/server/auth";
import { writeAdminAuditLog } from "@/lib/server/admin-audit";
import { prisma } from "@/lib/server/db";
import { handleRouteError, jsonError, readJsonBody } from "@/lib/server/responses";
import { getRequestClientIp } from "@/lib/server/security";

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
    const target = await prisma.user.findUnique({
      where: { id }
    });

    if (!target) {
      return jsonError("User not found.", 404);
    }

    const data: {
      disabled?: boolean;
      passwordHash?: string;
      role?: "ADMIN" | "USER";
    } = {};

    if (typeof body.disabled === "boolean") {
      data.disabled = id === admin.id ? false : body.disabled;
    }

    if (typeof body.password === "string" && body.password.length < 8) {
      return jsonError("Password must be at least 8 characters.", 400);
    }

    if (typeof body.password === "string") {
      data.passwordHash = await hashPassword(body.password);
    }

    if (body.role === "ADMIN" || body.role === "USER") {
      data.role = body.role;
    }

    if (target.role === "ADMIN" && (data.role === "USER" || data.disabled === true)) {
      const otherEnabledAdminCount = await prisma.user.count({
        where: {
          role: "ADMIN",
          disabled: false,
          id: {
            not: id
          }
        }
      });

      if (otherEnabledAdminCount <= 0) {
        return jsonError("Cannot remove the last enabled admin account.", 400);
      }
    }

    const user = await prisma.user.update({
      where: { id },
      data
    });
    const auditActions = [
      typeof data.disabled === "boolean" ? (data.disabled ? "user.disable" : "user.enable") : null,
      data.role && data.role !== target.role ? "user.role.update" : null,
      data.passwordHash ? "user.password.reset" : null
    ].filter((action): action is string => Boolean(action));

    for (const action of auditActions) {
      await writeAdminAuditLog({
        adminUserId: admin.id,
        action,
        targetType: "user",
        targetId: id,
        metadata: {
          previousRole: target.role,
          role: user.role,
          disabled: user.disabled,
          passwordReset: Boolean(data.passwordHash)
        },
        ipAddress: getRequestClientIp(request),
        userAgent: request.headers.get("user-agent")
      });
    }

    return NextResponse.json({ user: toPublicUser(user) });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
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
    await writeAdminAuditLog({
      adminUserId: admin.id,
      action: "user.delete",
      targetType: "user",
      targetId: id,
      metadata: {
        role: user.role,
        disabled: user.disabled
      },
      ipAddress: getRequestClientIp(request),
      userAgent: request.headers.get("user-agent")
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
