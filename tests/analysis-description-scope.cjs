/* eslint-disable @typescript-eslint/no-require-imports */
const fs=require('node:fs'),cp=require('node:child_process'),assert=require('node:assert/strict');
const base='43fde5352d2a3d91ac35c01be6322e0eb6bec2a7';
const removed={
 'src/components/analysis/DeckAnalysisCards.tsx':'                  <p className="mb-2 text-xs text-muted">現在の分析条件に一致する結果を最新順で表示します。{showStreak && !combined ? "連勝・連敗もこの対象範囲内の成績です。" : "連勝・連敗は自分のみ／使用者側のみで表示します。"}</p>\n',
 'src/components/analysis/ExportableAnalysisBlock.tsx':'        <p data-png-exclude className="px-4 py-3 text-sm text-muted">使用デッキと相手デッキの組み合わせ別に勝率を確認できます。閉じた状態でもPNGに全データを出力できます。</p>\n'
};
const read=file=>fs.readFileSync(file,'utf8').replaceAll('\r\n','\n');
// Historical guards retain their full byte checks. Accept only these two exact
// paragraph deletions, never a broad file exclusion or a changed calculation.
function readBeforeDescriptions(file){
 const source=read(file);if(!Object.hasOwn(removed,file))return source;
 const before=cp.execFileSync('git',['show',base+':'+file],{encoding:'utf8'}).replaceAll('\r\n','\n');
 assert.equal(before.split(removed[file]).length,2,'exactly one original paragraph');
 assert.equal(source,before.replace(removed[file],''),'only the requested paragraph may change: '+file);
 return before;
}
module.exports={base,removed,readBeforeDescriptions};
