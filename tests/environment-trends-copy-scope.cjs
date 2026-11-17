/* eslint-disable @typescript-eslint/no-require-imports */
const cp=require('node:child_process'),assert=require('node:assert/strict');
const base='c2d29dc99e986bdf215f2cac94c6b465390910fb',file='src/components/environment/EnvironmentTrends.tsx';
const read=require('./theme-source.cjs').readBeforeTheme;
function original(){return cp.execFileSync('git',['show',base+':'+file],{encoding:'utf8'}).replaceAll('\r\n','\n');}
function withoutSupplementaryCopy(source){
  return source.replace('import { formatJstDateTime } from "@/lib/utils";\n','')
    .replace('    <p className="text-xs leading-relaxed text-muted">各日付を含む直近7日間を日本時間で集計します。環境開始前は含まず、当日は集計対象時刻までです。観測がない箇所は線をつなぎません。勝率は両プレイヤーの視点で集計し、ミラー対戦は2件として数えます。</p>\n','')
    .replace('    {metric === "winrate" && <p className="text-xs text-muted">対象登録戦績10件未満は「サンプル不足」、30件未満は「参考」です。日付ごとの詳細で件数を確認できます。</p>}\n','')
    .replace('<><p className="text-xs text-muted">集計対象：{formatJstDateTime(current.data.dataThrough)}まで（JST・終了時刻を含まない）</p><EnvironmentTrendChart key={requestKey} data={current.data} metric={metric} catalog={catalog} /></>','<EnvironmentTrendChart key={requestKey} data={current.data} metric={metric} catalog={catalog} />');
}
// Older scope tests retain their original expectations after checking exact deletions.
// All runtime/browser tests execute the actual current component.
function readBeforeTrendCopy(f){if(f!==file)return read(f);const old=original();assert.equal(read(f),withoutSupplementaryCopy(old),'only the three supplementary paragraphs and unused import may change');return old;}
module.exports={base,file,original,withoutSupplementaryCopy,readBeforeTrendCopy};
