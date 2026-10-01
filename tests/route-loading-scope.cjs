/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const cp = require('node:child_process');
const base = 'd71ae79855f170a3acc83680d9411b0054819bc3';
const removed = new Set(['src/app/loading.tsx', 'src/app/environment/loading.tsx']);
const replacements = [
  ['src/components/GlobalPendingIndicator.tsx',
    'absolute inset-x-0 bottom-4 flex justify-center px-4 sm:bottom-6',
    'absolute inset-x-0 bottom-[max(1rem,var(--save-toast-clearance,0px))] flex justify-center px-4 sm:bottom-[max(1.5rem,var(--save-toast-clearance,0px))]'],
  ['src/components/SaveToast.tsx', '      if (!toast || !notification) return;',
    '      if (!toast || !notification) {\n        document.documentElement.style.removeProperty("--save-toast-clearance");\n        return;\n      }'],
  ['src/components/SaveToast.tsx', '    }\n    position();',
    '      // Keep the navigation badge above this notification without moving the Toast.\n      document.documentElement.style.setProperty("--save-toast-clearance", `${innerHeight - toast.getBoundingClientRect().top + 8}px`);\n    }\n    position();'],
  ['src/components/SaveToast.tsx', '    return () => window.removeEventListener("resize", position);',
    '    return () => {\n      window.removeEventListener("resize", position);\n      document.documentElement.style.removeProperty("--save-toast-clearance");\n    };']
];
const originals = new Map();
function original(file) {
  if (!originals.has(file)) originals.set(file, cp.execFileSync('git', ['show', base+':'+file], { encoding: 'utf8' }).replaceAll('\r\n', '\n'));
  return originals.get(file);
}
// Historical guards still compare every byte against their own baseline.
// Reconstruct only these explicitly verified changes, rather than skipping files
// or allowing an ENOENT to replace an unrelated, known assertion failure.
function readBeforeRouteLoading(file) {
  if (removed.has(file)) {
    assert.equal(fs.existsSync(file), false, 'route fallback must be removed: '+file);
    return original(file);
  }
  let content = require('./environment-dashboard-v3-scope.cjs').readBeforeEnvironmentUX(file);
  const changes = replacements.filter(([target]) => target === file);
  for (const [, before, after] of [...changes].reverse()) {
    assert.equal(content.split(after).length, 2, 'exact position adjustment: '+file);
    content = content.replace(after, before);
  }
  if (changes.length) assert.equal(content, original(file), 'no other Indicator/Toast changes: '+file);
  return content;
}
module.exports = { base, removed, readBeforeRouteLoading };
