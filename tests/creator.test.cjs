/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { newTierDocument, parseTierDocument, placeImage, validateImageFile, MAX_IMAGE_BYTES, tierLayout } = require('../src/lib/creator/model');
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

test('creator: full document roundtrip, arbitrary tiers, IDs/order/title/color preserved', () => {
  const doc = newTierDocument();
  assert.deepEqual(doc.rows.map(r => r.name), ['S', 'A', 'B', 'C', 'D']);
  doc.title = '第3弾環境 Tier表'; doc.showTitle = false;
  doc.rows[0].name = '環境トップ'; doc.rows[0].color = '#123456'; doc.rows[0].imageIds = [uuid(1), uuid(2), uuid(1)];
  assert.deepEqual(parseTierDocument(JSON.parse(JSON.stringify(doc))), doc);
  for (const bad of [null, {}, { ...doc, version: 2 }, { ...doc, showTitle: 'false' }, { ...doc, rows: [] }, { ...doc, rows: [doc.rows[0], doc.rows[0]] }, { ...doc, title: 'x'.repeat(121) }, { ...doc, rows: [{ ...doc.rows[0], color: 'url(https://evil)' }] }, { ...doc, rows: [{ ...doc.rows[0], imageIds: ['../../file'] }] }]) assert.throws(() => parseTierDocument(bad));
});
test('creator: library placement, intra-row reorder, cross-row move, duplicates and stale drag', () => {
  let doc = newTierDocument(); const [a, b] = doc.rows;
  doc = placeImage(doc, { imageId: uuid(1) }, a.id, 0);
  doc = placeImage(doc, { imageId: uuid(2) }, a.id, 1);
  const original = structuredClone(doc);
  doc = placeImage(doc, { imageId: uuid(1), rowId: a.id, index: 0 }, a.id, 2);
  assert.deepEqual(doc.rows[0].imageIds, [uuid(2), uuid(1)]);
  assert.deepEqual(original.rows[0].imageIds, [uuid(1), uuid(2)]);
  doc = placeImage(doc, { imageId: uuid(1), rowId: a.id, index: 1 }, b.id, 0);
  assert.deepEqual(doc.rows[0].imageIds, [uuid(2)]); assert.deepEqual(doc.rows[1].imageIds, [uuid(1)]);
  assert.equal(placeImage(doc, { imageId: uuid(1), rowId: a.id, index: 1 }, b.id, 0), doc);
});
test('creator: file extension, MIME, empty and oversized uploads reject; filenames are metadata only', () => {
  for (const [name, type] of [['a.jpg', 'image/jpeg'], ['a.JPEG', 'image/jpeg'], ['a.png', 'image/png'], ['a.webp', 'image/webp']]) assert.ok(validateImageFile({ name, type, size: 100 }));
  for (const file of [{ name: 'x.svg', type: 'image/svg+xml', size: 1 }, { name: 'x.png', type: 'text/html', size: 1 }, { name: 'x.jpg', type: 'image/jpeg', size: 0 }, { name: 'x.png', type: 'image/png', size: MAX_IMAGE_BYTES + 1 }]) assert.throws(() => validateImageFile(file));
});
test('creator: large artwork fits inside 1080 with title on and off', () => {
  const doc = newTierDocument(); doc.rows[0].imageIds = Array(100).fill(uuid(1));
  for (const showTitle of [true, false]) { doc.showTitle = showTitle; const l = tierLayout(doc); assert.ok(l.contentHeight * l.scale <= (showTitle ? 912 : 984)); }
});
