import { Suspense } from "react";
import { getInputEnabledEnvironments } from "@/lib/data";
import Link from "next/link";
import { ArrowRight, Hourglass } from "lucide-react";
import { formatEnvironmentPercent } from "@/lib/environment-dashboard";
import { getPublicEncounterSnapshot, type PublicEncounterSnapshot } from "@/lib/public-encounter-snapshot";
import { formatJstDateTime, getMostRecentlyCreatedId } from "@/lib/utils";
import styles from "./PublicEncounterCard.module.css";

export function PublicEncounterCard() {
  return <Suspense fallback={<EncounterCard />}><CurrentEncounterCard /></Suspense>;
}

async function CurrentEncounterCard() {
  const environments = await getInputEnabledEnvironments().catch(() => []);
  const id = getMostRecentlyCreatedId(environments);
  const environment = environments.find(item => item.id === id);
  const snapshot = environment ? await getPublicEncounterSnapshot(environment) : null;
  return <EncounterCard environment={environment} snapshot={snapshot} />;
}

function EncounterCard({ environment, snapshot }: { environment?: { name: string }; snapshot?: PublicEncounterSnapshot | null }) {
  return (
    <section aria-label="今の環境｜遭遇率 TOP3" className={styles.card}>
      <header className={styles.header}>
        <h2 className="relative z-10">
          <span className={styles.kicker}>今の環境</span>
          <span className="mt-2 block text-2xl font-black tracking-tight">遭遇率 <span className={styles.top}>TOP3</span></span>
        </h2>
        {environment && <p className="relative z-10 mt-2 text-sm leading-relaxed">{environment.name}</p>}
      </header>
      <div className="px-5 sm:px-6">
        {snapshot ? <>
          <ol className="divide-y divide-slate-200" aria-label="デッキ別の遭遇率">
            {snapshot.decks.map((deck, i) => (
              <li className={styles.row} key={i}>
                <span className={styles.rank}><span className="sr-only">順位 </span>{i + 1}</span>
                <span className="break-words font-bold">{deck.name}</span>
                <span className="text-lg font-bold tabular-nums">{formatEnvironmentPercent(deck.encounterRate)}</span>
              </li>
            ))}
          </ol>
          <dl className={styles.details}>
            <dt>集計期間</dt><dd>{snapshot.periodStart ? <time dateTime={snapshot.periodStart}>{formatJstDateTime(snapshot.periodStart)}</time> : "環境全期間"} ～ <time dateTime={snapshot.periodEnd}>{formatJstDateTime(snapshot.periodEnd)}</time>（JST）</dd>
            <dt>対戦数</dt><dd>{snapshot.totalMatches.toLocaleString("ja-JP")} 戦</dd>
            <dt>更新日時</dt><dd><time dateTime={snapshot.updatedAt}>{formatJstDateTime(snapshot.updatedAt)}</time>（JST）</dd>
          </dl>
        </> : <p className={styles.pending}>
          <Hourglass size={24} strokeWidth={1.5} aria-hidden="true" />
          新環境のデータを集計中
        </p>}
        <Link href="/login" className={styles.link}>
          <span>詳しい環境データを見る<span className="inline-block text-xs">（無料ログイン）</span></span>
          <ArrowRight size={17} aria-hidden="true" className="shrink-0" />
        </Link>
      </div>
    </section>
  );
}
