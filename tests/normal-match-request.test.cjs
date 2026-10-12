/* eslint-disable @typescript-eslint/no-require-imports */
const { test, beforeEach } = require('node:test'), assert = require('node:assert/strict');
const { submitMatchSubmission, readMatchSubmission, submissionForm } = require('../src/lib/match-submission.ts');
let items;
beforeEach(() => {
  items = new Map(); global.window = { dispatchEvent() {} };
  global.sessionStorage = { getItem: k => items.get(k) ?? null, setItem: (k,v) => items.set(k,v), removeItem: k => items.delete(k) };
});
const form = () => { const f = new FormData(); f.set('result','lose'); f.set('next_action','continue'); return f; };
test('lost success retains the exact ID/payload across reload; acknowledgement rotates the next operation', async () => {
  const seen = [], send = async f => { seen.push(Object.fromEntries(f)); throw Error('response lost'); };
  await assert.rejects(submitMatchSubmission('a', form(), send));
  const first = structuredClone(readMatchSubmission('a'));
  await assert.rejects(submitMatchSubmission('a', form(), send));
  assert.deepEqual(readMatchSubmission('a'), first); assert.deepEqual(seen[1],seen[0]);
  // A new module instance models reload: state must come from storage.
  delete require.cache[require.resolve('../src/lib/match-submission.ts')];
  const reloaded = require('../src/lib/match-submission.ts');
  assert.deepEqual(reloaded.readMatchSubmission('a'), first);
  await reloaded.submitMatchSubmission('a',reloaded.submissionForm(first),async f => { assert.equal(f.get('request_id'),first.id); return {ok:true}; });
  assert.equal(readMatchSubmission('a'),null);
  await submitMatchSubmission('a',form(),async f => { assert.notEqual(f.get('request_id'),first.id); return {ok:true}; });
});
test('DB failure retains input; changed input cannot hijack an unresolved ID', async () => {
  await submitMatchSubmission('a',form(),async()=>({ok:false})); const original=structuredClone(readMatchSubmission('a'));
  const changed=form();changed.set('result','win');
  await assert.rejects(submitMatchSubmission('a',changed,async()=>assert.fail('must not send')),/未確認/);
  assert.deepEqual(readMatchSubmission('a'),original);
  assert.deepEqual(Object.fromEntries(submissionForm(original)),Object.fromEntries(submissionForm(readMatchSubmission('a'))));
});
test('separate users and independent tabs generate separate operations; duplicated pending tab keeps its ID',async()=>{
  await submitMatchSubmission('a',form(),async()=>({ok:false})); const a=readMatchSubmission('a');
  await submitMatchSubmission('b',form(),async()=>({ok:false})); assert.notEqual(readMatchSubmission('b').id,a.id);
  const firstTab=new Map(items);items=new Map();await submitMatchSubmission('a',form(),async()=>({ok:false}));assert.notEqual(readMatchSubmission('a').id,a.id);
  items=firstTab;await submitMatchSubmission('a',submissionForm(a),async f=>{assert.equal(f.get('request_id'),a.id);return {ok:true};});
});
test('storage denied, corrupt data, or unauthenticated form fail before sending',async()=>{
  const send=async()=>assert.fail('must not send');
  await assert.rejects(submitMatchSubmission(undefined,form(),send),/ログイン/);
  sessionStorage.setItem=()=>{throw Error('denied');};await assert.rejects(submitMatchSubmission('a',form(),send),/送信していません/);
  items.set('svml:pending-match:a','{"id":"invalid"}');await assert.rejects(submitMatchSubmission('a',form(),send),/読み取れません/);
});
test('a blocked acknowledgement cleanup retains the ID; next registration cannot silently reuse it',async()=>{
  sessionStorage.removeItem=()=>{};
  await assert.rejects(submitMatchSubmission('a',form(),async()=>({ok:true})),/保存済み/);
  const first=readMatchSubmission('a');sessionStorage.removeItem=k=>items.delete(k);
  await submitMatchSubmission('a',form(),async f=>{assert.equal(f.get('request_id'),first.id);return {ok:true};});
  assert.equal(readMatchSubmission('a'),null);
});
