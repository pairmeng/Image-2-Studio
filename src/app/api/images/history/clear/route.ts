import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { clearHistory } from "@/lib/server/history";
import { handleRouteError } from "@/lib/server/responses";

export const runtime = "nodejs";

export async function POST() {
  try {
    const user = await requireUser();
    await clearHistory(user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
