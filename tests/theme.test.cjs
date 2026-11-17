/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test'), assert = require('node:assert/strict'), vm = require('node:vm');
const { THEME_BOOTSTRAP, resolvedTheme, themePreference } = require('../src/lib/theme');
test('first paint defaults to light, restores saved modes, isolates OBS and tolerates blocked storage', () => {
  for (const stored of [null, 'light', 'dark', 'system', 'invalid']) for (const dark of [false,true]) for(const pathname of ['/', '/guest', '/admin/creator/tier', '/admin/obs/tier/test', '/admin/obs']) {
    const root = { dataset:{} };
    vm.runInNewContext(THEME_BOOTSTRAP, { document:{documentElement:root}, localStorage:{getItem:()=>stored}, matchMedia:()=>({matches:dark}), location:{pathname} });
    assert.equal(root.dataset.theme, resolvedTheme(themePreference(stored),dark,pathname));
    assert.equal(root.dataset.themePreference, themePreference(stored));
  }
  const root = {dataset:{}};
  vm.runInNewContext(THEME_BOOTSTRAP, {document:{documentElement:root},localStorage:{getItem(){throw Error('blocked')}},matchMedia:()=>({matches:true}),location:{pathname:'/guest'}});
  assert.equal(root.dataset.theme,'light');
});
test('explicit modes ignore OS changes; system follows them without changing the preference', () => {
  assert.equal(resolvedTheme('light',true,'/'),'light');
  assert.equal(resolvedTheme('dark',false,'/'),'dark');
  assert.equal(resolvedTheme('system',true,'/'),'dark');
  assert.equal(resolvedTheme('system',false,'/'),'light');
});
