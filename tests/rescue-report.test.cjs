/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict');
const {buildWeeklyPeriod,buildWeeklyReport}=require('../src/lib/weekly-report');
const {reportDisplayContext,reportMarkdown}=require('../src/lib/report-display-context');
test('compact context uses current/previous dates and selected rank without changing aggregate JSON',()=>{
 const report=buildWeeklyReport([],[],[],buildWeeklyPeriod('2026-09-01','2026-09-07')).aiJson;const before=JSON.stringify(report);
 const context=reportDisplayContext(report,'マスター以上');
 assert.equal(context,'対象期間：2026/9/1〜9/7 ｜ 前期間：8/25〜8/31 ｜ 環境：すべて ｜ ランク：マスター以上');
 assert.equal(reportMarkdown('',context),'');assert.equal(reportMarkdown('# 本文',context),context+'\n\n# 本文');assert.equal(JSON.stringify(report),before);
 assert.match(reportDisplayContext(report),/ランク：すべて$/);
});
test('compact dates keep years unambiguous across year boundaries',()=>{
 const report=buildWeeklyReport([],[],[],buildWeeklyPeriod('2025-12-31','2026-01-02')).aiJson;
 assert.match(reportDisplayContext(report),/対象期間：2025\/12\/31〜2026\/1\/2 ｜ 前期間：12\/28〜12\/30/);
 const january=buildWeeklyReport([],[],[],buildWeeklyPeriod('2026-01-01','2026-01-07')).aiJson;
 assert.match(reportDisplayContext(january),/前期間：2025\/12\/25〜12\/31/);
});
