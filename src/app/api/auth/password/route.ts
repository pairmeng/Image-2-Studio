import { NextResponse } from "next/server";
import {
  destroyOtherSessions,
  getCurrentSession,
  hashPassword,
  toPublicUser,
  verifyPassword
} from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";
import { parsePasswordChangeInput } from "@/lib/server/password-policy";
import { handleRouteError, jsonError, readJsonBody } from "@/lib/server/responses";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const session = await getCurrentSession();
    if (!session) {
      return jsonError("Authentication required.", 401);
    }

    const validation = parsePasswordChangeInput(await readJsonBody(request));
    if (!validation.ok) {
      return jsonError(validation.error);
    }
    const { currentPassword, newPassword } = validation.input;

    if (!(await verifyPassword(currentPassword, session.user.passwordHash))) {
      return jsonError("Current password is incorrect.", 401);
    }

    if (await verifyPassword(newPassword, session.user.passwordHash)) {
      return jsonError("New password must be different from the current password.");
    }

    const user = await prisma.user.update({
      where: { id: session.user.id },
      data: { passwordHash: await hashPassword(newPassword) }
    });
    await destroyOtherSessions(user.id, session.id);

    return NextResponse.json({ user: toPublicUser(user) });
  } catch (error) {
    return handleRouteError(error);
  }
}
