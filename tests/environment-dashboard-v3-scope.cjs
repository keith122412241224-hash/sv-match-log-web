/* eslint-disable @typescript-eslint/no-require-imports */
const cp=require('node:child_process');
const base='55b614008e691261d441588bb2303558c0d7657d';
const changed=new Set(['src/app/environment/page.tsx','src/components/environment/EnvironmentData.tsx','src/components/environment/EnvironmentFilters.tsx','src/lib/environment-dashboard-data.ts']);
const added=new Set(['src/lib/environment-dashboard-v3.ts','supabase/migrations/20261001080455_environment_dashboard_aggregates_v3.sql']);
// Historical scope assertions use the pre-v3 source only for this task's bounded changes.
// The current scope test separately freezes every other source/SQL/dependency against Production.
function readBeforeEnvironmentUX(file){return changed.has(file)?cp.execFileSync('git',['show',base+':'+file],{encoding:'utf8'}).replaceAll('\r\n','\n'):require('./period-report-environment-scope.cjs').readBeforePeriodEnvironment(file);}
module.exports={base,changed,added,readBeforeEnvironmentUX};
