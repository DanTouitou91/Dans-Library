/**
 * מונה המבקרים — הלוגיקה, בלי תלות ב-Netlify.
 *
 * ה-store מגיע מבחוץ (Netlify Blobs בייצור, Map בבדיקות), כדי שאפשר יהיה
 * לבדוק את הכללים ב-`node --test` בלי שרת ובלי רשת.
 *
 * נשמר רק מספר אחד לכל עמוד. בלי עוגיות, בלי IP ובלי שום מזהה של המבקר:
 * ההחלטה "האם כבר נספרת היום" נעשית בדפדפן (assets/visits.js).
 */

/** העמודים המותרים. כל ערך אחר נדחה — אחרת כל אחד יכול לייצר מפתחות חדשים. */
export const PAGES = ['library', 'videos'];

/** נקודת ההתחלה (בקשת דן): כשאין עדיין ערך שמור — הביקור הראשון יציג 350. */
export const START = { library: 349, videos: 349 };

export async function read(store, page) {
  const raw = await store.get(page);
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : START[page];
}

/**
 * ‏GET  ?page=library → { page, count }      — קריאה בלבד
 * ‏POST ?page=library → { page, count: +1 }  — ביקור חדש
 *
 * ⚠️ קריאה-ועדכון אינם אטומיים: שני ביקורים באותה מילישנייה בדיוק עלולים
 * להיספר כאחד. באתר אישי זה זניח, ולכן אין כאן נעילה.
 */
export async function handle(request, store) {
  const page = new URL(request.url).searchParams.get('page');
  if (!PAGES.includes(page)) return json({ error: 'unknown page' }, 400);

  if (request.method === 'GET') return json({ page, count: await read(store, page) });

  if (request.method === 'POST') {
    const count = (await read(store, page)) + 1;
    await store.set(page, String(count));
    return json({ page, count });
  }
  return json({ error: 'method not allowed' }, 405, { Allow: 'GET, POST' });
}

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      // מספר שמשתנה בכל ביקור — אסור שדפדפן או CDN ישמרו עותק שלו
      'Cache-Control': 'no-store',
      ...extra,
    },
  });
}
