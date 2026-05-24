import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { readHistory } from "@/lib/server/history";
import { handleRouteError } from "@/lib/server/responses";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireUser();
    const records = await readHistory(user.id);
    return NextResponse.json({ records });
  } catch (error) {
    return handleRouteError(error);
  }
}
