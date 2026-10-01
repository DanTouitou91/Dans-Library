/**
 * ממסר וידאו לאייפון — ‏/v/<שם-קובץ>.mp4
 *
 * ⚠️ למה זה קיים: GitHub מגיש את קובצי ה-Release עם
 *     Content-Type: application/octet-stream  +  Content-Disposition: attachment
 * ומפנה לכתובת חתומה בלי סיומת .mp4 (וסוג הקובץ חתום בתוכה — אי אפשר
 * לבקש אחר). כרום במחשב מזהה MP4 לפי התוכן ומתעלם. באייפון כל הדפדפנים —
 * גם כרום — הם WebKit, שמסתמך על הסוג המוצהר או על הסיומת, ולכן מסרב לנגן.
 * הממסר מבקש את אותו קובץ מ-GitHub ומעביר אותו כ-video/mp4.
 *
 * ⚠️ הוא גיבוי בלבד: videos.js מנסה קודם ישירות מ-GitHub ועובר לכאן רק
 * כשהנגן נכשל לפני שהסרטון נטען. כל בייט כאן נספר במכסת התעבורה של
 * Netlify, ולכן מחשבים ואנדרואיד לא עוברים דרכו.
 *
 * בונוס: כל בקשה כאן מבקשת מ-GitHub הפניה טרייה, ולכן אין כאן את בעיית
 * הכתובת החתומה שפגה אחרי 5 דקות.
 */

// ‏רק ה-Release של המאגר הזה — לא ממסר כללי לאינטרנט
export const RELEASE = 'https://github.com/DanTouitou91/Dans-Library/releases/download/videos-v1/';
const NAME = /^[\w.\-]+\.mp4$/;
const PASS = ['content-length', 'content-range', 'etag', 'last-modified'];

export default async function video(request) {
  const name = decodeURIComponent(new URL(request.url).pathname.split('/').pop() || '');
  if (!NAME.test(name) || name.startsWith('.')) return new Response('Not found', { status: 404 });

  const headers = {};
  const range = request.headers.get('range');
  if (range) headers.Range = range;          // fetch שומר אותו גם אחרי ה-302 של GitHub

  let upstream;
  try {
    upstream = await fetch(RELEASE + encodeURIComponent(name), {
      method: request.method === 'HEAD' ? 'HEAD' : 'GET',
      headers,
      redirect: 'follow',
    });
  } catch {
    return new Response('Upstream unavailable', { status: 502 });
  }
  if (upstream.status !== 200 && upstream.status !== 206) {
    return new Response(null, { status: upstream.status === 416 ? 416 : upstream.status || 502 });
  }

  const out = new Headers();
  for (const k of PASS) {
    const v = upstream.headers.get(k);
    if (v) out.set(k, v);
  }
  out.set('Content-Type', 'video/mp4');          // זה כל העניין
  out.set('Accept-Ranges', 'bytes');
  out.set('Cache-Control', 'private, max-age=3600');
  // ‏Content-Disposition: attachment של GitHub לא עובר הלאה בכוונה
  return new Response(request.method === 'HEAD' ? null : upstream.body, { status: upstream.status, headers: out });
}

export const config = { path: '/v/*' };
