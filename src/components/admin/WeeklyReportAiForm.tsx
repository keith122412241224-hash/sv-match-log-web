"use client";

import { Sparkles } from "lucide-react";
import { useActionState } from "react";
import { SubmitButton } from "@/components/SubmitButton";
import { CopyButton, MarkdownDownloadButton } from "@/components/admin/WeeklyReportClientTools";
import { generateWeeklyReportMarkdown } from "@/app/admin/weekly-report/actions";

type AiFormState = {
  ok: boolean;
  markdown: string;
  error: string | null;
};

const initialState: AiFormState = {
  ok: false,
  markdown: "",
  error: null
};

export function WeeklyReportAiForm({ prompt, startDate, hasApiKey }: { prompt: string; startDate: string; hasApiKey: boolean }) {
  const [state, formAction] = useActionState(generateWeeklyReportMarkdown, initialState);
  const markdown = state.markdown;

  return (
    <div className="grid gap-3">
      <form action={formAction} className="flex flex-wrap gap-2">
        <input type="hidden" name="prompt" value={prompt} />
        <SubmitButton disabled={!hasApiKey} pendingLabel="生成中..." type="submit">
          <Sparkles size={17} aria-hidden="true" />
          {markdown ? "再生成" : "AI本文生成"}
        </SubmitButton>
        {!hasApiKey ? (
          <span className="inline-flex min-h-10 items-center rounded-md bg-amber-50 px-3 text-sm font-semibold text-amber-900">
            OPENAI_API_KEY 未設定
          </span>
        ) : null}
      </form>
      {state.error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">
          {state.error}
        </p>
      ) : null}
      {markdown ? (
        <div className="grid gap-3">
          <div className="flex flex-wrap gap-2">
            <CopyButton text={markdown} label="本文コピー" />
            <MarkdownDownloadButton markdown={markdown} fileName={`weekly-report-${startDate}.md`} />
          </div>
          <textarea
            className="min-h-[420px] rounded-md border border-slate-300 bg-slate-50 p-3 font-mono text-sm leading-6 text-ink"
            readOnly
            value={markdown}
          />
        </div>
      ) : null}
    </div>
  );
}
