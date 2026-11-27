// Standalone assertion scripts report completion on stdout. Node emits a file-level
// pass for these (also for an empty script), but no per-file test:summary.
const standalone = new Map([
  ['environment-dashboard-v4-admin', /PASS: all migrations; actual admin action/],
  ['environment-dashboard-v4', /"status"\s*:\s*"passed"/],
  ['environment-review-snapshot', /PASS: snapshot RPC with full schema/],
  ['environment-trends', /PASS: unchanged old functions\/ACL\/RLS/],
  ['environment-dashboard', /"passed"\s*:\s*true/],
  ['environment-dashboard-v3', /all function definitions and ACLs unchanged after rollback of fixed test clock/],
  ['multi-rank', /"passed"\s*:\s*true/],
].map(([name, marker]) => ['tests/' + name + '.integration.cjs', marker]));

function summary(file, success, counts) {
  return 'E03 ' + JSON.stringify({ file, success, counts }) + '\n';
}

module.exports = async function* report(events) {
  const path = await import('node:path');
  const completed = new Set();
  const tails = new Map();
  for await (const { type, data } of events) {
    const file = data.file ? path.relative(process.cwd(), data.file) : null;
    if (type === 'test:summary') {
      yield summary(file, data.success, data.counts);
    } else if (type === 'test:stdout' && standalone.has(file)) {
      const chunk = (tails.get(file) || '') + data.message;
      if (standalone.get(file).test(chunk)) completed.add(file);
      tails.set(file, chunk.slice(-128));
    } else if (type === 'test:pass' && file === data.name && completed.has(file)
               && data.nesting === 0 && !data.skip && !data.todo) {
      yield summary(file, true, { tests: 1, passed: 1, failed: 0, skipped: 0, cancelled: 0, todo: 0 });
    } else if (type === 'test:fail' && /ENOSPC|no space left on device/i.test(String(data.details?.error))) {
      yield 'E03_ENOSPC\n';
    }
  }
};
