import type { RefObject } from "react";
import type { PromptTemplateResponse } from "@/lib/types";
import {
  BATCH_PROMPT_END,
  BATCH_PROMPT_START
} from "@/components/studio/utils/batch-prompts";
import { useStudioState } from "@/components/studio/state/studio-context";
import type { Locale } from "@/components/studio/utils/copy";
import { fetchJson } from "@/components/studio/utils/api-client";

type UseTemplateActionsOptions = {
  locale: Locale;
  promptRef: RefObject<HTMLTextAreaElement | null>;
  t: (key: string) => string;
  handleUnauthorized: (errorOrResponse: unknown) => boolean;
  loadTemplates: () => Promise<void>;
};

export function useTemplateActions({
  locale,
  promptRef,
  t,
  handleUnauthorized,
  loadTemplates
}: UseTemplateActionsOptions) {
  const { state, actions } = useStudioState();
  const {
    prompt,
    generationInputMode,
    batchPromptText,
    templateTitle,
    templateCategory,
    templateMode,
    deletingTemplateId
  } = state;
  const {
    setPrompt,
    setBatchPromptText,
    setError,
    setTemplateTitle,
    setTemplateCategory,
    setTemplateOpen,
    setDeletingTemplateId
  } = actions;

  function applyPromptTemplate(template: PromptTemplateResponse) {
    if (generationInputMode === "batch") {
      const block = `${BATCH_PROMPT_START}\n${template.content}\n${BATCH_PROMPT_END}`;
      setBatchPromptText((current) => current.trim() ? `${current.trimEnd()}\n\n${block}` : block);
    } else {
      setPrompt((current) => current.trim() ? `${current.trimEnd()}\n${template.content}` : template.content);
    }
    setTemplateOpen(false);
    requestAnimationFrame(() => promptRef.current?.focus());
  }

  async function saveCurrentPromptAsTemplate() {
    const content = generationInputMode === "batch" ? batchPromptText.trim() : prompt.trim();
    if (!content) {
      setError(t("enterPrompt"));
      return;
    }

    const title = templateTitle.trim() || content.split(/\s+/).slice(0, 8).join(" ").slice(0, 60) || "Prompt template";
    const fallbackMessage = locale === "zh" ? "模板保存失败。" : "Template could not be saved.";
    let body: Partial<PromptTemplateResponse>;

    try {
      body = await fetchJson<Partial<PromptTemplateResponse>>("/api/images/templates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title,
          category: templateCategory.trim() || "Default",
          mode: templateMode,
          content
        }),
        fallbackMessage
      });
    } catch (caught) {
      if (handleUnauthorized(caught)) return;
      setError(caught instanceof Error ? caught.message : fallbackMessage);
      return;
    }

    if (!body.id) {
      setError(fallbackMessage);
      return;
    }

    setTemplateTitle("");
    setTemplateCategory("");
    setTemplateOpen(true);
    await loadTemplates();
  }

  async function deletePromptTemplate(template: PromptTemplateResponse) {
    if (deletingTemplateId) return;

    const confirmed = window.confirm(`${locale === "zh" ? "\u5220\u9664\u6a21\u677f" : "Delete template"}: ${template.title}`);
    if (!confirmed) return;

    setDeletingTemplateId(template.id);
    setError("");

    try {
      const fallbackMessage = locale === "zh" ? "模板删除失败。" : "Template could not be deleted.";
      await fetchJson(`/api/images/templates/${template.id}`, {
        method: "DELETE",
        fallbackMessage
      });

      await loadTemplates();
    } catch (caught) {
      if (handleUnauthorized(caught)) return;
      setError(caught instanceof Error ? caught.message : (locale === "zh" ? "模板删除失败。" : "Template could not be deleted."));
    } finally {
      setDeletingTemplateId("");
    }
  }

  return {
    applyPromptTemplate,
    saveCurrentPromptAsTemplate,
    deletePromptTemplate
  };
}
