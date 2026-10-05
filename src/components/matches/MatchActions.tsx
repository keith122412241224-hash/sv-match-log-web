"use client";

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, useTransition, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import { deleteMatchInline, getMatchForEdit, updateMatchInline } from "@/app/actions";
import { Button } from "@/components/Button";
import { SaveToast, type SaveNotification } from "@/components/SaveToast";
import { QuickMatchForm, type GuestMatchDraft } from "@/components/matches/QuickMatchForm";
import { formatJstDateTime } from "@/lib/utils";
import type { MatchEditData, MatchMutationResult } from "@/lib/match-edit";

const ActionsContext = createContext<((id: string, guestData?: MatchEditData) => void) | null>(null);

export function MatchActionsProvider({ children, onGuestMutation }: {
  children: ReactNode;
  onGuestMutation?: (id: string, draft?: GuestMatchDraft) => MatchMutationResult;
}) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const busy = useRef(false);
  const id = useId();
  const [mode, setMode] = useState<"menu" | "edit" | "delete" | null>(null);
  const [data, setData] = useState<MatchEditData | null>(null);
  const [target, setTarget] = useState("");
  const [pending, setPending] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const [error, setError] = useState("");
  const [notification, setNotification] = useState<SaveNotification | null>(null);
  const dismiss = useCallback(() => setNotification(null), []);
  useEffect(() => {
    if (mode && dialog.current && !dialog.current.open) dialog.current.showModal();
  }, [mode]);
  function close() {
    if (busy.current) return;
    dialog.current?.close();
    setMode(null);
    trigger.current?.focus({ preventScroll: true });
  }
  function setBusy(value: boolean) { busy.current = value; setPending(value); }
  function success(deleted: boolean) {
    setBusy(false);
    close();
    setNotification({ id: Date.now(), kind: "success", message: deleted ? "戦績を削除しました" : "戦績を更新しました" });
    if (!onGuestMutation) startRefresh(() => router.refresh());
  }
  function open(matchId: string, guestData?: MatchEditData) {
    if (busy.current || refreshing) return;
    trigger.current = document.activeElement as HTMLElement | null;
    setTarget(matchId);
    setData(guestData ?? null);
    setError("");
    setMode("menu");
    dismiss();
  }
  async function choose(next: "edit" | "delete") {
    if (busy.current) return;
    setBusy(true);
    setError("");
    try {
      const response = data ? { data } : await getMatchForEdit(target);
      if (!response.data) { setError(response.message ?? "戦績を読み込めませんでした。"); return; }
      setData(response.data);
      setMode(next);
    } catch { setError("戦績を読み込めませんでした。再度お試しください。"); }
    finally { setBusy(false); }
  }
  async function save(form: FormData, draft: GuestMatchDraft) {
    const response = onGuestMutation ? onGuestMutation(target, draft) : await updateMatchInline(target, form);
    if (response.ok) success(false);
    return response;
  }
  async function remove() {
    if (busy.current) return;
    setBusy(true);
    setError("");
    try {
      const response = onGuestMutation ? onGuestMutation(target) : await deleteMatchInline(target);
      if (response.ok) success(true);
      else setError(response.message ?? "削除できませんでした。");
    } catch { setError("削除できませんでした。再度お試しください。"); }
    finally { setBusy(false); }
  }
  return <ActionsContext.Provider value={open}>
    {children}
    <SaveToast notification={notification} onDismiss={dismiss} />
    {mode && createPortal(<dialog ref={dialog} aria-labelledby={id + "-title"}
      onCancel={event => { event.preventDefault(); close(); }}
      className="fixed m-auto max-h-[90dvh] w-[calc(100%-1rem)] max-w-xl overflow-y-auto overscroll-contain rounded-lg border border-slate-200 bg-white p-3 shadow-xl backdrop:bg-slate-900/40 sm:p-5">
      <h2 id={id + "-title"} className="mb-3 text-lg font-bold">{mode === "edit" ? "戦績を編集" : mode === "delete" ? "この戦績を削除しますか？" : "戦績の操作"}</h2>
      {error ? <p role="alert" className="mb-3 break-words rounded bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
      {mode === "menu" ? <div className="grid gap-2">
        <Button type="button" disabled={pending} onClick={() => choose("edit")}>編集</Button>
        <Button type="button" variant="secondary" className="text-red-700" disabled={pending} onClick={() => choose("delete")}>削除</Button>
        <Button type="button" variant="secondary" disabled={pending} onClick={close}>閉じる</Button>
        {pending ? <p role="status" className="text-sm text-muted">戦績を読み込んでいます...</p> : null}
      </div> : null}
      {mode === "edit" && data ? <>
        <p className="mb-3 text-xs text-muted">対戦日時：{formatJstDateTime(data.match.played_at)}（変更されません）</p>
        <QuickMatchForm {...data} initialMatch={data.match} onEditSubmit={save} onCancel={close} onPendingChange={setBusy} />
      </> : null}
      {mode === "delete" && data ? <div className="grid gap-4">
        <p className="text-sm">{formatJstDateTime(data.match.played_at)} / {data.match.result === "win" ? "勝ち" : "負け"}<br />
          {data.decks.find(row => row.id === data.match.my_deck_id)?.name ?? "-"} vs {data.decks.find(row => row.id === data.match.opponent_deck_id)?.name ?? "-"}</p>
        <p className="text-sm text-red-700">この操作は元に戻せません。</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <Button type="button" variant="secondary" disabled={pending} onClick={close}>キャンセル</Button>
          <Button type="button" variant="danger" disabled={pending} onClick={remove}>{pending ? "削除中..." : "削除する"}</Button>
        </div>
      </div> : null}
    </dialog>, document.body)}
  </ActionsContext.Provider>;
}

export function MatchActions({ matchId, guestData }: { matchId: string; guestData?: MatchEditData }) {
  const open = useContext(ActionsContext);
  return <button type="button" aria-label="戦績の操作" aria-haspopup="dialog" onClick={() => open?.(matchId, guestData)}
    className="inline-flex size-11 shrink-0 items-center justify-center rounded-md text-muted hover:bg-slate-200 focus-visible:ring-2">
    <MoreHorizontal aria-hidden="true" size={20} />
  </button>;
}
