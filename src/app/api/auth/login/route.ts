import { NextResponse } from "next/server";
import { createSession, normalizeEmail, toPublicUser, verifyPassword } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";
import { handleRouteError, jsonError, readJsonBody } from "@/lib/server/responses";
import { assertAuthRateLimit, getRequestClientIp } from "@/lib/server/security";
import { writeAdminAuditLog } from "@/lib/server/admin-audit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await readJsonBody<{ email?: string; password?: string }>(request);
    const email = normalizeEmail(body.email ?? "");
    const password = body.password ?? "";

    await assertAuthRateLimit(request, "login", [email || "missing-email"]);

    if (!email || !password) {
      return jsonError("Email and password are required.");
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || user.disabled || !(await verifyPassword(password, user.passwordHash))) {
      return jsonError("Invalid email or password.", 401);
    }

    await createSession(user.id);
    if (user.role === "ADMIN") {
      await writeAdminAuditLog({
        adminUserId: user.id,
        action: "auth.login",
        targetType: "user",
        targetId: user.id,
        metadata: { result: "success" },
        ipAddress: getRequestClientIp(request),
        userAgent: request.headers.get("user-agent")
      });
    }

    return NextResponse.json({ user: toPublicUser(user) });
  } catch (error) {
    return handleRouteError(error);
  }
}
