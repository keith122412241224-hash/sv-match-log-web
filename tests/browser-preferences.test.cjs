/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict');
const {safeGetItem,safeSetItem,safeRemoveItem}=require('../src/lib/browser-preferences');

test('optional preferences do not throw outside the browser',()=>{
  assert.equal(safeGetItem('test'),null);
  assert.equal(safeSetItem('test','value'),false);
  assert.equal(safeRemoveItem('test'),false);
});
test('normal get, set, remove retain exact values; malformed strings are left for value validation',()=>{
  const values=new Map();
  global.window={localStorage:{getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)}};
  try{
    assert.equal(safeGetItem('missing'),null);
    assert.equal(safeSetItem('deck','my-deck'),true);assert.equal(safeGetItem('deck'),'my-deck');
    assert.equal(safeSetItem('rank','{malformed'),true);assert.equal(safeGetItem('rank'),'{malformed');
    assert.equal(safeRemoveItem('rank'),true);assert.equal(safeGetItem('rank'),null);assert.equal(safeGetItem('deck'),'my-deck');
  }finally{delete global.window;}
});
for(const name of ['SecurityError','QuotaExceededError'])test(name+' in any storage operation is isolated',()=>{
  const fail=()=>{throw new DOMException('storage unavailable',name);};
  global.window={localStorage:{getItem:fail,setItem:fail,removeItem:fail}};
  try{assert.equal(safeGetItem('key'),null);assert.equal(safeSetItem('key','value'),false);assert.equal(safeRemoveItem('key'),false);}
  finally{delete global.window;}
});
test('accessing window.localStorage itself may throw',()=>{
  global.window={get localStorage(){throw new DOMException('storage unavailable','SecurityError');}};
  try{assert.equal(safeGetItem('key'),null);assert.equal(safeSetItem('key','value'),false);assert.equal(safeRemoveItem('key'),false);}
  finally{delete global.window;}
});
test('one preference failure leaves other preferences available',()=>{
  const values=new Map([['deck','deck-id']]);
  global.window={localStorage:{getItem:key=>{if(key==='rank')throw Error('denied');return values.get(key)??null;},setItem:(key,value)=>{if(key==='rank')throw Error('quota');values.set(key,value);},removeItem:key=>{if(key==='rank')throw Error('denied');values.delete(key);}}};
  try{assert.equal(safeGetItem('rank'),null);assert.equal(safeSetItem('rank','aa'),false);assert.equal(safeRemoveItem('rank'),false);assert.equal(safeGetItem('deck'),'deck-id');assert.equal(safeSetItem('environment','environment-id'),true);assert.equal(safeGetItem('environment'),'environment-id');}
  finally{delete global.window;}
});
