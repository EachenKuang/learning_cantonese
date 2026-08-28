/* 云端同步回归测试：sanitizeProfile 保留 reviews + mergeReviews 多设备按词合并
   运行：node --test server/sync-store.test.mjs（Node 18+ 内置 test runner） */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeProfile, mergeReviews } from './sync-store.mjs';

/* ---- 1. sanitizeProfile 必须保留合法的 reviews ---- */
test('sanitizeProfile 保留合法 reviews（box/due/updatedAt 规范化）', () => {
  const p = sanitizeProfile({
    favorites: ['food:飲茶'],
    reviews: {
      'food:飲茶':  { box: 2, due: '2026-09-01', updatedAt: 1728000000000 },
      'food:虾饺':  { box: 5, due: '2026-10-10' },           // 无 updatedAt → 0
      'transport:地鐵': { box: 0, due: 'bad-date' },          // due 非法 → 丢弃
      '':            { box: 1, due: '2026-09-02' },          // 空 key → 丢弃
      ['x'.repeat(300)]: { box: 1, due: '2026-09-02' }          // key 过长 → 丢弃
    }
  });
  assert.deepEqual(p.reviews['food:飲茶'], { box: 2, due: '2026-09-01', updatedAt: 1728000000000 });
  assert.deepEqual(p.reviews['food:虾饺'], { box: 5, due: '2026-10-10', updatedAt: 0 });
  assert.equal(p.reviews['transport:地鐵'], undefined, 'due 非法应丢弃');
  assert.equal(Object.keys(p.reviews).length, 2, '非法条目应被清洗掉');
});

test('sanitizeProfile 无 reviews 时返回空对象（不报错）', () => {
  const p = sanitizeProfile({ favorites: [] });
  assert.deepEqual(p.reviews, {});
});

/* ---- 2. mergeReviews 多设备按词合并（新者胜） ---- */
test('mergeReviews 同 key 取 updatedAt 较新者', () => {
  const base = { 'food:飲茶': { box: 3, due: '2026-09-05', updatedAt: 1000 } };
  const incoming = { 'food:飲茶': { box: 1, due: '2026-08-29', updatedAt: 500 } };
  const out = mergeReviews(base, incoming);
  assert.deepEqual(out['food:飲茶'], base['food:飲茶'], '旧提交不应覆盖新记录');
});

test('mergeReviews 新提交更新旧记录', () => {
  const base = { 'food:飲茶': { box: 1, due: '2026-08-29', updatedAt: 500 } };
  const incoming = { 'food:飲茶': { box: 2, due: '2026-09-01', updatedAt: 1000 } };
  const out = mergeReviews(base, incoming);
  assert.deepEqual(out['food:飲茶'], incoming['food:飲茶'], 'updatedAt 较新应覆盖');
});

test('mergeReviews 新增 key 与空 incoming', () => {
  const base = { a: { box: 1, due: '2026-08-29', updatedAt: 1 } };
  const out1 = mergeReviews(base, { b: { box: 2, due: '2026-09-01', updatedAt: 2 } });
  assert.ok(out1.a && out1.b, '两设备词集合并集');
  assert.deepEqual(mergeReviews(base, {}), base, '空提交不动服务端');
  assert.deepEqual(mergeReviews(null, { b: { box: 1, due: '2026-09-01', updatedAt: 1 } }).b, { box: 1, due: '2026-09-01', updatedAt: 1 }, '服务端空 reviews 直接采用提交');
});

/* ---- 3. 完整 PUT 合并流程模拟 ---- */
test('PUT 流程：服务端已有 reviews 时按词合并而非整包覆盖', () => {
  const serverStored = sanitizeProfile({
    reviews: { 'food:飲茶': { box: 4, due: '2026-09-20', updatedAt: 2000 } }
  });
  /* 旧设备（无更新）整包提交，不带该词或带旧版 */
  const deviceSubmit = sanitizeProfile({
    reviews: { 'food:飲茶': { box: 2, due: '2026-09-01', updatedAt: 800 } }
  });
  const merged = mergeReviews(serverStored.reviews, deviceSubmit.reviews);
  assert.equal(merged['food:飲茶'].box, 4, '服务端较新的 box=4 应保留，不被旧设备覆盖');
  assert.equal(merged['food:飲茶'].due, '2026-09-20');
});
