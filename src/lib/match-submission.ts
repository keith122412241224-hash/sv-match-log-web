import { MATCH_REQUEST_ID } from "@/lib/match-request";

const fields = ["environment_id", "my_deck_id", "my_archetype_id", "opponent_deck_id", "opponent_archetype_id", "turn_order", "result", "rank_tier", "master_group", "grandmaster_rating"] as const;
export const MATCH_SUBMISSION_EVENT = "svml:match-submission";
export type PendingMatchSubmission = { id: string; fields: Record<string, string>; nextAction: "home" | "continue" };
const key = (userId: string) => `svml:pending-match:${userId}`;
const busy = new Set<string>();
export const isMatchSubmitting = (userId: string) => busy.has(userId);
const announce = () => window.dispatchEvent(new Event(MATCH_SUBMISSION_EVENT));

// sessionStorage survives reload/history in this tab and is separated by user.
// A duplicated tab retains the same pending operation; independent new tabs get
// independent UUIDs. Never silently replace an unreadable/unwritable pending ID.
export function readMatchSubmission(userId: string): PendingMatchSubmission | null {
  const raw = sessionStorage.getItem(key(userId));
  if (!raw) return null;
  const value = JSON.parse(raw) as PendingMatchSubmission;
  if (!value || !MATCH_REQUEST_ID.test(value.id) || !value.fields
    || !fields.every(field => typeof value.fields[field] === "string")
    || !["home", "continue"].includes(value.nextAction)) throw Error("保存確認用の入力情報を読み取れません。別の登録を始める前に戦績を確認してください。");
  return value;
}

export function submissionForm(pending: PendingMatchSubmission) {
  const form = new FormData();
  for (const field of fields) form.set(field, pending.fields[field]);
  form.set("request_id", pending.id);
  form.set("next_action", pending.nextAction);
  return form;
}

export async function submitMatchSubmission<T extends { ok: boolean }>(userId: string | undefined, form: FormData, save: (form: FormData) => Promise<T>): Promise<T> {
  if (!userId) throw Error("ログインし直してください。");
  if (busy.has(userId)) throw Error("保存状態を確認中です。しばらくお待ちください。");
  const values = Object.fromEntries(fields.map(field => [field, String(form.get(field) ?? "")]));
  let pending = readMatchSubmission(userId);
  if (pending && fields.some(field => pending?.fields[field] !== values[field])) {
    throw Error("未確認の保存があります。先に「保存状態を確認して再試行」を押してください。元の入力内容は保持しています。");
  }
  if (!pending) {
    pending = { id: crypto.randomUUID(), fields: values, nextAction: form.get("next_action") === "home" ? "home" : "continue" };
    const raw = JSON.stringify(pending);
    try {
      sessionStorage.setItem(key(userId), raw);
      if (sessionStorage.getItem(key(userId)) !== raw) throw Error();
    } catch { throw Error("再試行用の入力情報を端末に保存できません。ブラウザのストレージ設定を確認してください。戦績は送信していません。"); }
  }
  busy.add(userId);
  announce();
  try {
    const request = submissionForm(pending);
    request.set("next_action", String(form.get("next_action") ?? pending.nextAction));
    let response: T;
    try { response = await save(request); }
    catch { throw Error("保存状態を確認できませんでした。入力内容を保持しています。同じ登録を再試行してください。"); }
    if (response.ok) {
      // Clear only after a confirmed success. Failure/response loss keeps the
      // immutable payload and UUID together, including across reloads.
      if (readMatchSubmission(userId)?.id === pending.id) sessionStorage.removeItem(key(userId));
      if (readMatchSubmission(userId)?.id === pending.id) throw Error("保存済みですが端末の確認情報を更新できません。同じ登録の保存状態を再確認してください。");
    }
    return response;
  } finally {
    busy.delete(userId);
    announce();
  }
}
