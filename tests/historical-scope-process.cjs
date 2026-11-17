/* eslint-disable @typescript-eslint/no-require-imports */
// Explicit opt-in for historical scope tests. Never installed as a global mock.
const cp = require('node:child_process'), theme = require('./theme-source.cjs');
module.exports = { ...cp, execFileSync(command, args, options) {
  const result = cp.execFileSync(command, args, options);
  if (command !== 'git') return result;
  const inventory = args[0] === 'ls-files';
  const changed = args[0] === 'diff' && args.includes('--name-only');
  if (!inventory && !changed) return result;
  const ref = changed ? args.slice(1, args.indexOf('--') < 0 ? args.length : args.indexOf('--')).find(arg => !arg.startsWith('-')) : undefined;
  const files = result.toString().trim().split('\n').filter(Boolean);
  const filtered = theme.historicalFiles(files, ref);
  const output = filtered.length ? filtered.join('\n') + '\n' : '';
  return typeof result === 'string' ? output : Buffer.from(output);
} };
