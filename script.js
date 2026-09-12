/* ============================================================================
 *  אוסף ספרי הלמידה של דן — לוגיקת האתר
 *  ---------------------------------------------------------------------------
 *  מבנה הקובץ:
 *    §0  CATALOG — מערך הספרים (זה החלק היחיד שצריך לערוך כדי להוסיף ספר)
 *    §1  עזרים כלליים
 *    §2  Store — שמירה מקומית (הערות, סימניות, עמוד אחרון, נושא)
 *    §3  Theme — מצב בהיר/כהה
 *    §4  מדף הספרים
 *    §5  שכבות מודאליות (כרטיסייה, אודות) + ניהול פוקוס
 *    §6  BookSource — עטיפה ל-PDF.js: פתיחה, מדידה, ציור, תור עיבוד
 *    §7  ScrollReader — תצוגת גלילה (בסיס יציב, גם מצב הגיבוי)
 *    §8  FlipReader — תצוגת דפדוף (StPageFlip)
 *    §9  Reader — הבקר: סרגל כלים, זום, פנקס, סימניות
 *    §10 Router — ניווט לפי location.hash
 *    §11 מקלדת גלובלית
 *    §12 אתחול
 * ========================================================================== */

'use strict';

/* ============================================================================
 * §0 — מערך הספרים
 * ----------------------------------------------------------------------------
 *  ✦ כיצד להוסיף ספר חדש ✦
 *
 *  1. העלה את קובץ ה-PDF לתיקייה  books/   (למשל  books/mikro-kalkala.pdf)
 *  2. הוסף אובייקט חדש למערך שלמטה.
 *  3. שמור, בצע commit ו-push. Netlify יפרוס את השינוי אוטומטית.
 *
 *  שדות האובייקט:
 *
 *    id        (חובה)  מזהה קבוע באנגלית בלבד. ⚠️ לעולם אל תשנה אותו אחרי
 *                      שהעלית את האתר — כל ההערות והסימניות של הספר שמורות
 *                      תחת המזהה הזה, ושינוי שלו ימחק אותן מבחינת המשתמש.
 *                      אסור להשתמש בשם העברי כמזהה (בעיות תקן Unicode).
 *    title     (חובה)  שם הקורס. מוטבע על שדרת הספר ומופיע ככותרת הכרטיסייה.
 *    file      (חובה)  נתיב ל-PDF. נתיב יחסי (books/x.pdf) או כתובת מלאה.
 *    sources   (חובה)  מערך מחרוזות — המקורות שעליהם הספר מבוסס.
 *                      מוצג ברשימה בכרטיסיית הקטלוג.
 *    shelf     (רשות)  שם המדף שעליו הספר יעמוד. ברירת מחדל: 'הקורסים שלי'.
 *    spine     (רשות)  { color: '#6E1D2B', height: 0.95 }
 *                      color  — צבע בד הכריכה.
 *                      height — גובה יחסי (0.8–1.05) כדי שהמדף ייראה טבעי.
 *    note      (רשות)  שורת מידע קצרה שמופיעה בתחתית הכרטיסייה.
 *
 *  דוגמה מלאה:
 *
 *    {
 *      id: 'mikro-kalkala',
 *      title: 'מבוא למיקרו-כלכלה',
 *      file: 'books/mikro-kalkala.pdf',
 *      sources: ['ספר הקורס, האוניברסיטה הפתוחה', 'מאמרי חובה, יחידות 1–6'],
 *      shelf: 'שנה ב׳',
 *      spine: { color: '#1F3D2B', height: 0.98 },
 *    },
 * ========================================================================== */

const CATALOG = [
  {
    id: 'lashon-hevra-tarbut',
    title: 'לשון, חברה ותרבות',
    file: 'books/lashon-hevra-tarbut.pdf',
    sources: [
      'ספר הקורס "לשון, חברה ותרבות", האוניברסיטה הפתוחה',
      'מטלות המנחה (ממ״נים) שבקורס',
    ],
    shelf: 'הקורסים שלי',
    spine: { color: '#6E1D2B', height: 1.0 },
    note: 'ספר קורס מלא ומאויר · מן היסודות ועד הפרגמטיקה, לקראת בחינת הגמר',
  },
  {
    id: 'yahasim-beinleumiyim',
    title: 'יחסים בינלאומיים',
    file: 'books/yahasim-beinleumiyim.pdf',
    sources: [
      'פוליטיקה עולמית — מגמות ותמורות (קגלי ובלאנטון), ספר הקורס',
      'שתים־עשרה מצגות ההנחיה של המרצה',
      'שלושת הממ״נים והכתבות הנלוות',
      'קטע הקריאה למועד א׳ — ים סין הדרומי',
    ],
    shelf: 'הקורסים שלי',
    spine: { color: '#1F3D2B', height: 0.94 },
    note: 'מן היסוד אל היישום · האוניברסיטה הפתוחה · ספר לימוד מקיף לקראת הבחינה',
  },
  {
    id: 'mavo-minhal-nihul-tziburi',
    title: 'מבוא למינהל ולניהול ציבורי',
    file: 'books/mavo-minhal-nihul-tziburi.pdf',
    // TODO (דן): להחליף במקורות האמיתיים של הקורס.
    sources: [
      'ספר הקורס, האוניברסיטה הפתוחה',
      'מקבץ מאמרי חובה',
      'סיכומי הרצאות ומפגשי הנחיה',
    ],
    shelf: 'הקורסים שלי',
    spine: { color: '#3E2A5C', height: 1.02 },
  },
];

/* ============================================================================
 * §1 — עזרים כלליים
 * ========================================================================== */

const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/** משהה קריאות תכופות, עם תקרת המתנה שמבטיחה כתיבה גם בהקלדה רציפה. */
function debounce(fn, wait = 300, maxWait = 0) {
  let timer = null, firstCall = 0;
  return function (...args) {
    if (!firstCall) firstCall = Date.now();
    clearTimeout(timer);
    const delay = maxWait
      ? Math.min(wait, Math.max(0, firstCall + maxWait - Date.now()))
      : wait;
    timer = setTimeout(() => { firstCall = 0; fn.apply(this, args); }, delay);
  };
}

/** מכריז על שינוי לקוראי מסך. */
const announce = debounce((msg) => {
  const el = $('#live-region');
  if (el) el.textContent = msg;
}, 400);

/** הודעה צפה קצרה בתוך הקורא. */
function toast(message, actionLabel, onAction, timeout = 7000) {
  const stage = $('#reader-view');
  if (!stage) return;
  $('.toast', stage)?.remove();

  const box = document.createElement('div');
  box.className = 'toast';
  box.setAttribute('role', 'status');
  box.append(Object.assign(document.createElement('span'), { textContent: message }));

  if (actionLabel && onAction) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = actionLabel;
    b.addEventListener('click', () => { box.remove(); onAction(); });
    box.append(b);
  }
  stage.append(box);
  setTimeout(() => box.remove(), timeout);
}

/* ============================================================================
 * §2 — Store: שמירה מקומית
 * ----------------------------------------------------------------------------
 *  מפתחות:
 *    dl:schema                     גרסת הסכמה הגלובלית
 *    dl:settings                   { v, theme, readerMode }
 *    dl:book:<id>:state            { v, lastPage, totalPages, openedAt }
 *    dl:book:<id>:notes            { v, text }
 *    dl:book:<id>:marks            { v, pages: [] }
 *
 *  למה ארבעה מפתחות קטנים ולא אובייקט אחד גדול: כשנגמר המקום אפשר למחוק
 *  את state (שניתן לשחזר) בלי לגעת ב-notes (תוכן שהמשתמש כתב ואי אפשר לשחזר).
 * ========================================================================== */

const Store = (() => {
  const PREFIX = 'dl:';
  const VERSION = 3;
  const memory = new Map();     // גיבוי בזיכרון כשאין localStorage כלל
  let available = probe();

  function probe() {
    try {
      const k = PREFIX + '__probe';
      localStorage.setItem(k, '1');
      localStorage.removeItem(k);
      return true;
    } catch { return false; }
  }

  const isQuotaError = (e) =>
    !!e && (e.name === 'QuotaExceededError' ||
            e.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
            e.code === 22 || e.code === 1014);

  function read(key, fallback) {
    try {
      const raw = available ? localStorage.getItem(PREFIX + key) : memory.get(key);
      if (raw == null) return fallback;
      const obj = JSON.parse(raw);
      if (!obj || typeof obj !== 'object') return fallback;
      // רשומה שנכתבה בגרסה חדשה יותר — לא נוגעים בה, רק מתעלמים
      if (obj.v > VERSION) return fallback;
      return obj;
    } catch {
      return fallback;   // JSON פגום לעולם לא יפיל את הממשק
    }
  }

  function write(key, value) {
    const record = { ...value, v: VERSION, updatedAt: Date.now() };
    const raw = JSON.stringify(record);
    memory.set(key, raw);
    if (!available) return { ok: false, reason: 'unavailable' };

    try {
      localStorage.setItem(PREFIX + key, raw);
      return { ok: true };
    } catch (e) {
      if (!isQuotaError(e)) return { ok: false, reason: 'error' };
      if (reclaim(key)) {
        try { localStorage.setItem(PREFIX + key, raw); return { ok: true }; }
        catch { /* ממשיכים להודעה */ }
      }
      return { ok: false, reason: 'quota' };
    }
  }

  /**
   * פינוי מקום. סדר הפעולות מכוון: מוחקים רק מידע שניתן לשחזר.
   * הערות וסימניות לעולם לא נמחקות אוטומטית.
   */
  function reclaim(exceptKey) {
    if (!available) return false;
    const NINETY_DAYS = 90 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const states = [];

    for (const fullKey of Object.keys(localStorage)) {
      if (!fullKey.startsWith(PREFIX) || !fullKey.endsWith(':state')) continue;
      const key = fullKey.slice(PREFIX.length);
      if (key === exceptKey) continue;
      try {
        const rec = JSON.parse(localStorage.getItem(fullKey));
        states.push({ fullKey, openedAt: rec?.openedAt || 0 });
      } catch { states.push({ fullKey, openedAt: 0 }); }
    }

    let freed = false;
    // שלב 1: מצבים ישנים מ-90 יום
    for (const s of states) {
      if (now - s.openedAt > NINETY_DAYS) {
        try { localStorage.removeItem(s.fullKey); freed = true; } catch {}
      }
    }
    if (freed) return true;

    // שלב 2: הכי פחות שימושי קודם (LRU)
    states.sort((a, b) => a.openedAt - b.openedAt);
    if (states.length) {
      try { localStorage.removeItem(states[0].fullKey); return true; } catch {}
    }
    return false;
  }

  function remove(key) {
    memory.delete(key);
    if (!available) return;
    try { localStorage.removeItem(PREFIX + key); } catch {}
  }

  // ---- ממשק ברמה גבוהה ----
  return {
    get available() { return available; },

    settings() {
      return read('settings', { theme: 'auto', readerMode: 'auto' });
    },
    saveSettings(patch) {
      return write('settings', { ...this.settings(), ...patch });
    },

    state(bookId) {
      return read(`book:${bookId}:state`, { lastPage: 1, totalPages: 0, openedAt: 0 });
    },
    saveState(bookId, patch) {
      return write(`book:${bookId}:state`, { ...this.state(bookId), ...patch });
    },

    notes(bookId) { return read(`book:${bookId}:notes`, { text: '' }).text || ''; },
    saveNotes(bookId, text) { return write(`book:${bookId}:notes`, { text }); },

    marks(bookId) {
      const rec = read(`book:${bookId}:marks`, { pages: [] });
      return new Set(Array.isArray(rec.pages) ? rec.pages : []);
    },
    saveMarks(bookId, set) {
      const pages = Array.from(set).filter(Number.isInteger).sort((a, b) => a - b);
      return write(`book:${bookId}:marks`, { pages });
    },

    remove,
  };
})();

/* ============================================================================
 * §3 — נושא בהיר/כהה
 * ========================================================================== */

const Theme = {
  init() {
    const saved = Store.settings().theme;
    // ללא אנימציה באתחול — המנורה פשוט כבר במצב שבו היא הייתה
    this.apply(saved === 'light' || saved === 'dark' ? saved : this.systemPref(), { animate: false });
    for (const btn of $$('[data-lamp-toggle]')) {
      btn.addEventListener('click', () => this.toggle());
    }

    // אם המשתמש לא בחר במפורש — עוקבים אחרי מערכת ההפעלה
    matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', (e) => {
      if (Store.settings().theme === 'auto') this.apply(e.matches ? 'dark' : 'light');
    });

    // סנכרון בין לשוניות
    addEventListener('storage', (e) => {
      if (e.key === 'dl:settings') {
        const t = Store.settings().theme;
        this.apply(t === 'auto' ? this.systemPref() : t);
      }
    });
  },

  systemPref() {
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  },

  /**
   * המנורה היא מקור האור של הדף: דולקת = נושא בהיר, כבויה = כהה.
   * מצב המנורה מיוצג ב-data-lamp על <html>, וה-CSS מנגן ממנו הכל —
   * הזוהר, קון האור, חוט הלהט, ושרשרת המשיכה.
   */
  apply(mode, { animate = true } = {}) {
    const root = document.documentElement;
    const dark = mode === 'dark';

    root.setAttribute('data-theme', mode);
    root.setAttribute('data-lamp', dark ? 'off' : 'on');

    // הבהוב ההדלקה וזוהר השארית בכיבוי רצים רק במעבר יזום, לא בטעינה
    if (animate) {
      root.setAttribute('data-lamp-anim', dark ? 'cooling' : 'warming');
      clearTimeout(this._animTimer);
      this._animTimer = setTimeout(() => root.removeAttribute('data-lamp-anim'), 900);
    }

    for (const btn of $$('[data-lamp-toggle]')) {
      btn.setAttribute('aria-pressed', String(!dark));   // לחוץ = דולקת
      btn.setAttribute('aria-label', dark ? 'הדלקת מנורת הספרייה' : 'כיבוי מנורת הספרייה');
      btn.title = dark ? 'הדלקת המנורה' : 'כיבוי המנורה';
      const label = $('[data-lamp-label]', btn);
      if (label) label.textContent = dark ? 'הדלק אור' : 'כבה אור';
    }

    document.querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', dark ? '#120C08' : '#4A2418');
  },

  toggle() {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    this.apply(next);
    Store.saveSettings({ theme: next });
  },
};

/* ============================================================================
 * §4 — מדף הספרים
 * ========================================================================== */

const Shelf = {
  render() {
    const host = $('#library');
    host.replaceChildren();

    if (!CATALOG.length) {
      host.append(this.emptyShelf('הקורסים שלי'));
      return;
    }

    // קיבוץ לפי מדפים, תוך שמירה על סדר ההופעה במערך
    const groups = new Map();
    for (const book of CATALOG) {
      const name = book.shelf || 'הקורסים שלי';
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name).push(book);
    }

    for (const [name, books] of groups) {
      host.append(this.buildShelf(name, books));
    }
  },

  emptyShelf(name) {
    const section = document.createElement('section');
    section.className = 'shelf';
    section.innerHTML = `
      <div class="shelf__books">
        <p class="shelf__empty">המדף עדיין ריק — הוסף את ספרך הראשון למערך CATALOG שב-script.js</p>
      </div>
      <div class="shelf__plank wood-grain"></div>`;
    return section;
  },

  buildShelf(name, books) {
    const section = document.createElement('section');
    section.className = 'shelf';
    section.setAttribute('aria-label', name);

    const row = document.createElement('div');
    row.className = 'shelf__books';

    for (const book of books) row.append(this.buildSpine(book));

    const plank = document.createElement('div');
    plank.className = 'shelf__plank wood-grain';

    section.append(row, plank);
    return section;
  },

  /**
   * הספר נשלף מהמדף ואז נפתח.
   * מומש ב-CSS 3D + Web Animations API שמובנים בדפדפן. Framer Motion
   * הייתה דורשת React ושלב בנייה שלמים בשביל אנימציה אחת.
   * מיקום השדרה נשמר כמשתנה CSS, כדי שהכרטיסייה "תיפתח" בדיוק ממנו
   * כמו כריכה שנפתחת על ציר.
   */
  pullOut(spineEl, book) {
    const go = () => Router.go(`#/book/${book.id}`);

    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || typeof spineEl.animate !== 'function') return go();

    const r = spineEl.getBoundingClientRect();
    document.documentElement.style.setProperty('--open-x', `${Math.round(r.left + r.width / 2)}px`);
    document.documentElement.style.setProperty('--open-y', `${Math.round(r.top + r.height / 2)}px`);

    spineEl.classList.add('is-pulling');
    const pull = spineEl.animate([
      { transform: 'translateY(0) rotate(0) scale(1)' },
      { transform: 'translateY(-26px) rotate(-2.5deg) scale(1.05)', offset: .55 },
      { transform: 'translateY(-18px) rotate(0) scale(1.02)' },
    ], { duration: 340, easing: 'cubic-bezier(.22,.9,.3,1.15)', fill: 'forwards' });

    pull.finished.then(go).catch(go).finally(() => {
      setTimeout(() => {
        spineEl.classList.remove('is-pulling');
        try { pull.cancel(); } catch {}
      }, 420);
    });
  },

  buildSpine(book) {
    const state = Store.state(book.id);
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'book';
    el.dataset.bookId = book.id;

    const spine = book.spine || {};
    el.style.setProperty('--spine-color', spine.color || '#6E1D2B');
    el.style.setProperty('--spine-h', `${Math.round(272 * (spine.height || 1))}px`);
    el.setAttribute('aria-label',
      `${book.title}${state.lastPage > 1 ? ` — נקרא עד עמוד ${state.lastPage}` : ''}`);

    const title = document.createElement('span');
    title.className = 'book__title';
    title.textContent = book.title;
    el.append(title);

    // סרט קטן מסמן ספר שכבר התחלת לקרוא
    if (state.lastPage > 1) {
      const ribbon = document.createElement('span');
      ribbon.className = 'book__ribbon';
      el.append(ribbon);
    }

    el.addEventListener('click', () => this.pullOut(el, book));
    return el;
  },
};

/* ============================================================================
 * §5 — שכבות מודאליות וניהול פוקוס
 * ========================================================================== */

const Layers = {
  stack: [],

  open(layerEl, { labelledBy } = {}) {
    if (this.stack.includes(layerEl)) return;
    this.stack.push({ el: layerEl, restoreTo: document.activeElement });
    layerEl.hidden = false;

    const dialog = $('[role="dialog"]', layerEl) || layerEl;
    if (labelledBy) dialog.setAttribute('aria-labelledby', labelledBy);

    this.setBackgroundInert(true);
    ($('[data-autofocus]', dialog) || dialog).focus({ preventScroll: true });
  },

  close(layerEl) {
    const i = this.stack.findIndex((f) => f.el === layerEl);
    if (i === -1) return;
    const [frame] = this.stack.splice(i, 1);
    layerEl.hidden = true;

    if (!this.stack.length) this.setBackgroundInert(false);

    // אם האלמנט המקורי הוסר מה-DOM בינתיים, הפוקוס היה נתקע על <body>
    const target = frame.restoreTo?.isConnected ? frame.restoreTo : $('#shelf-view');
    target?.focus({ preventScroll: true });
    if (frame.restoreTo?.isConnected) {
      frame.restoreTo.scrollIntoView({ block: 'nearest' });
    }
  },

  closeTop() {
    const top = this.stack[this.stack.length - 1];
    if (top) this.close(top.el);
  },

  get topEl() { return this.stack[this.stack.length - 1]?.el || null; },

  setBackgroundInert(on) {
    const shelf = $('#shelf-view');
    if (!shelf) return;
    if ('inert' in HTMLElement.prototype) {
      shelf.inert = on;
    } else {
      shelf.setAttribute('aria-hidden', String(on));
      shelf.style.pointerEvents = on ? 'none' : '';
    }
  },

  /** לוכד את מקש Tab בתוך השכבה העליונה. */
  trapTab(e) {
    const layer = this.topEl;
    if (!layer) return;
    const dialog = $('[role="dialog"]', layer) || layer;

    const focusables = $$(
      'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      dialog
    ).filter((el) => el.offsetParent !== null || el.getClientRects().length);

    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault(); first.focus();
    }
  },
};

/** כרטיסיית הקטלוג */
const Card = {
  book: null,

  show(book) {
    this.book = book;
    const layer = $('#card-layer');

    $('[data-card-title]').textContent = book.title;
    $('[data-card-call]').textContent = this.callNumber(book);

    const list = $('[data-card-sources]');
    list.replaceChildren();
    const sources = Array.isArray(book.sources) ? book.sources.filter(Boolean) : [];
    if (sources.length) {
      for (const src of sources) {
        const li = document.createElement('li');
        li.textContent = src;
        list.append(li);
      }
    } else {
      const li = document.createElement('li');
      li.className = 'is-empty';
      li.textContent = 'טרם הוזנו מקורות לספר זה.';
      list.append(li);
    }

    const state = Store.state(book.id);
    const marks = Store.marks(book.id);
    const bits = [];
    if (state.lastPage > 1) bits.push(`נקרא עד עמוד ${state.lastPage}`);
    if (marks.size) bits.push(`${marks.size} סימניות`);
    if (Store.notes(book.id).trim()) bits.push('יש הערות בפנקס');
    if (book.note) bits.push(book.note);
    $('[data-card-meta]').textContent = bits.join(' · ');

    $('[data-card-start]').onclick = () => {
      Router.go(`#/book/${book.id}/read/${Math.max(1, state.lastPage || 1)}`);
    };

    Layers.open(layer);
  },

  hide() { Layers.close($('#card-layer')); },

  /** מספר קטלוג דקורטיבי, יציב לכל ספר. */
  callNumber(book) {
    let h = 0;
    for (let i = 0; i < book.id.length; i++) h = (h * 31 + book.id.charCodeAt(i)) >>> 0;
    return `${String.fromCharCode(65 + (h % 26))}${String.fromCharCode(65 + ((h >> 5) % 26))}·${100 + (h % 900)}`;
  },
};

/* ============================================================================
 * §6 — BookSource: עטיפה ל-PDF.js
 * ----------------------------------------------------------------------------
 *  אחראי על: פתיחת המסמך, מדידת יחס העמודים, ציור עמוד לקנבס, ותור עיבוד
 *  סדרתי. אינו יודע דבר על דפדוף או גלילה — שתי התצוגות משתמשות בו כמו שהוא.
 * ========================================================================== */

/**
 * PDF.js נטען כמודול ESM (ראו vendor/pdfjs/pdfjs-init.mjs), ומודולים נטענים
 * באופן אסינכרוני — אי אפשר להניח שהוא כבר קיים כשהקובץ הזה רץ. לכן ממתינים
 * לו בעצלתיים, רק כשבאמת פותחים ספר, במקום לתפוס הפניה בזמן הטעינה.
 */
let _pdfjsWait = null;

function whenPdfjsReady() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if (_pdfjsWait) return _pdfjsWait;

  _pdfjsWait = new Promise((resolve, reject) => {
    const settle = () => resolve(window.pdfjsLib);
    window.addEventListener('pdfjs-ready', settle, { once: true });
    setTimeout(() => {
      if (window.pdfjsLib) settle();
      else reject(Object.assign(new Error('pdfjs-missing'), { code: 'pdfjs-missing' }));
    }, 15000);
  });
  return _pdfjsWait;
}

/* מגבלות זיכרון. iOS מגביל את סך שטח הקנבסים בדף ולכן שם התקרה נמוכה,
   אבל בדסקטופ תקרה של 4MP הייתה נכנסת לפעולה כבר בעלה ברוחב ~840px
   במסך Retina ומורידה את החדות ב-4%. 6MP מכסה מסך רחב ב-DPR 2 בלי
   להעמיס: רק הכפולה הנוכחית ושכניה הקרובים מוחזקים בזיכרון. */
const TOUCH_DEVICE = matchMedia('(hover: none)').matches;
const MAX_CANVAS_PX = TOUCH_DEVICE ? 2_500_000 : 6_000_000;

/**
 * מצייר עמוד PDF לתוך קנבס, בהתאמה לצפיפות המסך.
 * מחזיר ידית עם cancel() כדי שאפשר יהיה לבטל ציור באמצע.
 */
function renderPageToCanvas(doc, pageNum, canvas, boxW, boxH) {
  let cancelled = false;
  let renderTask = null;

  const promise = (async () => {
    const page = await doc.getPage(pageNum);
    if (cancelled) { page.cleanup(); return null; }

    // getViewport כבר מחיל את סיבוב העמוד (/Rotate) — אין להוסיף rotation ידנית
    const base = page.getViewport({ scale: 1 });

    // התאמה "letterbox": העמוד נכנס בשלמותו לתוך תיבת העלה
    const fit = Math.min(boxW / base.width, boxH / base.height);

    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let scale = fit * dpr;
    let viewport = page.getViewport({ scale });

    // תקרת פיקסלים — מונע קנבסים ריקים במכשירים ניידים
    const px = viewport.width * viewport.height;
    if (px > MAX_CANVAS_PX) {
      scale *= Math.sqrt(MAX_CANVAS_PX / px);
      dpr = scale / fit;
      viewport = page.getViewport({ scale });
    }

    // שני גדלים שונים: מאגר הפיקסלים מול תיבת התצוגה ב-CSS
    canvas.width  = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));

    /* תיבת התצוגה: כשיחס העמוד תואם את יחס העלה (המקרה הרגיל — תיבת העלה
     * נגזרת מאותה מדידה), הקנבס ממלא את העלה מקצה לקצה. אחרת נשארו סרגלים
     * בצדדים, והם שיצרו רווח נראה לעין בשדרה בין שני עמודי הכפולה.
     * עמוד בגודל חריג עדיין מקבל התאמה פנימית כדי לא להימתח. */
    const boxAspect  = boxW / boxH;
    const pageAspect = base.width / base.height;
    const fits = Math.abs(pageAspect - boxAspect) / boxAspect < 0.015;
    if (fits) {
      canvas.style.width  = '100%';
      canvas.style.height = '100%';
    } else {
      canvas.style.width  = `${Math.floor(viewport.width  / dpr)}px`;
      canvas.style.height = `${Math.floor(viewport.height / dpr)}px`;
    }

    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.fillStyle = '#F4E8D0';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    renderTask = page.render({ canvasContext: ctx, viewport, background: '#F4E8D0' });
    try {
      await renderTask.promise;
    } catch (err) {
      if (err?.name !== 'RenderingCancelledException') throw err;
      return null;
    } finally {
      renderTask = null;
      page.cleanup();
    }

    canvas.dataset.rendered = String(pageNum);
    return { aspect: base.width / base.height };
  })();

  return {
    promise,
    cancel() {
      cancelled = true;
      try { renderTask?.cancel(); } catch {}
    },
  };
}

class BookSource {
  constructor(book, doc, metrics) {
    this.book = book;
    this.doc = doc;
    this.numPages = doc.numPages;
    this.metrics = metrics;       // { aspect, boxW, boxH, uniform }
    this._queue = [];
    this._running = false;
  }

  static async open(book, onProgress) {
    const PDFJS = await whenPdfjsReady();

    const task = PDFJS.getDocument({
      url: book.file,
      standardFontDataUrl: 'vendor/pdfjs/standard_fonts/',

      /* ⚠️ אל תסירו את השורה הזו.
       * כברירת מחדל PDF.js מזריק את הגופנים המוטמעים ב-PDF כ-@font-face
       * ומצייר טקסט דרך ctx.font. אם הזרקת הגופן נכשלת — בגלל מדיניות CSP
       * (font-src), בגלל FontFaceSet חסום, או בכל סיבה אחרת — הדפדפן מחליף
       * בשקט לגופן חלופי. צורות האותיות עדיין נראות נכון, אבל רוחבי הקידום
       * הם של הגופן החלופי, והתוצאה בעברית היא רווחים בתוך מילים.
       * disableFontFace גורם ל-PDF.js לצייר כל סימן כנתיב וקטורי מתוך הגופן
       * המוטמע עצמו — מדויק תמיד, וחסין לחלוטין למדיניות הגופנים של הדפדפן.
       * נמדד: תוספת של כ-5ms לעמוד, בתוך תחום הרעש. */
      disableFontFace: true,
      // טעינה מדורגת: מורידים רק את מה שקוראים בפועל
      disableStream: false,
      disableRange: false,
      disableAutoFetch: true,
      rangeChunkSize: 65536,
    });
    if (onProgress) task.onProgress = onProgress;

    const doc = await task.promise;
    const metrics = await BookSource.measure(doc);
    return new BookSource(book, doc, metrics);
  }

  /**
   * דוגם כשבעה עמודים כדי לקבוע את יחס הגובה-רוחב של תיבת העלה.
   * חשוב לדגום גם עמוד 1 וגם עמוד 2 — בכריכות סרוקות הם שונים זה מזה,
   * ועמוד 1 לבדו הוא הדגימה הכי מטעה שיש.
   */
  static async measure(doc) {
    const n = doc.numPages;
    const probes = [...new Set([1, 2, 3, n >> 1, (n >> 1) + 1, n - 1, n])]
      .filter((p) => p >= 1 && p <= n);

    const samples = [];
    for (const p of probes) {
      try {
        const page = await doc.getPage(p);
        const v = page.getViewport({ scale: 1 });
        samples.push({ w: v.width, h: v.height, a: v.width / v.height });
        page.cleanup();
      } catch { /* עמוד פגום — מדלגים */ }
    }
    if (!samples.length) return { aspect: 0.707, boxW: 595, boxH: 842, uniform: true };

    samples.sort((x, y) => x.a - y.a);
    const median = samples[samples.length >> 1];
    return {
      aspect: median.a,
      boxW: Math.round(median.w),
      boxH: Math.round(median.h),
      uniform: samples.every((s) => Math.abs(s.a - median.a) < 0.01),
    };
  }

  /** מוסיף בקשת ציור לתור. עדיפות נמוכה יותר = חשוב יותר. */
  enqueue(job) {
    this._queue.push(job);
    this._queue.sort((a, b) => a.priority - b.priority);
    this._drain();
  }

  clearQueue() { this._queue.length = 0; }

  async _drain() {
    if (this._running) return;
    this._running = true;
    try {
      while (this._queue.length) {
        const job = this._queue.shift();
        try { await job.run(); } catch (e) { console.warn('[reader] render failed', e); }
      }
    } finally {
      this._running = false;
    }
  }

  destroy() {
    this.clearQueue();
    try { this.doc.cleanup(); } catch {}
    try { this.doc.destroy(); } catch {}
  }
}

/* ============================================================================
 * §7 — ScrollReader: תצוגת גלילה
 * ----------------------------------------------------------------------------
 *  זו התצוגה הבסיסית. היא תלויה ב-PDF.js בלבד ובשום ספרייה אחרת, ולכן היא
 *  גם מצב הגיבוי כשהדפדוף נכשל.
 * ========================================================================== */

class ScrollReader {
  constructor() {
    this.leaves = [];
    this.live = new Map();       // pageNum -> { handle, canvas }
    this.observer = null;
    this.current = 1;
    // חלון השתקה: מיד אחרי קפיצה מפורשת, ה-IntersectionObserver עדיין
    // מדווח על העמוד הישן ואסור לו לדרוס את העמוד שביקשנו.
    this._lockUntil = 0;
  }

  _emit(page) {
    this.current = page;
    this.onPageChange?.(page);
  }

  async mount(container, { source, startPage = 1, onPageChange }) {
    this.source = source;
    this.onPageChange = onPageChange;
    this.container = container;

    const wrap = document.createElement('div');
    wrap.className = 'scroller';

    for (let p = 1; p <= source.numPages; p++) {
      const leaf = buildLeafElement({ page: p, aspect: source.metrics.aspect });
      wrap.append(leaf);
      this.leaves.push(leaf);
    }
    container.replaceChildren(wrap);
    this.wrap = wrap;

    this.observer = new IntersectionObserver(
      (entries) => this.onIntersect(entries),
      { root: container, rootMargin: '200% 0px', threshold: [0, 0.25, 0.6] }
    );
    for (const leaf of this.leaves) this.observer.observe(leaf);

    this.goTo(startPage, { animate: false });
  }

  onIntersect(entries) {
    let best = null;
    for (const entry of entries) {
      const page = Number(entry.target.dataset.page);
      if (entry.isIntersecting) this.ensureRendered(page);
      else this.evict(page);

      if (entry.isIntersecting && entry.intersectionRatio > 0.25) {
        if (!best || entry.intersectionRatio > best.ratio) {
          best = { page, ratio: entry.intersectionRatio };
        }
      }
    }
    if (best && best.page !== this.current && Date.now() >= this._lockUntil) {
      this._emit(best.page);
    }
  }

  ensureRendered(page) {
    if (this.live.has(page)) return;
    const leaf = this.leaves[page - 1];
    if (!leaf) return;

    const canvas = $('.leaf-canvas', leaf);
    const rect = leaf.getBoundingClientRect();
    const boxW = Math.max(220, Math.round(rect.width || 820));
    const boxH = Math.round(boxW / (this.source.metrics.aspect || 0.707));

    const entry = { handle: null, canvas };
    this.live.set(page, entry);

    this.source.enqueue({
      priority: Math.abs(page - this.current),
      run: async () => {
        if (!this.live.has(page)) return;
        entry.handle = renderPageToCanvas(this.source.doc, page, canvas, boxW, boxH);
        const res = await entry.handle.promise;
        if (res) leaf.classList.remove('is-placeholder');
      },
    });
  }

  evict(page) {
    const entry = this.live.get(page);
    if (!entry) return;
    entry.handle?.cancel();
    entry.canvas.width = 0;
    entry.canvas.height = 0;
    entry.canvas.removeAttribute('style');
    delete entry.canvas.dataset.rendered;
    this.leaves[page - 1]?.classList.add('is-placeholder');
    this.live.delete(page);
  }

  goTo(page, { animate = true } = {}) {
    const leaf = this.leaves[clamp(page, 1, this.leaves.length) - 1];
    if (!leaf) return;
    this._lockUntil = Date.now() + 900;
    this._emit(page);
    leaf.scrollIntoView({ behavior: animate ? 'smooth' : 'auto', block: 'start' });
    this.ensureRendered(page);
  }

  advance() { this.goTo(Math.min(this.current + 1, this.leaves.length)); }
  retreat() { this.goTo(Math.max(this.current - 1, 1)); }

  getCurrentPage() { return this.current; }

  /** מסמן/מבטל סרט סימנייה על עמוד. */
  setBookmark(page, on) { toggleLeafRibbon(this.leaves[page - 1], on); }

  onResize() {
    // ציור מחדש ברזולוציה שמתאימה לרוחב החדש
    for (const page of Array.from(this.live.keys())) this.evict(page);
    this.ensureRendered(this.current);
  }

  destroy() {
    this.observer?.disconnect();
    for (const page of Array.from(this.live.keys())) this.evict(page);
    this.source?.clearQueue();
    this.container?.replaceChildren();
    this.leaves = [];
  }
}

/* ============================================================================
 * §8 — FlipReader: תצוגת דפדוף (StPageFlip)
 * ----------------------------------------------------------------------------
 *  ✦ מדוע העמודים מוזנים בסדר הפוך ✦
 *
 *  StPageFlip בנוי לספר לועזי (כריכה משמאל). הפיתוי הוא "לשקף" את הספר
 *  עם transform: scaleX(-1) — אבל זה שבור: הספרייה מחשבת את מיקום האצבע
 *  לפי getBoundingClientRect, ושיקוף לא משנה את המלבן הזה. התוצאה:
 *  התצוגה מתהפכת אבל הקלט לא, והעמוד "נתלש" מהצד ההפוך לאצבע.
 *
 *  הפתרון הנכון: ספר עברי וספר לועזי הם אותו עצם פיזי שנקרא מהקצה השני.
 *  לכן מזינים את העלים בסדר הפוך ולא נוגעים ב-transform בכלל. כך:
 *    · הכריכה יושבת בימין
 *    · עמוד 1 מופיע בצד ימין
 *    · בכל כפולה, העמוד הימני הוא בעל המספר הנמוך
 *    · גרירת הקצה השמאלי מקדמת את הספר — בדיוק כמו בספר אמיתי
 *
 *  המחיר: flipNext של הספרייה הוא "אחורה" מבחינתנו. לכן עוטפים מיד.
 * ========================================================================== */

const PageFlipCtor = window.St?.PageFlip || window.PageFlip || null;

/**
 * בונה את תוכנית העלים: מיפוי דו-כיווני בין אינדקס עלה למספר עמוד.
 * StPageFlip מזווג עלים (0,1), (2,3)... כשהאינדקס הנמוך משמאל.
 * כדי שעמוד 1 יעמוד לבדו בסוף (כמו כריכה קדמית של ספר עברי) הוא חייב
 * לשבת באינדקס זוגי — ולכן כשמספר העמודים זוגי מוסיפים עלה ריק בהתחלה.
 */
function buildLeafPlan(numPages) {
  const plan = [];
  // StPageFlip מזווג עלים (0,1), (2,3)... כשהאינדקס הזוגי משמאל והאי-זוגי מימין.
  // עמוד 1 הוא הכריכה הקדמית של ספר עברי ולכן חייב לשבת מימין —
  // כלומר באינדקס אי-זוגי (וכך אכן יוצא מהחישוב שלמטה). העלה הריק שלפניו הוא בטנת הכריכה, בדיוק כמו בספר אמיתי.
  if (numPages % 2 === 0) plan.push(null);          // איזון זוגיות
  for (let p = numPages; p >= 2; p--) plan.push(p); // שאר העמודים בסדר הפוך
  plan.push(null);                                  // בטנת הכריכה (שמאל)
  plan.push(1);                                     // הכריכה עצמה (ימין)
  return plan;
}

class FlipReader {
  constructor() {
    this.live = new Map();        // leafIdx -> { handle, canvas }
    this.plan = [];
    this.pageToLeaf = new Map();
    this.leafEls = [];
    this.pageFlip = null;
    this.current = 1;
    this._renderedBox = null;
    this._reinitializing = false;
  }

  async mount(container, { source, startPage = 1, onPageChange }) {
    if (typeof PageFlipCtor !== 'function') {
      throw Object.assign(new Error('page-flip missing'), { code: 'flip-missing' });
    }

    this.source = source;
    this.onPageChange = onPageChange;
    this.container = container;

    this.plan = buildLeafPlan(source.numPages);
    this.pageToLeaf.clear();
    this.plan.forEach((page, idx) => { if (page != null) this.pageToLeaf.set(page, idx); });

    const zoomWrap = document.createElement('div');
    zoomWrap.className = 'stage__zoom';
    const host = document.createElement('div');
    host.id = 'flip-book';
    zoomWrap.append(host);
    container.replaceChildren(zoomWrap);
    this.host = host;

    this.buildLeaves();

    const box = this.measureBox();
    this.pageFlip = new PageFlipCtor(host, {
      width: box.w,
      height: box.h,
      size: 'stretch',
      minWidth: 240,
      maxWidth: 1500,
      minHeight: 320,
      maxHeight: 2000,
      showCover: false,          // אנחנו מנהלים עלים ריקים בעצמנו
      usePortrait: true,         // עלה בודד במסכים צרים
      autoSize: true,
      drawShadow: true,
      maxShadowOpacity: 0.5,
      flippingTime: 700,
      useMouseEvents: true,      // הגרירה נשארת — היא חלק מהחוויה
      showPageCorners: false,    // בלי הרמת פינה אוטומטית בריחוף
      mobileScrollSupport: false,
      swipeDistance: 30,
      clickEventForward: true,   // קליקים על button/a בתוך העלה לא הופכים דף
      disableFlipByClick: true,  // מעבר עמוד רק דרך החצים או גרירה
      startZIndex: 0,
    });

    // שעון עצר: תופס את המקרה שבו הספרייה נטענת, נבנית בלי שגיאה — ומציגה ריק
    const ready = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(
        Object.assign(new Error('flip init timeout'), { code: 'init-timeout' })), 4000);
      this.pageFlip.on('init', () => { clearTimeout(timer); resolve(); });
    });

    this.bindEvents();
    this.pageFlip.loadFromHTML(this.host.querySelectorAll('.leaf'));
    await ready;

    this.goTo(startPage, { animate: false });
    this.observeResize();
  }

  measureBox() {
    const aspect = this.source.metrics.aspect || 0.707;
    const h = 900;
    return { w: Math.round(h * aspect), h };
  }

  /**
   * מקור האמת היחיד לגודל העלה המוצג.
   *
   * ⚠️ אסור למדוד עלה בודד ב-getBoundingClientRect, משתי סיבות נפרדות:
   *   1. StPageFlip מסתיר כל עלה שאינו בכפולה הנוכחית ב-display:none,
   *      ואז המדידה מחזירה אפס — ונפילה לברירת מחדל קבועה ציירה כל
   *      עמוד שנחשף בדפדוף ברוחב 636 בלבד. זה היה מקור הטשטוש.
   *   2. getBoundingClientRect מחזיר את המלבן *אחרי* טרנספורם, ולכן
   *      בזום או באמצע דפדוף (עלה מסובב) הוא מחזיר מידות שגויות —
   *      וזה היה מקור החיתוך בשוליים.
   *
   * offsetWidth/offsetHeight הם מידות **פריסה**: הם חסינים לטרנספורם,
   * והבלוק של הספרייה תמיד מודד נכון גם כשעלים בודדים מוסתרים.
   */
  leafBox() {
    const block = this.host?.querySelector('.stf__block') || this.host;
    const cols = this.isSpread() ? 2 : 1;
    const w = Math.round((block?.offsetWidth || 0) / cols);
    const h = Math.round(block?.offsetHeight || 0);
    if (w > 40 && h > 40) return { w, h };
    return this.measureBox();   // רק לפני שהספרייה הספיקה למדוד בכלל
  }

  buildLeaves() {
    const frag = document.createDocumentFragment();
    this.leafEls = this.plan.map((page, idx) => {
      const leaf = buildLeafElement({ page, aspect: this.source.metrics.aspect, index: idx });
      frag.append(leaf);
      return leaf;
    });
    this.host.replaceChildren(frag);
  }

  bindEvents() {
    this.pageFlip.on('flip', (e) => {
      if (this._reinitializing) return;
      const idx = Number(e.data);
      this.reconcile(idx);
      // אם הכפולה החדשה כבר מכילה את העמוד הנוכחי (למשל אחרי קפיצה ידנית
      // לעמוד שיושב בצד שמאל) אין לדרוס אותו.
      const pages = this.spreadPages(idx);
      if (pages.includes(this.current)) return;
      if (pages.length) this._emit(pages[0]);
    });

    // מתחילים לצייר ברגע שהאצבע מקפלת פינה, לא כשהדף כבר התהפך
    this.pageFlip.on('changeState', (e) => {
      // ברגע שהספר בתנועה הוא כבר לא סגור, ולכן מרכוז "ספר סגור" יורד
      // מיד. חייבים כאן ולא באירוע flip: האירוע מגיע כ-200ms אחרי תחילת
      // האנימציה, ובפרק הזמן הזה העמוד שנחשף היה מוזז ונחתך בקצה השמאלי.
      if (e.data !== 'read') this.host?.classList.remove('is-closed');
      // חזרה למנוחה (גם אחרי קיפול פינה שלא הושלם) — לחשב את המצב מחדש.
      if (e.data === 'user_fold' || e.data === 'fold_corner' || e.data === 'read') {
        this.reconcile(this.pageFlip.getCurrentPageIndex());
      }
    });

    this.pageFlip.on('changeOrientation', () => this.onResize());
  }

  /**
   * מקור יחיד לעדכון העמוד הנוכחי.
   * ⚠️ חייב להודיע תמיד, גם כשהערך לא השתנה: goTo קובע את this.current
   * לפני שאירוע ה-flip מגיע, ובלי זה ההודעה הייתה נבלעת וה-URL והעמוד
   * השמור לא היו מתעדכנים אחרי קפיצה ידנית לעמוד.
   */
  _emit(page) {
    this.current = page;
    this.onPageChange?.(page);
  }

  /**
   * העמודים הנראים בכפולה שמסביב ל-idx, הימני קודם.
   * בעברית הקריאה מתחילה בעמוד הימני, ולכן הוא "העמוד הנוכחי".
   * עלים ריקים (בטנת כריכה) מסוננים החוצה.
   */
  spreadPages(idx) {
    const out = [];
    if (this.isSpread()) {
      const left = idx % 2 === 0 ? idx : idx - 1;
      if (this.plan[left + 1] != null) out.push(this.plan[left + 1]);   // ימין
      if (this.plan[left] != null) out.push(this.plan[left]);           // שמאל
    } else if (this.plan[idx] != null) {
      out.push(this.plan[idx]);
    }
    if (out.length) return out;
    // נחתנו על עלה ריק בלבד — לוקחים את העמוד הקרוב ביותר
    for (let d = 1; d < this.plan.length; d++) {
      if (this.plan[idx - d] != null) return [this.plan[idx - d]];
      if (this.plan[idx + d] != null) return [this.plan[idx + d]];
    }
    return out;
  }

  // ---- המרות: לעולם לא לכתוב חשבון אינדקסים בגוף הקוד ----
  idxOf(page)  { return this.pageToLeaf.has(page) ? this.pageToLeaf.get(page) : 0; }
  pageOf(idx)  { return this.plan[idx] ?? null; }

  /**
   * האם הספרייה מציגה כרגע עלה בודד (מסך צר).
   * חשוב לניווט — ראו את ההערה ב-advance().
   */
  isPortrait() {
    try { return this.pageFlip?.getOrientation() === 'portrait'; } catch { return false; }
  }

  // ⚠️ הכיוון הפוך מהספרייה — ראו ההסבר בראש הסעיף.
  //
  // ⚠️⚠️ ובמסך צר אי אפשר להשתמש ב-flipPrev בכלל. מקור האמת הוא הקוד
  // של הספרייה: flipPrev מדמה מגע בנקודה x=10, כלומר בחצי השמאלי של
  // תיבת הספר. בתצוגת פורטרט StPageFlip מציב את העלה היחיד בחצי הימני
  // (setLeftPage(null)), ולכן בנקודה הזו אין עמוד — והקריאה לא עושה
  // כלום. התוצאה: במובייל אפשר היה רק לחזור אחורה, לא להתקדם.
  // לכן במסך צר מנווטים לפי מספר עמוד, שם כל כפולה היא עמוד אחד ממילא.
  advance() {
    if (this.isPortrait()) { this.goTo(Math.min(this.current + 1, this.source.numPages)); return; }
    try { this.pageFlip.flipPrev('top'); } catch (e) { this.fail(e); }
  }
  retreat() {
    if (this.isPortrait()) { this.goTo(Math.max(this.current - 1, 1)); return; }
    try { this.pageFlip.flipNext('top'); } catch (e) { this.fail(e); }
  }

  goTo(page, { animate = true } = {}) {
    const idx = this.idxOf(clamp(page, 1, this.source.numPages));
    try {
      if (animate) this.pageFlip.flip(idx);
      else this.pageFlip.turnToPage(idx);
    } catch {
      try { this.pageFlip.turnToPage(idx); } catch (e) { this.fail(e); return; }
    }
    this._emit(page);
    this.reconcile(idx);
  }

  getCurrentPage() { return this.current; }

  fail(err) {
    console.warn('[reader] flip error', err);
    Reader.tripFallback('runtime-error');
  }

  /** מצייר את החלון שמסביב לכפולה הנוכחית ומפנה את מה שרחוק ממנה. */
  reconcile(centerIdx) {
    // ספר סגור: כשהכפולה הנוכחית מכילה רק את הכריכה, מסמנים את המארח
    // כדי ש-CSS יוסיף צל שמושיב את הספר על השולחן. הסימון יורד ברגע
    // שהספר נפתח, ולכן הצל לעולם לא מתערבב באנימציית הדפדוף.
    this.host?.classList.toggle('is-closed', this.spreadPages(centerIdx).length === 1);

    const RADIUS = 2, KEEP = TOUCH_DEVICE ? 3 : 4;
    const spread = this.isSpread() ? 1 : 0;
    const lo = Math.max(0, centerIdx - spread - RADIUS);
    const hi = Math.min(this.plan.length - 1, centerIdx + spread + RADIUS);
    const keepLo = Math.max(0, centerIdx - spread - KEEP);
    const keepHi = Math.min(this.plan.length - 1, centerIdx + spread + KEEP);

    for (const idx of Array.from(this.live.keys())) {
      if (idx < keepLo || idx > keepHi) this.evict(idx);
    }

    const order = [];
    for (let i = lo; i <= hi; i++) order.push(i);
    order.sort((a, b) => Math.abs(a - centerIdx) - Math.abs(b - centerIdx));
    for (const idx of order) this.ensureRendered(idx, Math.abs(idx - centerIdx));
  }

  isSpread() {
    try { return this.pageFlip.getOrientation() === 'landscape'; }
    catch { return false; }
  }

  ensureRendered(idx, priority = 0) {
    const page = this.plan[idx];
    if (page == null || this.live.has(idx)) return;

    const leaf = this.leafEls[idx];
    const canvas = $('.leaf-canvas', leaf);
    if (!canvas) return;

    // גודל אחיד לכל העלים שבחלון, כולל המוסתרים. מוכפל בזום כדי
    // שמאגר הפיקסלים יתאים לגודל שבו העמוד באמת מוצג על המסך.
    const box = this.leafBox();
    const zoom = Reader.zoom || 1;
    const boxW = Math.max(200, Math.round(box.w * zoom));
    const boxH = Math.max(260, Math.round(box.h * zoom));

    const entry = { handle: null, canvas };
    this.live.set(idx, entry);

    this.source.enqueue({
      priority,
      run: async () => {
        if (!this.live.has(idx)) return;
        entry.handle = renderPageToCanvas(this.source.doc, page, canvas, boxW, boxH);
        const res = await entry.handle.promise;
        if (!res) return;
        leaf.classList.remove('is-placeholder');
        // עמוד בגודל חריג מקבל מסגרת עדינה שמסבירה את השוליים
        if (Math.abs(res.aspect - this.source.metrics.aspect) > 0.05) {
          leaf.classList.add('leaf--odd-size');
        }
      },
    });
  }

  evict(idx) {
    const entry = this.live.get(idx);
    if (!entry) return;
    entry.handle?.cancel();
    entry.canvas.width = 0;
    entry.canvas.height = 0;
    entry.canvas.removeAttribute('style');
    delete entry.canvas.dataset.rendered;
    this.leafEls[idx]?.classList.add('is-placeholder');
    this.live.delete(idx);
  }

  setBookmark(page, on) {
    const idx = this.pageToLeaf.get(page);
    if (idx != null) toggleLeafRibbon(this.leafEls[idx], on);
  }

  observeResize() {
    this._ro = new ResizeObserver(this._onResize);
    this._ro.observe(this.container);
  }

  _onResize = debounce(() => this.onResize(), 200);

  /**
   * ה-CSS מותח את העלים, אבל הקנבסים לא מקבלים פיקסלים בקסם.
   * מחלקים את הרוחב ל"מדרגות" של 128px ומציירים מחדש רק כשהמדרגה משתנה.
   */
  onResize() {
    if (!this.pageFlip || this._reinitializing) return;

    /* הלוגיקה הקודמת מדדה container.clientWidth/2 וקיטלגה ל"מדרגות" של
     * 128px. היא התעלמה מריפוד הבמה, מ-maxWidth ומאילוץ הגובה — ושינוי
     * גובה בלבד (סיבוב מכשיר, שורת כתובת נעלמת) לא הפעיל ציור מחדש כלל.
     * כאן משווים את גודל העלה האמיתי שבו צויר, כולל הזום. */
    const box = this.leafBox();
    const zoom = Reader.zoom || 1;
    const wNow = box.w * zoom;
    const prev = this._renderedBox;
    if (prev && Math.abs(wNow - prev.w) / prev.w < 0.04) return;
    this._renderedBox = { w: wNow, h: box.h * zoom };

    for (const idx of Array.from(this.live.keys())) this.evict(idx);
    let idx = 0;
    try { idx = this.pageFlip.getCurrentPageIndex(); } catch {}
    this.reconcile(idx);
  }

  destroy() {
    this._ro?.disconnect();
    for (const idx of Array.from(this.live.keys())) this.evict(idx);
    this.source?.clearQueue();
    try { this.pageFlip?.destroy(); } catch {}
    this.pageFlip = null;
    // destroy() לא תמיד מנקה את עטיפות stf__ — מנקים ידנית
    this.container?.replaceChildren();
    this.leafEls = [];
  }
}

/* ---- בניית עלה, משותפת לשתי התצוגות ---- */

function buildLeafElement({ page, aspect, index }) {
  const leaf = document.createElement('div');
  leaf.className = 'leaf is-placeholder';
  if (index != null) leaf.dataset.idx = String(index);
  if (page == null) {
    leaf.dataset.blank = 'true';
  } else {
    leaf.dataset.page = String(page);
  }
  leaf.style.aspectRatio = String(aspect || 0.707);

  const inner = document.createElement('div');
  inner.className = 'leaf-inner';

  if (page != null) {
    const canvas = document.createElement('canvas');
    canvas.className = 'leaf-canvas';
    canvas.setAttribute('aria-hidden', 'true');

    // סימניית הבד. זה <button> בכוונה: clickEventForward של StPageFlip
    // מעביר קליקים על button/a במקום להפוך את הדף.
    const ribbon = document.createElement('button');
    ribbon.type = 'button';
    ribbon.className = 'bookmark-ribbon';
    ribbon.hidden = true;
    ribbon.setAttribute('aria-label', `הסרת הסימנייה מעמוד ${page}`);
    ribbon.addEventListener('click', (e) => {
      e.stopPropagation();
      Reader.toggleBookmark(page);
    });

    inner.append(canvas, ribbon);
  }

  leaf.append(inner);
  return leaf;
}

function toggleLeafRibbon(leaf, on) {
  if (!leaf) return;
  const ribbon = $('.bookmark-ribbon', leaf);
  if (ribbon) ribbon.hidden = !on;
}

/* ============================================================================
 * §9 — Reader: הבקר
 * ========================================================================== */

const Reader = {
  book: null,
  source: null,
  view: null,
  mode: 'flip',
  zoom: 1,
  marks: new Set(),
  flipFailed: false,
  _open: false,

  init() {
    const bar = $('#reader-view');

    bar.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const act = btn.dataset.act;
      e.preventDefault();
      this.handle(act);
    });

    $('[data-act="goto-form"]').addEventListener('submit', (e) => {
      e.preventDefault();
      const val = parseInt($('#page-input').value.replace(/\D/g, ''), 10);
      if (Number.isFinite(val)) this.goTo(val);
      $('#page-input').blur();
    });

    // פנקס המלומד — שמירה אוטומטית
    const ta = $('#notepad-text');
    this._saveNotes = debounce(() => {
      if (!this.book) return;
      const res = Store.saveNotes(this.book.id, ta.value);
      const status = $('[data-notepad-status]');
      status.classList.remove('is-saving');
      if (res.ok) {
        status.textContent = `נשמר · ${new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}`;
      } else if (res.reason === 'quota') {
        status.textContent = 'אין מקום לשמירה — העתק את ההערות';
      } else {
        status.textContent = 'השמירה לא זמינה בדפדפן זה';
      }
    }, 600, 5000);

    ta.addEventListener('input', () => {
      $('[data-notepad-status]').textContent = 'כותב…';
      $('[data-notepad-status]').classList.add('is-saving');
      this.updateNoteCount();
      this._saveNotes();
    });

    // שמירה בטוחה ביציאה — beforeunload לא אמין בנייד
    addEventListener('visibilitychange', () => { if (document.hidden) this.flushNotes(); });
    addEventListener('pagehide', () => this.flushNotes());

    // נפילה לתצוגת גלילה אם הספרייה מתפוצצת בזמן ריצה
    addEventListener('error', (e) => {
      if (!this._open || this.flipFailed) return;
      if (String(e.filename || '').includes('page-flip')) this.tripFallback('runtime-error');
    });
  },

  flushNotes() {
    if (!this.book || !this._open) return;
    try { Store.saveNotes(this.book.id, $('#notepad-text').value); } catch {}
  },

  async open(book, startPage) {
    this.book = book;
    this._open = true;
    this.marks = Store.marks(book.id);

    $('#reader-view').hidden = false;
    $('#shelf-view').hidden = true;
    $('[data-reader-title]').textContent = book.title;
    $('[data-notepad-book]').textContent = book.title;
    $('#notepad-text').value = Store.notes(book.id);
    this.updateNoteCount();

    $('#fault').hidden = true;
    $('#loader').hidden = false;
    $('[data-loader-progress]').textContent = '';
    $('#reader-stage').replaceChildren();

    try {
      this.source = await BookSource.open(book, ({ loaded, total }) => {
        if (total) {
          const pct = Math.round((loaded / total) * 100);
          $('[data-loader-progress]').textContent = `${pct}%`;
        }
      });
    } catch (err) {
      this.showFault(err);
      return;
    }

    $('[data-page-total]').textContent = String(this.source.numPages);
    Store.saveState(book.id, { totalPages: this.source.numPages, openedAt: Date.now() });

    const page = clamp(startPage || 1, 1, this.source.numPages);
    await this.mountView(this.decideMode(), page);

    $('#loader').hidden = true;
    $('#reader-stage').focus({ preventScroll: true });
  },

  decideMode() {
    const pref = Store.settings().readerMode || 'auto';
    if (pref === 'scroll') return 'scroll';
    if (this.flipFailed || window.__DL_FLIP_FAILED) return 'scroll';
    if (matchMedia('(prefers-reduced-motion: reduce)').matches && pref === 'auto') return 'scroll';
    if (typeof PageFlipCtor !== 'function') return 'scroll';
    return 'flip';
  },

  async mountView(mode, page) {
    try { this.view?.destroy(); } catch {}
    this.view = null;
    $('#reader-stage').replaceChildren();

    const Ctor = mode === 'flip' && !this.flipFailed ? FlipReader : ScrollReader;
    try {
      const view = new Ctor();
      await view.mount($('#reader-stage'), {
        source: this.source,
        startPage: page,
        onPageChange: (p) => this.onPageChange(p),
      });
      this.view = view;
      this.mode = Ctor === FlipReader ? 'flip' : 'scroll';
    } catch (err) {
      console.warn('[reader] mount failed', err);
      if (Ctor === FlipReader) {
        this.flipFailed = true;
        toast('עברנו לתצוגת גלילה', 'נסה שוב', () => {
          this.flipFailed = false;
          this.mountView('flip', this.currentPage());
        });
        await this.mountView('scroll', page);
        return;
      }
      this.showFault(err);
      return;
    }

    this.applyBookmarksToView();
    this.onPageChange(page);
    this.updateModeButton();
  },

  tripFallback(reason) {
    if (this.flipFailed || this.mode !== 'flip') return;
    this.flipFailed = true;
    console.warn('[reader] falling back to scroll:', reason);
    const page = this.currentPage();
    toast('עברנו לתצוגת גלילה', 'נסה שוב', () => {
      this.flipFailed = false;
      this.mountView('flip', this.currentPage());
    });
    this.mountView('scroll', page);
  },

  showFault(err) {
    $('#loader').hidden = true;
    const missing = err?.name === 'MissingPDFException' || err?.code === 'pdfjs-missing';
    $('[data-fault-title]').textContent = missing
      ? 'הספר לא נמצא על המדף'
      : 'לא הצלחנו לפתוח את הספר';
    $('[data-fault-text]').innerHTML = missing
      ? `הקובץ <code>${escapeHtml(this.book?.file || '')}</code> לא קיים. ` +
        'העלה אותו לתיקייה <code>books/</code> ובצע push מחדש.'
      : 'ייתכן שהקובץ פגום או שהחיבור נקטע. אפשר לנסות לרענן את הדף.';
    $('#fault').hidden = false;
    console.warn('[reader] open failed', err);
  },

  currentPage() {
    try { return this.view?.getCurrentPage() || 1; } catch { return 1; }
  },

  onPageChange(page) {
    $('#page-input').value = String(page);
    $('[data-act="bookmark"]').setAttribute('aria-pressed', String(this.marks.has(page)));
    announce(`עמוד ${page}`);
    this._persistPage(page);
    Router.replacePage(page);
  },

  _persistPage: debounce(function (page) {
    if (Reader.book) Store.saveState(Reader.book.id, { lastPage: page, openedAt: Date.now() });
  }, 400, 2000),

  handle(act) {
    switch (act) {
      case 'back':        Router.go('#/'); break;
      case 'next':        this.view?.advance(); break;
      case 'prev':        this.view?.retreat(); break;
      case 'bookmark':    this.toggleBookmark(this.currentPage()); break;
      case 'notes':       this.toggleNotes(); break;
      case 'notes-close': this.toggleNotes(false); break;
      case 'zoom-in':     this.setZoom(this.zoom + 0.15); break;
      case 'zoom-out':    this.setZoom(this.zoom - 0.15); break;
      case 'mode':        this.toggleMode(); break;
      case 'fullscreen':  this.toggleFullscreen(); break;
    }
  },

  toggleBookmark(page) {
    if (this.marks.has(page)) this.marks.delete(page);
    else this.marks.add(page);

    const on = this.marks.has(page);
    this.view?.setBookmark(page, on);
    if (page === this.currentPage()) {
      $('[data-act="bookmark"]').setAttribute('aria-pressed', String(on));
    }
    Store.saveMarks(this.book.id, this.marks);
    announce(on ? `נוספה סימנייה בעמוד ${page}` : `הוסרה הסימנייה מעמוד ${page}`);
  },

  applyBookmarksToView() {
    for (const page of this.marks) this.view?.setBookmark(page, true);
  },

  toggleNotes(force) {
    const pad = $('#notepad');
    const show = force != null ? force : pad.hidden;
    pad.hidden = !show;
    $('[data-act="notes"]').setAttribute('aria-expanded', String(show));
    if (show) $('#notepad-text').focus();
  },

  updateNoteCount() {
    const LIMIT = 100000;
    const len = $('#notepad-text').value.length;
    const el = $('[data-notepad-count]');
    el.textContent = `${len.toLocaleString('he-IL')} תווים`;
    el.classList.toggle('is-warn', len > LIMIT * 0.9);
  },

  setZoom(z) {
    this.zoom = clamp(Number(z.toFixed(2)), 0.6, 2.5);
    const wrap = $('.stage__zoom') || $('.scroller');
    if (wrap) wrap.style.setProperty('--zoom', String(this.zoom));
    if (this.mode === 'scroll') {
      const sc = $('.scroller');
      if (sc) sc.style.setProperty('--scroll-w', `${Math.round(820 * this.zoom)}px`);
    }
    // גם במצב ספר: בלי זה הזום רק מותח מפת פיקסלים קיימת ומטשטש אותה
    this.view?.onResize?.();
    announce(`תצוגה ${Math.round(this.zoom * 100)} אחוז`);
  },

  async toggleMode() {
    const page = this.currentPage();
    const next = this.mode === 'flip' ? 'scroll' : 'flip';
    if (next === 'flip') this.flipFailed = false;
    Store.saveSettings({ readerMode: next });
    await this.mountView(next, page);
  },

  updateModeButton() {
    const btn = $('[data-act="mode"]');
    if (!btn) return;
    const toScroll = this.mode === 'flip';
    btn.title = toScroll ? 'מעבר לתצוגת גלילה' : 'מעבר לתצוגת ספר';
    btn.setAttribute('aria-label', btn.title);
    /* ⚠️ לא textContent: זה היה מוחק את ה-SVG שבתוך הלחצן ומשאיר אותו ריק.
       מחליפים רק את ההפניה לסמל. */
    const use = $('[data-mode-icon]', btn);
    if (use) use.setAttribute('href', toScroll ? '#i-scroll' : '#i-book');
  },

  toggleFullscreen() {
    const el = $('#reader-view');
    if (!document.fullscreenElement) el.requestFullscreen?.().catch(() => {});
    else document.exitFullscreen?.();
  },

  goTo(page) {
    if (!this.source) return;
    this.view?.goTo(clamp(page, 1, this.source.numPages));
  },

  close() {
    this.flushNotes();
    this._open = false;
    try { this.view?.destroy(); } catch {}
    this.view = null;
    try { this.source?.destroy(); } catch {}
    this.source = null;
    this.book = null;
    $('#notepad').hidden = true;
    $('#reader-view').hidden = true;
    $('#shelf-view').hidden = false;
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  },
};

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ============================================================================
 * §10 — Router
 * ----------------------------------------------------------------------------
 *  location.hash הוא מקור האמת היחיד. פעולות בממשק לא משנות מצב ישירות —
 *  הן מנווטות, ומאזין ה-hashchange הוא שמחליף מצב. כך כפתור "אחורה" של
 *  הדפדפן נכון מעצם הבנייה ולא בזכות טלאים.
 * ========================================================================== */

const Router = {
  current: { name: 'shelf' },
  depth: 0,

  init() {
    addEventListener('hashchange', () => this.apply(this.parse()));
    this.apply(this.parse());
  },

  parse() {
    const m = /^#\/book\/([A-Za-z0-9_-]+)(?:\/read\/(\d+))?/.exec(location.hash || '');
    if (!m) return { name: 'shelf' };
    const book = CATALOG.find((b) => b.id === m[1]);
    if (!book) return { name: 'shelf' };
    return m[2]
      ? { name: 'reader', book, page: Math.max(1, parseInt(m[2], 10) || 1) }
      : { name: 'card', book };
  },

  go(hash) { this.depth++; location.hash = hash; },

  /** חזרה בהיררכיה — אבל בלי לזרוק את המשתמש מהאתר בכניסה ישירה. */
  back(fallbackHash) {
    if (this.depth > 0) { this.depth--; history.back(); }
    else history.replaceState(null, '', fallbackHash);
    if (this.depth < 0) this.depth = 0;
    // כשמשתמשים ב-replaceState אין hashchange — מפעילים ידנית
    if (location.hash === fallbackHash) this.apply(this.parse());
  },

  /** עדכון מספר העמוד ב-URL. replaceState ולא pushState בכוונה:
      אחרת קריאת 40 עמודים שווה 40 לחיצות "אחורה" כדי לצאת מהספר. */
  replacePage: debounce(function (page) {
    if (Router.current.name !== 'reader') return;
    const hash = `#/book/${Router.current.book.id}/read/${page}`;
    if (location.hash !== hash) {
      try { history.replaceState(null, '', hash); } catch {}
    }
  }, 500),

  async apply(next) {
    const prev = this.current;
    if (prev.name === next.name && prev.book?.id === next.book?.id && next.name !== 'reader') return;

    // יציאה מהמצב הקודם
    if (prev.name === 'card' && next.name !== 'card') Card.hide();
    if (prev.name === 'reader' && next.name !== 'reader') Reader.close();

    this.current = next;

    if (next.name === 'shelf') {
      Shelf.render();   // רענון כדי שסרטי "נקרא עד" יתעדכנו
      $('#shelf-view').focus?.({ preventScroll: true });
      return;
    }
    if (next.name === 'card') {
      Card.show(next.book);
      return;
    }
    if (next.name === 'reader') {
      // כבר בתוך אותו ספר — רק מדלגים לעמוד
      if (prev.name === 'reader' && prev.book?.id === next.book.id) {
        if (Reader.currentPage() !== next.page) Reader.goTo(next.page);
        return;
      }
      Card.hide();
      await Reader.open(next.book, next.page);
    }
  },
};

/* ============================================================================
 * §11 — מקלדת גלובלית
 * ========================================================================== */

function initKeyboard() {
  addEventListener('keydown', (e) => {
    const t = e.target;
    const typing = t?.closest?.('input, textarea, select, [contenteditable=""], [contenteditable="true"]');

    if (e.key === 'Tab' && Layers.topEl) { Layers.trapTab(e); return; }

    if (e.key === 'Escape') {
      // כל לחיצה מקלפת שכבה אחת בדיוק
      if (typing && t.matches('textarea')) { t.blur(); return; }
      if (typing && t.matches('input')) { t.blur(); return; }
      if (Layers.topEl) { e.preventDefault(); Layers.closeTop(); Router.back('#/'); return; }
      if (!$('#notepad').hidden) { e.preventDefault(); Reader.toggleNotes(false); return; }
      if (Router.current.name === 'reader') {
        e.preventDefault();
        Router.back(`#/book/${Router.current.book.id}`);
      }
      return;
    }

    if (typing) return;
    if (Router.current.name !== 'reader' || !Reader.view) return;

    switch (e.key) {
      // ⚠️ בעברית העמוד הבא נמצא משמאל. חץ שמאלה = קדימה.
      case 'ArrowLeft':
      case 'PageDown':
        e.preventDefault(); Reader.view.advance(); break;
      case 'ArrowRight':
      case 'PageUp':
        e.preventDefault(); Reader.view.retreat(); break;
      case ' ':
        e.preventDefault();
        e.shiftKey ? Reader.view.retreat() : Reader.view.advance(); break;
      case 'Home':
        e.preventDefault(); Reader.goTo(1); break;
      case 'End':
        e.preventDefault(); Reader.goTo(Reader.source?.numPages || 1); break;
      case 'b': case 'B': case 'ב':      // גם פריסת מקלדת עברית
        e.preventDefault(); Reader.toggleBookmark(Reader.currentPage()); break;
      case 'n': case 'N': case 'מ':
        e.preventDefault(); Reader.toggleNotes(); break;
    }
  });
}

/* ============================================================================
 * §12 — אתחול
 * ========================================================================== */

function init() {
  Theme.init();
  Shelf.render();
  Reader.init();
  initKeyboard();

  // סגירת שכבות בלחיצה על הרקע / כפתורי סגירה
  document.addEventListener('click', (e) => {
    if (!e.target.closest('[data-close-layer]')) return;
    const layer = e.target.closest('.overlay');
    if (!layer) return;
    Layers.close(layer);
    if (layer.id === 'card-layer') Router.back('#/');
  });

  $('#btn-about')?.addEventListener('click', () => Layers.open($('#about-layer')));

  whenPdfjsReady().catch(() => {
    console.error('[library] pdf.js לא נטען — בדוק את vendor/pdfjs/');
  });

  Router.init();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
