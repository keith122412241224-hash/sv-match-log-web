"use server";

import { getIsAdmin } from "@/lib/data";

type GenerateState = {
  ok: boolean;
  markdown: string;
  error: string | null;
};

export async function generateWeeklyReportMarkdown(_prevState: GenerateState, formData: FormData): Promise<GenerateState> {
  const isAdmin = await getIsAdmin();

  if (!isAdmin) {
    return {
      ok: false,
      markdown: "",
      error: "管理者のみ実行できます。"
    };
  }

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return {
      ok: false,
      markdown: "",
      error: "OPENAI_API_KEY が未設定です。AI用プロンプトをコピーして手動生成してください。"
    };
  }

  const prompt = String(formData.get("prompt") ?? "");

  if (!prompt.trim()) {
    return {
      ok: false,
      markdown: "",
      error: "生成用プロンプトが空です。"
    };
  }

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.OPENAI_WEEKLY_REPORT_MODEL ?? "gpt-4.1-mini",
        input: prompt,
        temperature: 0.4
      })
    });

    if (!response.ok) {
      return {
        ok: false,
        markdown: "",
        error: `OpenAI APIエラー: ${response.status}`
      };
    }

    const payload = (await response.json()) as OpenAiResponsesPayload;
    const markdown = extractResponseText(payload).trim();

    if (!markdown) {
      return {
        ok: false,
        markdown: "",
        error: "OpenAI APIから本文を取得できませんでした。"
      };
    }

    return {
      ok: true,
      markdown,
      error: null
    };
  } catch (error) {
    return {
      ok: false,
      markdown: "",
      error: error instanceof Error ? error.message : "OpenAI API呼び出しに失敗しました。"
    };
  }
}

type OpenAiResponsesPayload = {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
};

function extractResponseText(payload: OpenAiResponsesPayload) {
  if (payload.output_text) {
    return payload.output_text;
  }

  return (
    payload.output
      ?.flatMap((item) => item.content ?? [])
      .filter((content) => content.type === "output_text" || typeof content.text === "string")
      .map((content) => content.text ?? "")
      .join("\n") ?? ""
  );
}
