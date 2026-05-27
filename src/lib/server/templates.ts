import type { PromptTemplateResponse } from "../types";
import { AppError } from "./errors";
import { prisma } from "./db";

const MAX_TEMPLATE_TITLE = 80;
const MAX_TEMPLATE_CATEGORY = 40;
const MAX_TEMPLATE_CONTENT = 4000;
const MAX_TEMPLATE_DESCRIPTION = 300;
const MAX_TEMPLATE_TAGS = 12;
const MAX_TEMPLATE_TAG_LENGTH = 32;

function normalizeMode(value: unknown) {
  if (value === "text-to-image" || value === "image-to-image" || value === "universal") return value;
  return "universal";
}

function toTemplateResponse(template: {
  id: string;
  projectId?: string | null;
  title: string;
  description?: string | null;
  category: string;
  mode: string;
  content: string;
  tags?: string | null;
  defaultsJson?: string | null;
  archivedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): PromptTemplateResponse {
  return {
    id: template.id,
    projectId: template.projectId ?? undefined,
    title: template.title,
    description: template.description ?? undefined,
    category: template.category,
    mode: template.mode as PromptTemplateResponse["mode"],
    content: template.content,
    tags: parseStringList(template.tags),
    defaults: parseDefaults(template.defaultsJson),
    archivedAt: template.archivedAt?.toISOString(),
    createdAt: template.createdAt.toISOString(),
    updatedAt: template.updatedAt.toISOString()
  };
}

function parseStringList(value: string | null | undefined) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function parseDefaults(value: string | null | undefined) {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : undefined;
  } catch {
    return undefined;
  }
}

function normalizeTags(value: unknown) {
  if (!Array.isArray(value)) return [];

  return Array.from(new Set(value
    .map((item) => typeof item === "string" ? item.trim() : "")
    .filter(Boolean)
    .map((item) => item.slice(0, MAX_TEMPLATE_TAG_LENGTH))))
    .slice(0, MAX_TEMPLATE_TAGS);
}

function normalizeDefaults(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;

  return JSON.stringify(value).slice(0, 4000);
}

function normalizeTemplateInput(input: {
  title?: unknown;
  description?: unknown;
  category?: unknown;
  mode?: unknown;
  content?: unknown;
  tags?: unknown;
  defaults?: unknown;
  projectId?: unknown;
}) {
  const title = typeof input.title === "string" ? input.title.trim().slice(0, MAX_TEMPLATE_TITLE) : "";
  const category = typeof input.category === "string" && input.category.trim()
    ? input.category.trim().slice(0, MAX_TEMPLATE_CATEGORY)
    : "Default";
  const content = typeof input.content === "string" ? input.content.trim() : "";
  const description = typeof input.description === "string"
    ? input.description.trim().slice(0, MAX_TEMPLATE_DESCRIPTION)
    : undefined;
  const projectId = typeof input.projectId === "string" && input.projectId.trim() ? input.projectId.trim() : null;

  if (!title) {
    throw new AppError("Enter a template title.");
  }

  if (!content) {
    throw new AppError("Enter template content.");
  }

  if (content.length > MAX_TEMPLATE_CONTENT) {
    throw new AppError(`Template content must be ${MAX_TEMPLATE_CONTENT} characters or fewer.`);
  }

  return {
    projectId,
    title,
    description,
    category,
    mode: normalizeMode(input.mode),
    content,
    tags: JSON.stringify(normalizeTags(input.tags)),
    defaultsJson: normalizeDefaults(input.defaults)
  };
}

export async function readPromptTemplatesForUser(userId: string) {
  const templates = await prisma.promptTemplate.findMany({
    where: {
      userId,
      deletedAt: null,
      archivedAt: null
    },
    orderBy: [
      { updatedAt: "desc" },
      { createdAt: "desc" }
    ]
  });

  return {
    templates: templates.map(toTemplateResponse)
  };
}

export async function createPromptTemplateForUser(userId: string, input: {
  title?: unknown;
  description?: unknown;
  category?: unknown;
  mode?: unknown;
  content?: unknown;
  tags?: unknown;
  defaults?: unknown;
  projectId?: unknown;
}) {
  const data = normalizeTemplateInput(input);
  if (data.projectId) {
    const project = await prisma.imageProject.findFirst({
      where: {
        id: data.projectId,
        userId,
        archivedAt: null
      }
    });

    if (!project) {
      throw new AppError("Project not found.", 404);
    }
  }

  const template = await prisma.promptTemplate.create({
    data: {
      userId,
      ...data
    }
  });

  return toTemplateResponse(template);
}

export async function updatePromptTemplateForUser(userId: string, templateId: string, input: {
  title?: unknown;
  description?: unknown;
  category?: unknown;
  mode?: unknown;
  content?: unknown;
  tags?: unknown;
  defaults?: unknown;
  projectId?: unknown;
  archived?: unknown;
}) {
  const existing = await prisma.promptTemplate.findFirst({
    where: {
      id: templateId,
      userId,
      deletedAt: null
    }
  });

  if (!existing) {
    throw new AppError("Template not found.", 404);
  }

  const data = normalizeTemplateInput({
    title: input.title ?? existing.title,
    description: input.description ?? existing.description,
    category: input.category ?? existing.category,
    mode: input.mode ?? existing.mode,
    content: input.content ?? existing.content,
    tags: input.tags ?? parseStringList(existing.tags),
    defaults: input.defaults ?? parseDefaults(existing.defaultsJson),
    projectId: input.projectId ?? existing.projectId
  });

  if (data.projectId) {
    const project = await prisma.imageProject.findFirst({
      where: {
        id: data.projectId,
        userId,
        archivedAt: null
      }
    });

    if (!project) {
      throw new AppError("Project not found.", 404);
    }
  }

  const template = await prisma.promptTemplate.update({
    where: { id: templateId },
    data: {
      ...data,
      ...(typeof input.archived === "boolean" ? { archivedAt: input.archived ? new Date() : null } : {})
    }
  });

  return toTemplateResponse(template);
}

export async function deletePromptTemplateForUser(userId: string, templateId: string) {
  const deleted = await prisma.promptTemplate.updateMany({
    where: {
      id: templateId,
      userId,
      deletedAt: null
    },
    data: {
      deletedAt: new Date()
    }
  });

  if (deleted.count === 0) {
    throw new AppError("Template not found.", 404);
  }

  return {
    ok: true
  };
}
