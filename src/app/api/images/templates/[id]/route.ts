import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { deletePromptTemplateForUser, updatePromptTemplateForUser } from "@/lib/server/templates";
import { handleRouteError, readJsonBody } from "@/lib/server/responses";

export const runtime = "nodejs";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const body = await readJsonBody<{
      title?: unknown;
      category?: unknown;
      mode?: unknown;
      content?: unknown;
    }>(request);
    const template = await updatePromptTemplateForUser(user.id, id, body);

    return NextResponse.json(template);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const result = await deletePromptTemplateForUser(user.id, id);

    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
