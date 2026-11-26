"use client";
import { useRef, useState } from "react";
import { jst, type Publication } from "@/lib/environment-review/publication";

type Edition = Pick<Publication, "run_id" | "as_of" | "published_at">;
export type MemberRelease = { edition: string; run_id: string; source_published_at: string; active: boolean };
export function MemberReleaseControls({ environment, name, trial, member }: {
  environment: string; name: string; trial: Edition | null; member: MemberRelease | null
}) {
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const same = member?.active && trial?.run_id === member.run_id && trial.published_at === member.source_published_at;
  async function submit(action: "member_publish" | "member_stop") {
    const target = action === "member_publish" ? trial : member?.active ? {run_id:member.run_id,published_at:member.source_published_at} : null;
    if (!target || lock.current) return;
    const label = action === "member_publish" ? "この確定版を会員に公開" : "この版の会員公開を停止";
    if (!window.confirm(name + "\n版ID " + target.run_id + "\n確定日時 " + target.published_at + "\n" + label + "しますか？")) return;
    lock.current = true;
    setBusy(true);
    try {
      const res = await fetch("/admin/environment-review/api",{method:"POST",cache:"no-store",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({action,environment,id:target.run_id,sourceAt:target.published_at,edition:member?.edition ?? null,confirmed:true})});
      if (!res.ok) throw new Error((await res.json()).error || "操作に失敗しました。");
      window.location.reload();
    } catch (e) {
      setError((e instanceof Error ? e.message : "応答を確認できませんでした。") + " 最新の状態を読み込み、環境と版を確認してください。");
    }
  }
  return <section className="grid min-w-0 gap-2 rounded-md border bg-white p-4 text-sm">
    <h2 className="text-lg font-bold">会員への公開</h2>
    <p>{name} ／ {member?.active ? "会員公開中" : "会員未公開"}</p>
    {member?.active && <p className="break-all">会員版　{member.run_id} ／ 確定 {jst(member.source_published_at)} JST</p>}
    {trial && <p className="break-all">確認対象　{trial.run_id} ／ 集計 {jst(trial.as_of)} JST ／ 確定 {jst(trial.published_at)} JST</p>}
    <div className="flex flex-wrap gap-2">
      {trial && <button type="button" disabled={busy || !!same} className="min-h-11 rounded-md border px-3 font-bold disabled:opacity-50" onClick={()=>submit("member_publish")}>{same ? "この版は会員公開済み" : "この確定版を会員に公開"}</button>}
      {member?.active && <button type="button" disabled={busy} className="min-h-11 rounded-md border px-3" onClick={()=>submit("member_stop")}>会員公開を停止</button>}
    </div>
    {error && <div role="alert">{error} <button className="underline" onClick={()=>window.location.reload()}>再読み込み</button></div>}
  </section>;
}
