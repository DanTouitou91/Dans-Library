// בדיקות לוגיקת מונה המבקרים, בלי Netlify:  node --test tests/visits_test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handle, START } from '../netlify/functions/visits/counter.mjs';

function memoryStore() {
  const m = new Map();
  return { get: async (k) => (m.has(k) ? m.get(k) : null), set: async (k, v) => { m.set(k, v); }, m };
}
const call = async (store, method, page) => {
  const res = await handle(new Request(`https://x/api/visits?page=${page}`, { method }), store);
  return { status: res.status, body: await res.json(), cache: res.headers.get('cache-control') };
};

test('empty store starts from 349, first visit shows 350', async () => {
  const s = memoryStore();
  assert.equal(START.library, 349);
  assert.equal((await call(s, 'GET', 'library')).body.count, 349);
  assert.equal((await call(s, 'POST', 'library')).body.count, 350);
});

test('GET never increments, POST increments by exactly one', async () => {
  const s = memoryStore();
  await call(s, 'POST', 'videos');
  await call(s, 'GET', 'videos');
  await call(s, 'GET', 'videos');
  assert.equal((await call(s, 'GET', 'videos')).body.count, 350);
  assert.equal((await call(s, 'POST', 'videos')).body.count, 351);
});

test('pages are counted separately', async () => {
  const s = memoryStore();
  await call(s, 'POST', 'library');
  await call(s, 'POST', 'library');
  assert.equal((await call(s, 'GET', 'library')).body.count, 351);
  assert.equal((await call(s, 'GET', 'videos')).body.count, 349);
});

test('unknown page is rejected and creates no key', async () => {
  const s = memoryStore();
  const r = await call(s, 'POST', 'evil');
  assert.equal(r.status, 400);
  assert.equal(s.m.size, 0);
});

test('other methods are rejected', async () => {
  assert.equal((await call(memoryStore(), 'DELETE', 'library')).status, 405);
});

test('responses are never cached', async () => {
  assert.equal((await call(memoryStore(), 'GET', 'library')).cache, 'no-store');
});

test('a corrupt stored value falls back to the start, not NaN', async () => {
  const s = memoryStore();
  s.m.set('library', 'garbage');
  assert.equal((await call(s, 'GET', 'library')).body.count, 349);
});
