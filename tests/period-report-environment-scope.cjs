/* eslint-disable @typescript-eslint/no-require-imports */
const fs=require('node:fs'),cp=require('node:child_process');
const base='d40c02eed57371ff7520dcdc344daf3046ef861d';
const changed=new Set(['src/app/admin/weekly-report/page.tsx','src/lib/data.ts','src/lib/period-report-data.ts','src/lib/report-display-context.ts','src/lib/weekly-report.ts']);
const added=new Set(['src/lib/period-report-environment.ts','supabase/migrations/20261002111149_period_report_environment_filter.sql']);
// Supersede historical feature-scope assertions only for this feature's explicit
// files. The accompanying current-scope test protects everything else, including
// all old migrations and the evaluator's exact normalization.
function readBeforePeriodEnvironment(file){return changed.has(file)?cp.execFileSync('git',['show',base+':'+file],{encoding:'utf8'}).replaceAll('\r\n','\n'):fs.readFileSync(file,'utf8').replaceAll('\r\n','\n');}
module.exports={base,changed,added,readBeforePeriodEnvironment};
