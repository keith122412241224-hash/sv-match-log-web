/* eslint-disable @typescript-eslint/no-require-imports */
// Test-process preload only. Date.now/timers retain their real clocks.
const fs = require('node:fs');
const NativeDate = Date;
global.Date = class extends NativeDate {
  constructor(...args) {
    super(...(args.length ? args : [fs.readFileSync(process.env.MATRIX_CLOCK_FILE, 'utf8').trim()]));
  }
};
