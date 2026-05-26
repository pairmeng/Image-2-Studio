import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { createPromptTemplateForUser, readPromptTemplatesForUser } from "@/lib/server/templates";
import { handleRouteError, readJsonBody } from "@/lib/server/responses";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireUser();
    const templates = await readPromptTemplatesForUser(user.id);

    return NextResponse.json(templates);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await readJsonBody<{
      title?: unknown;
      category?: unknown;
      mode?: unknown;
      content?: unknown;
    }>(request);
    const template = await createPromptTemplateForUser(user.id, body);

    return NextResponse.json(template, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
