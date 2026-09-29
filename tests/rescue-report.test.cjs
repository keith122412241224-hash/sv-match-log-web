/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict');
const {buildWeeklyPeriod,buildWeeklyReport}=require('../src/lib/weekly-report');
const {reportDisplayContext,reportMarkdown}=require('../src/lib/report-display-context');
test('D context uses exact report dates, timezone, current/previous counts and selected rank without changing aggregate JSON',()=>{
 const report=buildWeeklyReport([],[],[],buildWeeklyPeriod('2026-09-01','2026-09-07')).aiJson;const before=JSON.stringify(report);
 const context=reportDisplayContext(report,'マスター以上');
 for(const value of ['2026-09-01','2026-09-07','Asia/Tokyo','全ユーザー','マスター以上','登録試合数0件','前期間0件'])assert.ok(context.includes(value),value);
 assert.equal(reportMarkdown('',context),'');assert.equal(reportMarkdown('# 本文',context),context+'\n\n# 本文');assert.equal(JSON.stringify(report),before);
 assert.match(reportDisplayContext(report),/すべて（未登録含む）/);
});
