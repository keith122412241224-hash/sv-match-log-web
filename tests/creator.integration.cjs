/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test'), assert = require('node:assert/strict');
const { createDb, identity, ADMIN, MEMBER, uuid } = require('./creator-db.cjs');
const doc = image => ({ version: 1, title: '保存テスト', showTitle: true, rows: [{ id: uuid(10), name: 'S', color: '#ff0000', imageIds: image ? [image] : [] }] });
test('creator SQL: actual migration, RLS, Storage policies, transactional references, cleanup and revisions', async () => {
  const db = await createDb();
  try {
    const image = uuid(20), work = uuid(30), object = `${uuid(40)}.png`, replacement = `${uuid(41)}.png`;
    await db.query('insert into storage.objects(bucket_id,name) values($1,$2)', ['creator-images', object]);
    await db.query('insert into public.creator_images(id,name,object_path) values($1,$2,$3)', [image, '画像', object]);
    await db.query('insert into public.creator_tier_works(id,document) values($1,$2)', [work, doc(image)]);
    assert.equal((await db.query('select * from public.creator_tier_image_refs')).rows.length, 1);
    await assert.rejects(db.query('delete from public.creator_images where id=$1', [image]), /foreign key/);
    assert.equal((await db.query('delete from storage.objects where name=$1 returning *', [object])).rows.length, 0);
    for (const bad of [null, {}, { ...doc(), rows: [] }, { ...doc(), rows: [doc().rows[0], doc().rows[0]] }, { ...doc(), rows: [{ ...doc().rows[0], imageIds: ['../evil'] }] }, { ...doc(), showTitle: 'false' }]) await assert.rejects(db.query('update public.creator_tier_works set document=$1 where id=$2', [bad, work]));
    await assert.rejects(db.query('update public.creator_tier_works set document=$1 where id=$2', [doc(uuid(999)), work]), /foreign key/);
    assert.equal((await db.query('select * from public.creator_tier_image_refs')).rows.length, 1, 'failed save rolls refs back');
    await db.query('update public.creator_images set object_path=$1 where id=$2', [replacement, image]);
    assert.equal((await db.query('select revision from public.creator_images')).rows[0].revision, 2);
    assert.equal((await db.query('select object_path from public.creator_storage_cleanup')).rows[0].object_path, object);
    assert.equal((await db.query('delete from storage.objects where name=$1 returning *', [object])).rows.length, 1);
    assert.equal((await db.query('update public.creator_images set name=$1 where id=$2 and revision=1 returning *', ['stale', image])).rows.length, 0);
    for (const [user, role, anonymous] of [[MEMBER, 'authenticated', false], [ADMIN, 'authenticated', true], [null, 'anon', false]]) {
      await identity(db, user, role, anonymous);
      for (const table of ['creator_images', 'creator_tier_works', 'creator_tier_image_refs', 'creator_storage_cleanup']) {
        if (role === 'anon') await assert.rejects(db.query(`select * from public.${table}`), /permission denied/);
        else assert.equal((await db.query(`select * from public.${table}`)).rows.length, 0);
      }
      await assert.rejects(db.query('insert into public.creator_images(name,object_path) values($1,$2)', ['denied', `${uuid(99)}.png`]));
      await assert.rejects(db.query('insert into storage.objects(bucket_id,name) values($1,$2)', ['creator-images', `${uuid(99)}.png`]));
      assert.equal((await db.query('select * from storage.objects')).rows.length, 0);
      if (role === 'authenticated') {
        assert.equal((await db.query('update public.creator_images set name=$1 returning *', ['denied'])).rows.length, 0);
        assert.equal((await db.query('delete from public.creator_tier_works returning *')).rows.length, 0);
      }
    }
    await identity(db);
    await db.query('delete from public.creator_tier_works where id=$1', [work]);
    assert.equal((await db.query('select * from public.creator_tier_image_refs')).rows.length, 0);
    await db.query('delete from public.creator_images where id=$1', [image]);
    assert.equal((await db.query('select * from public.creator_storage_cleanup')).rows.length, 2);
    await assert.rejects(db.query('insert into storage.objects(bucket_id,name) values($1,$2)', ['creator-images', '../escape.png']));
    await db.query('insert into public.creator_images(name,object_path) values($1,$2)', ['残す画像', `${uuid(70)}.png`]);
    await db.query('insert into public.creator_tier_works(document) values($1)', [doc()]);
    await db.exec('reset role');
    await db.query('delete from auth.users where id=$1', [ADMIN]);
    assert.equal((await db.query('select created_by from public.creator_images')).rows[0].created_by, null);
    assert.equal((await db.query('select created_by from public.creator_tier_works')).rows[0].created_by, null);
    const bucket = (await db.query("select * from storage.buckets where id='creator-images'")).rows[0];
    assert.equal(bucket.public, false); assert.equal(Number(bucket.file_size_limit), 4194304);
    assert.deepEqual(bucket.allowed_mime_types, ['image/jpeg','image/png','image/webp']);
  } finally { await db.close(); }
});
