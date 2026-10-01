// בדיקות ממסר הווידאו (netlify/edge-functions/video.js) עם fetch מדומה:
//   node --test tests/video_edge_test.mjs
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import video, { RELEASE } from '../netlify/edge-functions/video.js';

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

function githubLike({ status = 206, body = 'xx' } = {}) {
  const seen = [];
  globalThis.fetch = async (url, init) => {
    seen.push({ url, init });
    return new Response(body, {
      status,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': 'attachment; filename=x.mp4',
        'Content-Range': 'bytes 0-1/173729480',
        'Content-Length': '2',
      },
    });
  };
  return seen;
}
const req = (path, headers = {}) => new Request(`https://dans-library.netlify.app${path}`, { headers });

test('serves the release asset as video/mp4 and drops the attachment header', async () => {
  githubLike();
  const res = await video(req('/v/lashon.hevra.ve-tarbut.mp4', { Range: 'bytes=0-1' }));
  assert.equal(res.status, 206);
  assert.equal(res.headers.get('content-type'), 'video/mp4');
  assert.equal(res.headers.get('content-disposition'), null);
  assert.equal(res.headers.get('content-range'), 'bytes 0-1/173729480');
  assert.equal(res.headers.get('accept-ranges'), 'bytes');
});

test('forwards the Range header to GitHub, from this repo release only', async () => {
  const seen = githubLike();
  await video(req('/v/a.mp4', { Range: 'bytes=100-199' }));
  assert.equal(seen[0].url, RELEASE + 'a.mp4');
  assert.equal(seen[0].init.headers.Range, 'bytes=100-199');
  assert.ok(RELEASE.startsWith('https://github.com/DanTouitou91/Dans-Library/releases/download/'));
});

test('rejects anything that is not a plain .mp4 name — no open proxy', async () => {
  const seen = githubLike();
  for (const p of ['/v/../index.html', '/v/x.txt', '/v/', '/v/a%2Fb.mp4', '/v/.mp4']) {
    assert.equal((await video(req(p))).status, 404, p);
  }
  assert.equal(seen.length, 0);
});

test('passes GitHub errors through instead of pretending to be video', async () => {
  githubLike({ status: 404, body: 'Not Found' });
  const res = await video(req('/v/missing.mp4'));
  assert.equal(res.status, 404);
  assert.notEqual(res.headers.get('content-type'), 'video/mp4');
});

test('network failure upstream → 502', async () => {
  globalThis.fetch = async () => { throw new TypeError('boom'); };
  assert.equal((await video(req('/v/a.mp4'))).status, 502);
});
