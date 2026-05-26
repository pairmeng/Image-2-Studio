import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { createProjectForUser, readProjectsForUser } from "@/lib/server/projects";
import { handleRouteError, readJsonBody } from "@/lib/server/responses";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireUser();
    const projects = await readProjectsForUser(user.id);

    return NextResponse.json(projects);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await readJsonBody<{ name?: unknown; color?: unknown }>(request);
    const project = await createProjectForUser(user.id, body);

    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
