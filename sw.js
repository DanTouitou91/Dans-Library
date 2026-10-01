/* ============================================================================
 * Service Worker — קריאה בלי אינטרנט
 * ----------------------------------------------------------------------------
 * דן ביקש לקרוא את הספרים בטיסה. שלושה מטמונים, ולכל אחד כלל משלו:
 *
 *  dl-shell-*  "המעטפת": הדף, הקוד, PDF.js והאייקונים. רשת קודם — כשיש
 *              חיבור תמיד מקבלים את הגרסה העדכנית, והעותק מתעדכן; כשאין,
 *              מגישים את העותק. ‏vendor/* נעול לגרסה, ולכן ממנו קוראים
 *              ישר מהמטמון.
 *  dl-fonts    Google Fonts, כדי שהספרייה תיראה אותו דבר גם בטיסה.
 *              ⚠️ בקשות fetch של ה-SW כפופות ל-connect-src של ה-CSP שלו
 *              עצמו (הכותרות של sw.js) — לכן שני המארחים נוספו שם ב-_headers.
 *  dl-books    הספרים ש*דן* בחר לשמור, בכפתור "שמירה לקריאה בלי אינטרנט".
 *              ⚠️ לעולם לא נמחק בעדכון של הקובץ הזה. המפתח הוא הכתובת
 *              המדויקת של BookSource.urlFor (כולל ?v=rev), והכתיבה עצמה
 *              נעשית מהדף (Offline ב-script.js), שבודק שזה באמת PDF.
 *
 * מה לא עובר כאן בכלל (אין respondWith, הדפדפן מטפל כרגיל):
 *  ‏/api/* (מונה המבקרים), ‏/v/* (ממסר הווידאו), עמוד הסרטונים ו-tapes.json —
 *  הסרטונים גדולים מדי לשמירה, וחנות הקלטות זמינה רק עם אינטרנט.
 *  Google Analytics וכל מקור חיצוני אחר, וכל בקשה שאינה GET.
 * ========================================================================== */

const VERSION = 1;
const SHELL = `dl-shell-v${VERSION}`;
const FONTS = 'dl-fonts';
const BOOKS = 'dl-books';

// ‏PDF.js וגופני הבסיס שלו לא מופיעים ב-HTML (הם נטענים מתוך הקוד), ולכן
// הם רשומים כאן. כל השאר — כולל style.css?v=… — נקרא מתוך הדף עצמו, כדי
// שלא יהיו כאן מספרי גרסה שצריך לזכור לעדכן.
const STANDARD_FONTS = [
  'FoxitDingbats.pfb', 'FoxitFixed.pfb', 'FoxitFixedBold.pfb', 'FoxitFixedBoldItalic.pfb',
  'FoxitFixedItalic.pfb', 'FoxitSerif.pfb', 'FoxitSerifBold.pfb', 'FoxitSerifBoldItalic.pfb',
  'FoxitSerifItalic.pfb', 'FoxitSymbol.pfb', 'LiberationSans-Bold.ttf',
  'LiberationSans-BoldItalic.ttf', 'LiberationSans-Italic.ttf', 'LiberationSans-Regular.ttf',
];
const CORE = [
  './',
  'vendor/pdfjs/pdf.min.mjs',
  'vendor/pdfjs/pdf.worker.min.mjs',
  ...STANDARD_FONTS.map((f) => `vendor/pdfjs/standard_fonts/${f}`),
];

const SKIP = /^\/(?:api\/|v\/|\.netlify\/|videos(?:\.html|\.js|\.css)?$|tapes\.json$|sw\.js$)/;
const FONT_HOSTS = new Set(['fonts.googleapis.com', 'fonts.gstatic.com']);

// ‏Wi-Fi של מטוס "מחובר" אבל לא עונה. בלי גבול זמן, רשת-קודם הייתה
// מחכה דקה שלמה לפני שהיא נופלת לעותק השמור.
const NET_TIMEOUT = 4000;

/* ---------- התקנה והפעלה ---------- */

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    // allSettled ולא all: קובץ אחד שנכשל לא יפיל את כל ההתקנה — מה
    // שחסר יושלם בביקור הבא, ברשת-קודם.
    await Promise.allSettled(CORE.map((u) => put(cache, u)));
    const page = await cache.match('./');
    if (page) await topUp(cache, await page.text());
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith('dl-shell-') && name !== SHELL) await caches.delete(name);
    }
    // ‏בלי claim הדף הראשון לא היה עובר דרך ה-SW עד רענון, וספר שנשמר
    // בביקור הראשון לא היה נפתח בטיסה.
    await self.clients.claim();
  })());
});

/** הדף שולח את כל מה שכבר נטען אצלו (גם לפני שה-SW שלט בו) — בעיקר הגופנים. */
self.addEventListener('message', (event) => {
  const { type, urls } = event.data || {};
  if (type !== 'warm' || !Array.isArray(urls)) return;
  event.waitUntil((async () => {
    const shell = await caches.open(SHELL);
    const fonts = await caches.open(FONTS);
    await Promise.allSettled(urls.slice(0, 200).map(async (raw) => {
      let url;
      try { url = new URL(raw, self.registration.scope); } catch { return; }
      if (url.origin === self.location.origin) {
        if (SKIP.test(url.pathname) || url.pathname.startsWith('/books/')) return;
        if (!(await shell.match(url.href))) await put(shell, url.href);
      } else if (FONT_HOSTS.has(url.hostname)) {
        if (!(await fonts.match(url.href, { ignoreVary: true }))) await put(fonts, url.href, { mode: 'cors' });
      }
    }));
  })());
});

/* ---------- ניתוב הבקשות ---------- */

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    if (SKIP.test(url.pathname)) return;
    if (url.pathname.startsWith('/books/')) return event.respondWith(book(req, url));
    if (req.mode === 'navigate') {
      // רק דף הספרייה. ניווט לכל דף אחר (חנות הקלטות) עובר לרשת כרגיל.
      if (url.pathname !== '/' && url.pathname !== '/index.html') return;
      return event.respondWith(navigate(event, req));
    }
    if (url.pathname.startsWith('/vendor/')) return event.respondWith(cacheFirst(req, SHELL));
    return event.respondWith(networkFirst(req, SHELL));
  }

  if (FONT_HOSTS.has(url.hostname)) {
    // קובצי הגופן ב-gstatic נעולים לגרסה בכתובת; קובץ ה-CSS משתנה
    return event.respondWith(url.hostname === 'fonts.gstatic.com'
      ? cacheFirst(req, FONTS, { mode: 'cors' })
      : networkFirst(req, FONTS, { mode: 'cors' }));
  }
});

/* ---------- אסטרטגיות ---------- */

/**
 * מוריד ושומר. ‏{mode:'cors'} לגופנים: ‏<link rel=stylesheet> מבקש בלי CORS
 * ומקבל תשובה "אטומה", שכרום מחייב עליה כ-7MB של מכסה לכל קובץ. ‏Google
 * מחזירה Access-Control-Allow-Origin: *, ולכן אפשר לבקש אותה גלויה.
 */
async function put(cache, url, init) {
  const res = await fetch(new Request(url, { cache: 'no-cache', credentials: 'omit', ...init }));
  if (res.status === 200) await cache.put(url, unredirect(res));
  return res;
}

/**
 * ⚠️ תשובה שהגיעה דרך הפניה (Netlify מפנה /index.html ל-/) אסור להגיש
 * לניווט: הדפדפן דוחה אותה ("redirected response"). עותק נקי פותר.
 */
function unredirect(res) {
  if (!res.redirected) return res;
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: res.headers });
}

async function lookup(cache, key) {
  return (await cache.match(key, { ignoreVary: true }))
    // style.css?v=12 עוד לא נשמר אבל ‎?v=11 כן — עדיף הגרסה הקודמת מכלום
    || (await cache.match(key, { ignoreVary: true, ignoreSearch: true }));
}

async function cacheFirst(req, name, init) {
  const cache = await caches.open(name);
  const hit = await cache.match(req.url, { ignoreVary: true });
  if (hit) return hit;
  const res = await fetch(init ? new Request(req.url, { credentials: 'omit', ...init }) : req);
  if (res.status === 200 && !req.headers.has('range')) cache.put(req.url, res.clone()).catch(() => {});
  return res;
}

async function networkFirst(req, name, init, key = req.url) {
  const cache = await caches.open(name);
  const net = fetch(init ? new Request(req.url, { credentials: 'omit', ...init }) : req).then((res) => {
    // ‏206 (Range) אי אפשר לשמור, ושגיאה לא אמורה לדרוס עותק טוב
    if (res.status === 200 && !req.headers.has('range')) cache.put(key, unredirect(res.clone())).catch(() => {});
    return res;
  });
  net.catch(() => {});
  const slow = new Promise((r) => setTimeout(r, NET_TIMEOUT, 'slow'));
  try {
    const first = await Promise.race([net, slow]);
    if (first !== 'slow') return first;
    return (await lookup(cache, key)) || (await net);
  } catch {
    const hit = await lookup(cache, key);
    if (hit) return hit;
    return Response.error();
  }
}

/** דף הספרייה. אחרי טעינה מהרשת משלימים ברקע קבצים חדשים שהדף מפנה אליהם. */
async function navigate(event, req) {
  const cache = await caches.open(SHELL);
  const res = await networkFirst(req, SHELL, null, './');
  if (res.status === 200 && res.type === 'basic' && !res.redirected) {
    event.waitUntil(res.clone().text().then((html) => topUp(cache, html)).catch(() => {}));
  }
  return res;
}

/** שומר כל קובץ מקומי שהדף מפנה אליו (src/href) ועדיין חסר במטמון. */
async function topUp(cache, html) {
  const urls = new Set();
  for (const [, raw] of html.matchAll(/\b(?:src|href)="([^"#][^"]*)"/g)) {
    if (/^[a-z][a-z0-9+.-]*:|^\/\//i.test(raw)) continue;      // מקור חיצוני / data:
    const url = new URL(raw, self.registration.scope);
    if (SKIP.test(url.pathname) || url.pathname.startsWith('/books/')) continue;
    urls.add(url.href);
  }
  await Promise.allSettled([...urls].map(async (u) => {
    if (!(await cache.match(u))) await put(cache, u);
  }));
}

/* ---------- ספרים ---------- */

/**
 * ספר שמור מוגש מהמטמון גם כשיש רשת: מהיר, ועובד גם ב-Wi-Fi רעוע.
 * ספר שלא נשמר עובר לרשת כרגיל. כשהרשת נכשלת ויש עותק של מהדורה קודמת
 * (‏rev אחר), עדיף להגיש אותו מאשר כלום — Offline.refresh ישדרג אותו
 * בפעם הבאה שיש חיבור.
 *
 * ⚠️ ‏cache:'reload' מסמן הורדה *לשמירה* (מהדף), והיא חייבת להגיע לרשת —
 * אחרת "רענון" של ספר שמור היה מחזיר את העותק הישן לעצמו.
 */
async function book(req, url) {
  if (req.cache === 'reload' || req.cache === 'no-store') return fetch(req);
  const cache = await caches.open(BOOKS);
  let hit = await cache.match(req.url);
  if (!hit) {
    try {
      return await fetch(req);
    } catch (err) {
      const keys = await cache.keys();
      const older = keys.find((k) => new URL(k.url).pathname === url.pathname);
      hit = older && (await cache.match(older));
      if (!hit) throw err;
    }
  }
  return slice(hit, req.headers.get('range'));
}

/**
 * ‏PDF.js קורא בקטעים (Range), ולכן מגישים בדיוק את הטווח שהתבקש, עם
 * Content-Range מדויק — כמו ש-Netlify עושה. בלי Range: הקובץ כולו, עם
 * Accept-Ranges כדי ש-PDF.js ימשיך לבקש קטעים.
 */
async function slice(res, range) {
  const blob = await res.blob();
  const size = blob.size;
  const type = res.headers.get('Content-Type') || 'application/pdf';
  const base = { 'Content-Type': type, 'Accept-Ranges': 'bytes' };
  const m = /^bytes=(\d*)-(\d*)$/.exec((range || '').trim());
  if (!m || (m[1] === '' && m[2] === '')) {
    return new Response(blob, { status: 200, headers: { ...base, 'Content-Length': String(size) } });
  }
  let a, b;
  if (m[1] === '') { a = Math.max(0, size - Number(m[2])); b = size - 1; }
  else { a = Number(m[1]); b = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1); }
  if (a >= size || a > b) {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  }
  return new Response(blob.slice(a, b + 1), {
    status: 206,
    headers: { ...base, 'Content-Range': `bytes ${a}-${b}/${size}`, 'Content-Length': String(b - a + 1) },
  });
}
