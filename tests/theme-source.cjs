/* eslint-disable @typescript-eslint/no-require-imports */
// Exact, reviewable theme delta. Only historical source guards use this projection;
// runtime imports, browser tests and the current-scope test always use live files.
const fs = require('node:fs'), cp = require('node:child_process'), assert = require('node:assert/strict');
const environmentReview = require('./environment-review-scope.cjs');
const base = '3d9d12dca854ddd77051362f0ad6472ba8fb7dd4';
const normalize = text => text.replaceAll('\r\n', '\n');
function readPatch(name) {
  const patch = normalize(fs.readFileSync(__dirname + '/fixtures/' + name, 'utf8'));
  return new Map(patch.split('diff --git ').slice(1).map(section => {
    const file = section.match(/^a\/(.*?) b\//)[1];
    return [file, { added: section.includes('\n--- /dev/null\n'), section }];
  }));
}
const changes = readPatch('theme-source.patch');
const added = new Set([...changes].filter(([, change]) => change.added).map(([file]) => file));
const gitSource = (ref, file) => normalize(cp.execFileSync('git', ['show', ref + ':' + file], { encoding: 'utf8', maxBuffer: 16e6, windowsHide: true }));

// The landing card was introduced by 724d4d9 and its public data path was
// updated by 2c5f621. Verify both boundaries before projecting historical source.
const landingPage = 'src/app/page.tsx';
const beforePublicEncounter = '105dfae6cb3bf5b537c2031d071281478b3cde32';
const publicEncounterLanding = '724d4d9112964e9d23a681ad800c861fc508a205';
const publicEncounterRefresh = '2c5f62151bd68e658660255b46fd2dff996e38c3';
const publicEncounterAdded = new Set([
  'src/components/environment/PublicEncounterCard.module.css',
  'src/components/environment/PublicEncounterCard.tsx',
  'src/lib/public-encounter-snapshot.ts',
  'supabase/migrations/20261126105932_public_encounter_top3.sql'
]);
const publicEncounterSources = new Map();
function assertPublicEncounterSource(file, source = fs.readFileSync(file, 'utf8')) {
  assert.ok(file === landingPage || publicEncounterAdded.has(file), 'not a reviewed public encounter file: ' + file);
  if (!publicEncounterSources.has(file)) {
    const revision = file === landingPage ? publicEncounterLanding : publicEncounterRefresh;
    const expected = file.endsWith('.sql')
      ? cp.execFileSync('git', ['show', revision + ':' + file], {encoding:'utf8', windowsHide:true})
      : gitSource(revision, file);
    publicEncounterSources.set(file, expected);
  }
  assert.equal(file.endsWith('.sql') ? source : normalize(source), publicEncounterSources.get(file),
    'unreviewed public encounter change: ' + file);
}

// No fuzzy patching: every removed/context line and hunk count must match.
function applyExact(before, section) {
  const input = before ? before.split('\n').slice(0, -1) : [], output = [];
  assert.ok(!before || before.endsWith('\n'));
  let cursor = 0;
  const hunks = section.split(/(?=^@@ )/m).slice(1);
  assert.ok(hunks.length);
  for (const hunk of hunks) {
    const lines = hunk.split('\n'), header = lines.shift().match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
    assert.ok(header);
    const oldCount = Number(header[2] ?? 1), newCount = Number(header[4] ?? 1);
    const start = Number(header[1]) - (oldCount ? 1 : 0);
    assert.ok(start >= cursor && start <= input.length);
    output.push(...input.slice(cursor, start)); cursor = start;
    assert.equal(output.length, Number(header[3]) - (newCount ? 1 : 0));
    let removed = 0, inserted = 0;
    for (const line of lines) {
      if (!line) continue;
      assert.ok([' ', '-', '+'].includes(line[0]), 'unsupported patch line');
      if (line[0] !== '+') { assert.equal(input[cursor++], line.slice(1), 'patch context'); removed++; }
      if (line[0] !== '-') { output.push(line.slice(1)); inserted++; }
    }
    assert.equal(removed, oldCount); assert.equal(inserted, newCount);
  }
  output.push(...input.slice(cursor));
  return output.join('\n') + '\n';
}
// Historical guards still check all source bytes after validating the exact signup delta.
const signupBase = '7acfb8c8178f7f1095f977c33ada3c6b76032fcf';
const signupChanges = readPatch('landing-signup.patch');
const signupSources = new Map();
const authScreenBase = '2002869e537f5d059a823f40641bfbf9a844d72e';
const authScreenChanges = readPatch('auth-screen-modes.patch');
const authScreenSources = new Map();
const googleLoginChanges = readPatch('local-google-login.patch');
const googleLoginSources = new Map();
const signupNoticeChanges = readPatch('signup-email-notice.patch');
const signupNoticeSources = new Map();
const pkceConfirmChanges = readPatch('pkce-confirm-middleware.patch');
const pkceConfirmSources = new Map();
// Pin the reviewed Git blob IDs so historical guards can compare pre-policy source.
const legalBase = '92e7e6e375bc866c2883b48aeaee44670ee6d2d6';
const legalBlobs = {
  'src/components/guest/GuestApp.tsx': '64890000dd6de32ae3a5156ae04bfd8d571e59c9',
  'src/app/guide/page.tsx': 'dcbffafc4b0c06b9f9a62355ed70cbe33d722ff5',
  'src/app/auth/reset-password/page.tsx': 'b2b47e1d01cdaafd7014f2fc5ed00ba32f9ce660',
  'src/app/layout.tsx': 'c4a6166fc0903c92223a95c39b526609a9e1ccb3',
  'src/app/login/page.tsx': 'b66bc57673267876e91091f5a12d364bf89f0711',
  'src/app/page.tsx': '221d36316c9249db8d2fed0e232fc90b758c7103',
  'src/app/privacy/page.tsx': '4195fc703dd1e27a8dc13188e62b4807b56cc4d7',
  'src/app/sitemap.ts': 'e35de64c1e26e9031ffd3e0588e512147122d4e4',
  'src/components/AppShell.tsx': 'c40ae06bd430307201035119d68047f2670a4fa0',
  'src/app/terms/page.tsx': 'caffb709cd700d598d567644521b11624827dff8',
  'src/components/LegalDocument.tsx': '83c470ef344f87808b9def1d0f9075fa013fb3b5',
  'src/components/LegalLinks.tsx': '1ff025527c33231de066cf6456fbd16461ca7791',
  'src/components/SiteAnalytics.tsx': '90e3c4f791cf8c602f1f9113a03299be83b96919'
};
const legalSources = new Map();
function beforeLegal(file, source) {
  if (!Object.hasOwn(legalBlobs, file)) return source;
  const bytes = Buffer.from(normalize(source));
  const id = require('node:crypto').createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex');
  assert.equal(id, legalBlobs[file], 'unreviewed legal or analytics change: ' + file);
  if (!legalSources.has(file)) legalSources.set(file, existsAt(legalBase, file) ? gitSource(legalBase, file) : '');
  return legalSources.get(file);
}
function readBeforeGoogleLogin(file, source) {
  source = beforeLegal(file, source);
  source = readBeforePatch(file, source, '1b93054c4c0c09b63c3393fdb6df024ef3fa8f98', pkceConfirmChanges, pkceConfirmSources);
  source = readBeforePatch(file, source, '00a91b06fc7561a6e4b74975a94a031b1a6d2ed2', signupNoticeChanges, signupNoticeSources);
  return readBeforePatch(file, source, '7a14e7e73a1374765bccd8a04af86a3cd15a60b2', googleLoginChanges, googleLoginSources);
}
function readBeforePatch(file, source, base, patch, sources) {
  const change = patch.get(file);
  if (!change) return source;
  if (!sources.has(file)) {
    const before = gitSource(base, file);
    sources.set(file, { before, after: applyExact(before, change.section) });
  }
  const { before, after } = sources.get(file);
  assert.equal(normalize(source), after, 'unreviewed theme change: ' + file);
  return before;
}
const expected = new Map();
const inventories = new Map();
function existsAt(ref, file) {
  if (!inventories.has(ref)) inventories.set(ref, new Set(cp.execFileSync('git', ['ls-tree', '-r', '--name-only', ref], { encoding: 'utf8', maxBuffer: 16e6, windowsHide: true }).trim().split('\n')));
  return inventories.get(ref).has(file);
}
function reviewed(file) {
  assert.ok(changes.has(file), 'not a reviewed theme file: ' + file);
  if (!expected.has(file)) {
    const before = added.has(file) ? '' : gitSource(base, file);
    expected.set(file, { before, after: applyExact(before, changes.get(file).section) });
  }
  return expected.get(file);
}
function assertReviewed(file, source = fs.readFileSync(file, 'utf8')) {
  source = readBeforeGoogleLogin(file, source);
  source = readBeforePatch(file, source, authScreenBase, authScreenChanges, authScreenSources);
  source = readBeforePatch(file, source, signupBase, signupChanges, signupSources);
  if (file === landingPage) {
    assertPublicEncounterSource(file, source);
    source = gitSource(beforePublicEncounter, file);
  }
  assert.equal(environmentReview.readBeforeReview(file, source), reviewed(file).after, 'unreviewed theme change: ' + file);
}
function readBeforeTheme(file) {
  const source = normalize(fs.readFileSync(file, 'utf8'));
  if (!changes.has(file)) {
    return environmentReview.readBeforeReview(file, readBeforePatch(file, readBeforeGoogleLogin(file, source), authScreenBase, authScreenChanges, authScreenSources));
  }
  assertReviewed(file, source);
  assert.ok(!added.has(file), 'new theme files have no historical source');
  return reviewed(file).before;
}
function historicalFiles(files, ref) {
  // Every theme file is verified before excluding its reviewed delta. Unknown
  // files stay in the result, so existing inventory guards still reject them.
  for (const file of changes.keys()) assertReviewed(file);
  for (const file of authScreenChanges.keys()) {
    if (!changes.has(file)) readBeforeTheme(file);
  }
  for (const file of publicEncounterAdded) assertPublicEncounterSource(file);
  return environmentReview.historicalFiles(files, ref).filter(file => {
    if (Object.hasOwn(legalBlobs, file) && !existsAt(legalBase, file)) {
      beforeLegal(file, fs.readFileSync(file, 'utf8'));
      return false;
    }
    const googleChange = googleLoginChanges.get(file);
    if (googleChange?.added) {
      assert.equal(normalize(fs.readFileSync(file, 'utf8')), applyExact('', googleChange.section));
      return false;
    }
    if (added.has(file) || publicEncounterAdded.has(file)) return false;
    if (ref && (authScreenChanges.has(file) || googleLoginChanges.has(file) || Object.hasOwn(legalBlobs, file)) && !changes.has(file) && existsAt(ref, file)) {
      return readBeforeTheme(file) !== gitSource(ref, file);
    }
    if (!ref || !changes.has(file)) return true;
    // A file added by an older feature must still reach that feature's guard.
    if (!existsAt(ref, file)) return true;
    return reviewed(file).before !== gitSource(ref, file);
  });
}
module.exports = { base, changes, added, gitSource, applyExact, reviewed, assertReviewed, readBeforeTheme, historicalFiles, publicEncounterAdded, assertPublicEncounterSource };
