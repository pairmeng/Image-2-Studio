import type { ImageProjectResponse } from "../types";
import { AppError } from "./errors";
import { prisma } from "./db";

const MAX_PROJECT_NAME_LENGTH = 60;
const MAX_ASSIGN_RECORDS = 100;
const MAX_TAGS = 12;
const MAX_TAG_LENGTH = 32;

function toProjectResponse(project: {
  id: string;
  name: string;
  color: string | null;
  archivedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  _count?: { images: number };
}): ImageProjectResponse {
  return {
    id: project.id,
    name: project.name,
    color: project.color ?? undefined,
    archivedAt: project.archivedAt?.toISOString(),
    imageCount: project._count?.images ?? 0,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString()
  };
}

function normalizeProjectName(value: unknown) {
  const name = typeof value === "string" ? value.trim() : "";
  if (!name) {
    throw new AppError("Enter a project name.");
  }

  return name.slice(0, MAX_PROJECT_NAME_LENGTH);
}

function normalizeRecordIds(value: unknown) {
  if (!Array.isArray(value)) {
    throw new AppError("Choose at least one image.");
  }

  const ids = Array.from(new Set(value.map((item) => typeof item === "string" ? item.trim() : "").filter(Boolean)));
  if (ids.length === 0) {
    throw new AppError("Choose at least one image.");
  }

  if (ids.length > MAX_ASSIGN_RECORDS) {
    throw new AppError(`Update at most ${MAX_ASSIGN_RECORDS} images at a time.`);
  }

  return ids;
}

function normalizeTags(value: unknown) {
  if (!Array.isArray(value)) return undefined;

  return Array.from(new Set(value
    .map((item) => typeof item === "string" ? item.trim() : "")
    .filter(Boolean)
    .map((item) => item.slice(0, MAX_TAG_LENGTH))))
    .slice(0, MAX_TAGS);
}

export async function readProjectsForUser(userId: string) {
  const projects = await prisma.imageProject.findMany({
    where: {
      userId,
      archivedAt: null
    },
    orderBy: { updatedAt: "desc" },
    include: {
      _count: {
        select: { images: true }
      }
    }
  });

  return {
    projects: projects.map(toProjectResponse)
  };
}

export async function createProjectForUser(userId: string, input: { name?: unknown; color?: unknown }) {
  const name = normalizeProjectName(input.name);
  const color = typeof input.color === "string" && input.color.trim() ? input.color.trim().slice(0, 32) : undefined;
  const existing = await prisma.imageProject.findUnique({
    where: {
      userId_name: {
        userId,
        name
      }
    },
    include: {
      _count: {
        select: { images: true }
      }
    }
  });

  if (existing) {
    if (existing.archivedAt) {
      const restored = await prisma.imageProject.update({
        where: { id: existing.id },
        data: {
          color,
          archivedAt: null
        },
        include: {
          _count: {
            select: { images: true }
          }
        }
      });

      return toProjectResponse(restored);
    }

    return toProjectResponse(existing);
  }

  const project = await prisma.imageProject.create({
    data: {
      userId,
      name,
      color
    },
    include: {
      _count: {
        select: { images: true }
      }
    }
  });

  return toProjectResponse(project);
}

export async function updateProjectForUser(userId: string, input: {
  id?: unknown;
  name?: unknown;
  color?: unknown;
  archived?: unknown;
}) {
  const id = typeof input.id === "string" ? input.id.trim() : "";
  if (!id) {
    throw new AppError("Project not found.", 404);
  }

  const existing = await prisma.imageProject.findFirst({
    where: {
      id,
      userId
    }
  });

  if (!existing) {
    throw new AppError("Project not found.", 404);
  }

  const data: {
    name?: string;
    color?: string | null;
    archivedAt?: Date | null;
  } = {};

  if (input.name !== undefined) {
    data.name = normalizeProjectName(input.name);
  }

  if (input.color !== undefined) {
    data.color = typeof input.color === "string" && input.color.trim() ? input.color.trim().slice(0, 32) : null;
  }

  if (typeof input.archived === "boolean") {
    data.archivedAt = input.archived ? (existing.archivedAt ?? new Date()) : null;
  }

  const project = await prisma.imageProject.update({
    where: { id },
    data,
    include: {
      _count: {
        select: { images: true }
      }
    }
  });

  return toProjectResponse(project);
}

export async function assignImagesToProject(userId: string, input: {
  recordIds?: unknown;
  projectId?: unknown;
  tags?: unknown;
}) {
  const recordIds = normalizeRecordIds(input.recordIds);
  const projectId = typeof input.projectId === "string" && input.projectId.trim() ? input.projectId.trim() : null;
  const tags = normalizeTags(input.tags);

  if (projectId) {
    const project = await prisma.imageProject.findFirst({
      where: {
        id: projectId,
        userId
      }
    });

    if (!project) {
      throw new AppError("Project not found.", 404);
    }
  }

  const data: { projectId?: string | null; tags?: string } = {
    projectId
  };

  if (tags) {
    data.tags = JSON.stringify(tags);
  }

  const updated = await prisma.imageRecord.updateMany({
    where: {
      userId,
      id: { in: recordIds },
      deletedAt: null
    },
    data
  });

  return {
    ok: true,
    updatedCount: updated.count
  };
}
