import { NextResponse } from "next/server";
import { getAppSettings, getPublicBranding } from "@/lib/server/provider-config";

export const runtime = "nodejs";

export async function GET() {
  const settings = await getAppSettings();

  return NextResponse.json(getPublicBranding(settings));
}
