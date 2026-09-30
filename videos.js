/* ============================================================================
 * אוסף קלטות הוידאו של דן — חנות הווידאו שלצד אוסף ספרי הלמידה
 * ----------------------------------------------------------------------------
 * עמוד נפרד מהספרייה, בכוונה: הקורא של הספרים עובד ונבדק, ואין סיבה
 * שקוד וידאו יישב בתוכו. הקטלוג נטען מ-tapes.json.
 *
 * מבנה:
 *   §1 עזרים          §4 הכנסת הקלטת (אנימציה)
 *   §2 שמירה מקומית   §5 הנגן: טלוויזיה, מכשיר וידאו, פרקים
 *   §3 החנות          §6 ניתוב, מקלדת ואתחול
 *
 * ⚠️ איפה הסרטונים יושבים ולמה זה משנה:
 *   הקבצים גדולים מדי למאגר (GitHub חוסם מעל 100MB), ולכן הם מצורפים
 *   ל-Release. הכתובת github.com/.../releases/download/... מחזירה 302
 *   לכתובת חתומה ב-release-assets.githubusercontent.com, **שפגה אחרי 5
 *   דקות** (נמדד: 206 בדקה הרביעית, 618 בחמישית). הדפדפן ממשיך לבקש
 *   טווחים מהכתובת החתומה, ולכן קפיצה לפרק אחרי 5 דקות צפייה נכשלת.
 *   Player.recover() מבקש כתובת טרייה וחוזר לאותה נקודה — ראו שם.
 * ========================================================================== */

'use strict';

/* ============================================================================
 * §1 — עזרים
 * ========================================================================== */

const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** 83.4 → "1:23", 3725 → "1:02:05" */
function fmt(sec) {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  sec = Math.floor(sec);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = String(sec % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

/** זמן כמילים לקוראי מסך: "12 דקות ו-5 שניות" */
function spoken(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const parts = [];
  // ‏"1 שעות" נשמע שבור בקורא מסך — ביחיד אומרים "שעה", "דקה", "שנייה"
  if (h) parts.push(h === 1 ? 'שעה' : `${h} שעות`);
  if (m) parts.push(m === 1 ? 'דקה' : `${m} דקות`);
  if (s || !parts.length) parts.push(s === 1 ? 'שנייה' : `${s} שניות`);
  return parts.join(' ו-');
}

const minutes = (sec) => `${Math.max(1, Math.round((sec || 0) / 60))} דק׳`;

/**
 * כמה פרקים יש בקלטת — כמו שהקורא סופר אותם.
 * ⚠️ לא chapters.length: ברשימה יש גם "פתיחה", כותרות חלקים ו"סיום", והקופסה
 * של "יחסים בינלאומיים" הציגה "12 פרקים" בכותרת המשנה ו-"19 פרקים" מתחתיה.
 */
function chapterCount(tape) {
  const numbered = tape.chapters.filter((c) => /^פרק\s+\d+/.test(c.title)).length;
  return numbered || tape.chapters.length;
}

let announceTimer = null;
function announce(msg) {
  clearTimeout(announceTimer);
  announceTimer = setTimeout(() => { const el = $('#live-region'); if (el) el.textContent = msg; }, 300);
}

/* ============================================================================
 * §2 — שמירה מקומית
 * ----------------------------------------------------------------------------
 *  dl:tape:<id>:state     { v, time, duration, openedAt, updatedAt }
 *  dl:video-settings      { v, volume, muted }
 *
 *  ⚠️ אותו פורמט ואותו קידומת כמו בספרייה, בכוונה: Store.reclaim שם מפנה
 *  מקום כשהזיכרון מתמלא ומוחק רק מפתחות שמסתיימים ב-:state (מידע שניתן
 *  לשחזר). מיקום בקלטת הוא בדיוק כזה, ולכן הוא משתתף בפינוי. הערות
 *  המשתמש בספרייה לעולם לא יימחקו בגללו.
 * ========================================================================== */

const Saved = {
  VERSION: 3,
  read(key) {
    try {
      const obj = JSON.parse(localStorage.getItem(key));
      return obj && typeof obj === 'object' && !(obj.v > this.VERSION) ? obj : null;
    } catch { return null; }
  },
  write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify({ ...value, v: this.VERSION, updatedAt: Date.now() }));
      return true;
    } catch { return false; }    // אין מקום / מצב פרטי — הצפייה ממשיכה, רק בלי זיכרון
  },
  drop(key) { try { localStorage.removeItem(key); } catch {} },

  position(id) {
    const rec = this.read(`dl:tape:${id}:state`);
    return rec && Number.isFinite(rec.time) && rec.time > 0 ? rec.time : 0;
  },
  savePosition(id, time, duration) {
    // קלטת שכמעט נגמרה נחשבת "הוחזרה מגולגלת" — אין טעם להמשיך מ-10 שניות לפני הסוף.
    // ⚠️ השוליים יחסיים לאורך: 15 שניות קבועות בלעו סרטון קצר כולו, וכל מיקום נמחק.
    const tail = duration ? Math.min(15, duration * 0.05) : 0;
    if (!(time > 5) || (duration && time > duration - tail)) return this.drop(`dl:tape:${id}:state`);
    return this.write(`dl:tape:${id}:state`, { time: Math.round(time * 10) / 10, duration, openedAt: Date.now() });
  },
  settings() { return this.read('dl:video-settings') || { volume: 1, muted: false }; },
  saveSettings(patch) { this.write('dl:video-settings', { ...this.settings(), ...patch }); },
};

/* ============================================================================
 * §2א — מתג האור
 * ----------------------------------------------------------------------------
 * ⚠️ אותה הגדרה בדיוק כמו המנורה בספרייה: dl:settings.theme ('auto' /
 * 'light' / 'dark'), ואותו data-theme על <html>. כך מי שכיבה את האור
 * בספרייה מגיע לחנות חשוכה ולהפך. הכתיבה שומרת את שאר השדות של
 * הספרייה (readerMode, zoom) — דריסה של כל הרשומה הייתה מאפסת אותם.
 * ========================================================================== */

const Light = {
  saved() { return Saved.read('dl:settings')?.theme || 'auto'; },

  current() {
    const t = this.saved();
    if (t === 'light' || t === 'dark') return t;
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  },

  init() {
    this.apply(this.current());
    matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
      if (this.saved() === 'auto') this.apply(this.current());
    });
    // לשונית אחרת (למשל הספרייה) שינתה את האור
    addEventListener('storage', (e) => { if (e.key === 'dl:settings') this.apply(this.current()); });
    $$('[data-light-toggle]').forEach((b) => b.addEventListener('click', () => this.toggle()));
  },

  apply(mode, { flicker = false } = {}) {
    document.documentElement.dataset.theme = mode;
    const on = mode !== 'dark';
    for (const b of $$('[data-light-toggle]')) {
      // ‏role="switch" + aria-checked: קורא מסך אומר "האור בחנות, מתג, מופעל".
      // ‏הכיתוב על המתג מציג את *המצב* (דלוק/כבוי) ולא את הפעולה — ערבוב של
      // ‏השניים ("כבה אור" על מתג דולק) הוא בדיוק מה שבלבל.
      b.setAttribute('aria-checked', String(on));
      b.title = on ? 'כיבוי האור' : 'הדלקת האור';
      const state = $('[data-light-state]', b);
      if (state) state.textContent = on ? 'דלוק' : 'כבוי';
    }
    $('meta[name="theme-color"]')?.setAttribute('content', on ? '#0E2C8C' : '#040B2A');
    // נורות פלורסנט של חנות מהבהבות רגע לפני שהן נדלקות
    if (flicker && on && !reducedMotion() && document.body.animate) {
      document.body.animate([
        { filter: 'brightness(.35)' },
        { filter: 'brightness(1.1)', offset: 0.2 },
        { filter: 'brightness(.5)', offset: 0.35 },
        { filter: 'brightness(1.05)', offset: 0.6 },
        { filter: 'brightness(1)' },
      ], { duration: 520, easing: 'linear' });
    }
  },

  toggle() {
    const next = this.current() === 'dark' ? 'light' : 'dark';
    const settings = Saved.read('dl:settings') || { theme: 'auto', readerMode: 'auto', zoom: 1 };
    Saved.write('dl:settings', { ...settings, theme: next });
    this.apply(next, { flicker: true });
    announce(next === 'dark' ? 'האור כבה' : 'האור נדלק');
  },
};

/* ============================================================================
 * §3 — החנות
 * ========================================================================== */

const Catalog = {
  tapes: [],

  async load() {
    // ‏no-cache: הקטלוג משתנה כשדן מוסיף קלטת, והדפדפן חייב לשאול את השרת.
    // ‏(ב-_headers יש לו max-age=0, אבל עותק ישן של העמוד עלול לא לדעת זאת.)
    const res = await fetch('tapes.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`tapes.json → ${res.status}`);
    const data = await res.json();
    this.tapes = (Array.isArray(data?.tapes) ? data.tapes : [])
      .map((t) => this.normalize(t)).filter(Boolean);
    return this.tapes;
  },

  /** מסנן רשומה פגומה במקום לתת לה להפיל את כל המדף. */
  normalize(t) {
    if (!t || typeof t !== 'object') return null;
    if (typeof t.id !== 'string' || !/^[a-z0-9-]+$/.test(t.id)) return this.reject(t, 'id');
    if (typeof t.title !== 'string' || !t.title.trim()) return this.reject(t, 'title');
    if (typeof t.src !== 'string') return this.reject(t, 'src');
    // ⚠️ רק GitHub או האתר עצמו. כל מארח אחר ייחסם ממילא ב-media-src של
    // ה-CSP — עדיף לדלג עליו כאן בגלוי מאשר להציג קלטת שלעולם לא תתנגן.
    const external = /^https:\/\//.test(t.src);
    if (external && !/^https:\/\/github\.com\/[^/]+\/[^/]+\/releases\/download\//.test(t.src)) {
      return this.reject(t, 'src — רק כתובות Release של GitHub מותרות ב-CSP');
    }
    if (!external && /^[a-z]+:/i.test(t.src)) return this.reject(t, 'src');

    const chapters = (Array.isArray(t.chapters) ? t.chapters : [])
      .filter((c) => c && Number.isFinite(c.t) && c.t >= 0)
      .map((c, i) => ({ t: c.t, title: String(c.title || `פרק ${i + 1}`) }))
      .sort((a, b) => a.t - b.t);

    return {
      id: t.id,
      title: t.title.trim(),
      subtitle: typeof t.subtitle === 'string' ? t.subtitle : '',
      shelf: typeof t.shelf === 'string' && t.shelf.trim() ? t.shelf.trim() : 'הסרטונים שלי',
      colour: /^#[0-9a-f]{3,8}$/i.test(t.colour || '') ? t.colour : '#1B3FA0',
      src: t.src,
      duration: Number.isFinite(t.duration) ? t.duration : 0,
      isNew: !!t.new,
      // הספר שממנו נוצר הסרטון (id מהקטלוג של הספרייה) — לקישור "לספר המלא"
      book: typeof t.book === 'string' && /^[a-z0-9-]+$/.test(t.book) ? t.book : '',
      chapters,
    };
  },

  reject(t, field) {
    console.warn(`tapes.json: קלטת "${t?.id ?? '?'}" דולגה — שדה ${field} לא תקין`);
    return null;
  },

  byId(id) { return this.tapes.find((t) => t.id === id) || null; },
};

const Store = {
  render() {
    const aisle = $('#aisle');
    aisle.replaceChildren();

    if (!Catalog.tapes.length) {
      aisle.append(this.emptyRack());
      return;
    }

    const shelves = new Map();
    for (const tape of Catalog.tapes) {
      if (!shelves.has(tape.shelf)) shelves.set(tape.shelf, []);
      shelves.get(tape.shelf).push(tape);
    }
    for (const [name, tapes] of shelves) aisle.append(this.rack(name, tapes));
  },

  rack(name, tapes) {
    const sec = document.createElement('section');
    sec.className = 'rack';
    const h = document.createElement('h2');
    h.className = 'rack__label';
    h.textContent = name;
    const list = document.createElement('ul');
    list.className = 'rack__row';
    list.setAttribute('aria-label', name);
    for (const tape of tapes) {
      const li = document.createElement('li');
      li.append(this.cover(tape));
      list.append(li);
    }
    sec.append(h, list);
    return sec;
  },

  emptyRack() {
    const sec = document.createElement('section');
    sec.className = 'rack rack--empty';
    sec.innerHTML = `
      <h2 class="rack__label">בקרוב על המדף</h2>
      <ul class="rack__row" aria-hidden="true">
        <li><span class="tape tape--blank"><span class="tape__band">וידאו</span><span class="tape__title">בקרוב</span></span></li>
        <li><span class="tape tape--blank"><span class="tape__band">וידאו</span><span class="tape__title">בקרוב</span></span></li>
        <li><span class="tape tape--blank"><span class="tape__band">וידאו</span><span class="tape__title">בקרוב</span></span></li>
      </ul>
      <p class="aisle__note">הקלטות בדרך — המדף יתמלא ממש בקרוב.</p>`;
    return sec;
  },

  cover(tape) {
    const saved = Saved.position(tape.id);
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'tape';
    el.dataset.tapeId = tape.id;
    el.style.setProperty('--tape-colour', tape.colour);

    const bits = [tape.title];
    if (tape.duration) bits.push(spoken(tape.duration));
    if (tape.chapters.length) bits.push(`${chapterCount(tape)} פרקים`);
    if (saved) bits.push(`הצפייה תמשיך מ-${fmt(saved)}`);
    el.setAttribute('aria-label', bits.join(' — '));

    const span = (cls, text) => Object.assign(document.createElement('span'), { className: cls, textContent: text });
    el.append(
      span('tape__band', 'וידאו'),
      span('tape__title', tape.title),
    );
    // בין השם לכותרת המשנה, בתוך הזרימה — כך המדבקה לא מסתירה שום כיתוב
    if (saved) el.append(span('sticker sticker--rewind', 'לא גולגלה'));
    if (tape.subtitle) el.append(span('tape__sub', tape.subtitle));
    const meta = [tape.duration ? minutes(tape.duration) : '', tape.chapters.length ? `${chapterCount(tape)} פרקים` : '']
      .filter(Boolean).join(' · ');
    if (meta) el.append(span('tape__meta', meta));
    el.append(span('tape__badge', 'PAL'));
    if (tape.isNew) el.append(span('sticker sticker--new', 'חדש!'));

    el.addEventListener('click', () => this.pick(el, tape));
    return el;
  },

  /** הקלטת נשלפת מהמדף — ואז עוברים לחדר הצפייה. */
  pick(el, tape) {
    const go = () => {
      Insert.pending = { rect: el.getBoundingClientRect(), tapeId: tape.id };
      Router.go(`#/tape/${tape.id}`);
    };
    if (reducedMotion() || typeof el.animate !== 'function') return go();
    const lift = el.animate([
      { transform: 'translateY(0) rotate(0)' },
      { transform: 'translateY(-18px) rotate(-3deg) scale(1.05)' },
    ], { duration: 220, easing: 'cubic-bezier(.2,.8,.3,1.2)', fill: 'forwards' });
    lift.finished.then(go, go).finally(() => setTimeout(() => { try { lift.cancel(); } catch {} }, 400));
  },

  /** ממלא מחדש מדבקות "לא גולגלה" אחרי צפייה. */
  refresh() {
    const focusId = document.activeElement?.dataset?.tapeId;
    this.render();
    if (focusId) $(`.tape[data-tape-id="${CSS.escape(focusId)}"]`)?.focus({ preventScroll: true });
  },
};

/* ============================================================================
 * §4 — הכנסת הקלטת למכשיר הווידאו
 * ----------------------------------------------------------------------------
 * Web Animations API, כמו שליפת הספר בספרייה. שני שלבים:
 *   א. הקלטת עפה מהמקום שבו הייתה על המדף אל מעל החריץ, ומסתובבת לרוחב.
 *   ב. היא גולשת פנימה: translateY ו-clip-path זזים יחד באותו קצב, כך
 *      שהקצה התחתון של החלק הנראה נשאר צמוד לקו החריץ — נראה כאילו היא
 *      נבלעת בו, בלי שכבות z-index מסובכות.
 * לחיצה או מקש בזמן האנימציה מדלגים עליה. ב-prefers-reduced-motion לא
 * מגיעים לכאן בכלל.
 * ========================================================================== */

const Insert = {
  pending: null,
  running: [],

  take(tapeId) {
    const p = this.pending;
    this.pending = null;
    return p && p.tapeId === tapeId ? p : null;
  },

  async run(from, tape) {
    const slot = $('[data-slot]').getBoundingClientRect();
    if (!slot.width) return;

    const w = Math.min(slot.width * 0.84, 260);
    const h = w * 0.56;                                // יחס קלטת VHS אמיתית: 187×104 מ״מ
    const lineY = slot.top + slot.height * 0.5;
    const cx = slot.left + slot.width / 2;

    const cas = document.createElement('div');
    cas.className = 'cassette';
    cas.setAttribute('aria-hidden', 'true');
    cas.style.cssText = `left:${cx - w / 2}px; top:${lineY - h}px; width:${w}px; height:${h}px;`;
    cas.style.setProperty('--tape-colour', tape.colour);
    cas.innerHTML = '<span class="cassette__window"><i></i><i></i></span><span class="cassette__label"></span>';
    $('.cassette__label', cas).textContent = tape.title;
    document.body.append(cas);

    const fx = from.left + from.width / 2 - cx;
    const fy = from.top + from.height / 2 - (lineY - h / 2);
    const s0 = clamp(from.height / w, 0.4, 1.6);

    const skip = () => this.running.forEach((a) => { try { a.finish(); } catch {} });
    addEventListener('pointerdown', skip, { once: true, capture: true });
    addEventListener('keydown', skip, { once: true, capture: true });

    try {
      const fly = cas.animate([
        { transform: `translate(${fx}px, ${fy}px) rotate(90deg) scale(${s0})`, opacity: 0 },
        { transform: `translate(${fx * 0.8}px, ${fy * 0.8 - 30}px) rotate(70deg) scale(${s0})`, opacity: 1, offset: 0.14 },
        { transform: `translate(${fx * 0.25}px, ${Math.min(fy * 0.2, 0) - h * 0.9}px) rotate(-8deg) scale(1.12)`, offset: 0.62 },
        { transform: 'translate(0, 0) rotate(0) scale(1)', opacity: 1 },
      ], { duration: 1050, easing: 'cubic-bezier(.35,.75,.25,1)', fill: 'forwards' });
      this.running = [fly];
      await fly.finished;

      const flap = $('.vcr__flap');
      const slide = cas.animate([
        { transform: 'translateY(0)', clipPath: 'inset(0 0 0 0)' },
        { transform: `translateY(${h}px)`, clipPath: 'inset(0 0 100% 0)' },
      ], { duration: 620, easing: 'cubic-bezier(.5,0,.6,1)', fill: 'forwards' });
      const open = flap.animate([
        { transform: 'rotateX(0)' },
        { transform: 'rotateX(-72deg)', offset: 0.25 },
        { transform: 'rotateX(-72deg)', offset: 0.8 },
        { transform: 'rotateX(0)' },
      ], { duration: 760, easing: 'ease-in-out' });
      this.running = [slide, open];
      await slide.finished;
    } catch { /* אנימציה שבוטלה — ממשיכים ישר לנגן */ }
    finally {
      removeEventListener('pointerdown', skip, { capture: true });
      removeEventListener('keydown', skip, { capture: true });
      this.running = [];
      cas.remove();
    }
  },

  cancel() {
    this.running.forEach((a) => { try { a.cancel(); } catch {} });
    this.running = [];
    $$('.cassette').forEach((c) => c.remove());
  },
};

/* ============================================================================
 * §5 — הנגן
 * ========================================================================== */

/** "שלג" של טלוויזיה בלי אות. canvas קטן שמוגדל ב-CSS, ב-12 פריימים לשנייה. */
const Static = {
  raf: 0, last: 0,
  start() {
    const cv = $('.tv__static');
    cv.classList.add('is-on');
    if (this.raf || reducedMotion()) { this.draw(cv); return; }
    const loop = (now) => {
      this.raf = requestAnimationFrame(loop);
      if (now - this.last < 83) return;
      this.last = now;
      this.draw(cv);
    };
    this.raf = requestAnimationFrame(loop);
  },
  draw(cv) {
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(cv.width, cv.height);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = (Math.random() * 255) | 0;
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  },
  stop() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    $('.tv__static')?.classList.remove('is-on');
  },
};

const Player = {
  tape: null,
  chapterIdx: -1,
  startAt: 0,           // לאן לקפוץ כשהמטא-דאטה נטען (המשך צפייה / פרק / התאוששות)
  wantPlay: false,      // האם המשתמש רוצה שהקלטת תתנגן — שורד התאוששות
  lastTime: 0,          // המיקום הטוב האחרון; ממנו ממשיכים אחרי כשל רשת
  attempts: 0,
  recoveryPoint: 0,
  dragging: false,
  cameFromStore: false,
  saveTick: 0,
  uiTimer: 0,

  get video() { return $('.tv__video'); },

  init() {
    const v = this.video;
    const s = Saved.settings();
    v.volume = clamp(Number(s.volume) || 0, 0, 1);
    v.muted = !!s.muted;
    $('[data-vol]').value = String(v.volume);
    this.updateVolume();

    v.addEventListener('loadedmetadata', () => this.onMeta());
    // אחרי התאוששות כשהקלטת מושהית 'playing' לא יגיע — מורידים את השלג כשיש שוב תמונה
    v.addEventListener('loadeddata', () => { if (this.recovering) { this.recovering = false; Static.stop(); } });
    v.addEventListener('play', () => this.updatePlayState());
    v.addEventListener('playing', () => this.onPlaying());
    v.addEventListener('pause', () => { this.updatePlayState(); this.persist(); });
    v.addEventListener('waiting', () => this.modeOsd('TRACKING…', 0));
    v.addEventListener('timeupdate', () => this.onTime());
    v.addEventListener('ended', () => this.onEnded());
    v.addEventListener('error', () => this.recover());
    v.addEventListener('volumechange', () => this.updateVolume());

    $('#player-view').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-act]');
      if (btn) this.act(btn.dataset.act, btn);
      const ch = e.target.closest('[data-ch]');
      if (ch) this.goChapter(Number(ch.dataset.ch), { announceIt: true });
    });

    // לחיצה על המסך = ניגון/השהיה; לחיצה כפולה = מסך מלא. כמו בכל נגן.
    const screen = $('[data-screen]');
    screen.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      clearTimeout(this.clickTimer);
      this.clickTimer = setTimeout(() => this.toggle(), 220);
    });
    screen.addEventListener('dblclick', (e) => {
      if (e.target.closest('button')) return;
      clearTimeout(this.clickTimer);
      this.toggleFullscreen();
    });

    const seek = $('[data-seek]');
    seek.addEventListener('input', () => {
      this.dragging = true;
      this.paintSeek(Number(seek.value));
      $('[data-clock]').textContent = fmt(Number(seek.value));
    });
    seek.addEventListener('change', () => {
      this.dragging = false;
      this.seek(Number(seek.value));
    });

    $('[data-vol]').addEventListener('input', (e) => {
      v.volume = Number(e.target.value);
      if (v.volume > 0 && v.muted) v.muted = false;
    });

    document.addEventListener('fullscreenchange', () => this.onFullscreen());
    document.addEventListener('webkitfullscreenchange', () => this.onFullscreen());

    // במסך מלא הפקדים נעלמים כשהעכבר נח — ומופיעים בכל תזוזה
    const deck = $('#deck');
    const wake = () => {
      deck.classList.add('ui-awake');
      clearTimeout(this.uiTimer);
      this.uiTimer = setTimeout(() => deck.classList.remove('ui-awake'), 2600);
    };
    deck.addEventListener('pointermove', wake);
    deck.addEventListener('pointerdown', wake);
    deck.addEventListener('keydown', wake);

    addEventListener('pagehide', () => this.persist());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.persist(); });

    this.setupMediaSession();
  },

  /* ---------- פתיחה וסגירה ---------- */

  async open(tape, { ch = 0, from = null } = {}) {
    if (this.tape?.id === tape.id) {                 // אותה קלטת — רק קפיצה לפרק
      if (ch) this.goChapter(ch - 1);
      return;
    }
    if (this.tape) this.eject({ silent: true });

    this.tape = tape;
    this.chapterIdx = -1;
    this.attempts = 0;
    this.wantPlay = false;
    this.lastTime = 0;
    document.title = `${tape.title} · אוסף קלטות הוידאו של דן`;
    $('#tape-title').textContent = tape.title;
    $('[data-fault]').hidden = true;
    this.hidePrompt();
    this.setLed('');
    this.renderChapters();
    this.setDuration(tape.duration);
    const bookWrap = $('[data-book-wrap]');
    bookWrap.hidden = !tape.book;
    if (tape.book) $('[data-book-link]').href = `./#/book/${tape.book}`;
    // במחשב רשימת הפרקים פתוחה ליד המסך; בנייד היא נפתחת בלחיצה, כדי
    // שהטלוויזיה והפקדים יישארו בתוך המסך.
    this.toggleChapters(tape.chapters.length > 0 && matchMedia('(min-width: 901px)').matches, { focus: false });

    const saved = Saved.position(tape.id);
    const chapter = ch && tape.chapters[ch - 1];
    this.startAt = chapter ? chapter.t : saved;
    this.lastTime = this.startAt;
    this.paintSeek(this.startAt);
    $('[data-clock]').textContent = fmt(this.startAt);

    const v = this.video;
    v.src = tape.src;
    v.load();
    Static.start();

    if (from && !reducedMotion()) {
      await Insert.run(from.rect, tape);
      if (this.tape !== tape) return;             // המשתמש כבר יצא באמצע האנימציה
    }
    this.setLed('on');
    this.powerOn();

    if (from) {
      // הגענו מלחיצה על קלטת — יש מחוות משתמש, ומותר לנגן עם קול
      this.play();
      if (this.startAt > 5 && !chapter) this.osd(`המשך מ-${fmt(this.startAt)}`);
    } else {
      // קישור ישיר: דפדפנים חוסמים ניגון עם קול בלי מחווה. לא מנסים ונכשלים
      // בשקט — מציגים כפתור ברור על המסך.
      this.showPrompt(this.startAt > 5 ? `המשך מ-${fmt(this.startAt)}` : 'הפעלה');
    }
    this.updateMediaSession();
  },

  /** הוצאת הקלטת: שמירת מיקום, עצירה ושחרור ההורדה. */
  eject({ silent = false } = {}) {
    if (!this.tape) return;
    Insert.cancel();
    this.persist();
    const v = this.video;
    v.pause();
    // ⚠️ בלי removeAttribute + load() הדפדפן ממשיך להוריד את הקובץ ברקע
    // גם אחרי שחזרנו למדף — עד 250MB על חשבון החבילה של המשתמש.
    v.removeAttribute('src');
    v.load();
    Static.stop();
    this.setLed('');
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    this.tape = null;
    document.title = 'אוסף קלטות הוידאו של דן';
    if (!silent) announce('הקלטת הוצאה');
  },

  powerOn() {
    const flash = $('.tv__flash');
    if (!reducedMotion() && flash.animate) {
      flash.animate([
        { opacity: 1, transform: 'scaleY(.004) scaleX(.6)' },
        { opacity: 1, transform: 'scaleY(.004) scaleX(1)', offset: 0.3 },
        { opacity: 0.9, transform: 'scaleY(1) scaleX(1)', offset: 0.7 },
        { opacity: 0, transform: 'scaleY(1) scaleX(1)' },
      ], { duration: 520, easing: 'ease-out' });
    }
  },

  /* ---------- ניגון ---------- */

  play() {
    this.wantPlay = true;
    this.hidePrompt();
    const p = this.video.play();
    if (p?.catch) {
      p.catch((err) => {
        if (err?.name === 'NotAllowedError') {
          this.wantPlay = false;
          this.showPrompt(this.video.currentTime > 5 ? `המשך מ-${fmt(this.video.currentTime)}` : 'הפעלה');
        }
        // AbortError: ה-src הוחלף באמצע (התאוששות/הוצאה) — צפוי ולא שגיאה
      });
    }
  },

  pause() {
    this.wantPlay = false;
    this.video.pause();
  },

  toggle() {
    if (!this.tape) return;
    if (this.video.paused || this.video.ended) this.play(); else this.pause();
  },

  seek(t) {
    const v = this.video;
    const dur = this.duration();
    t = clamp(t, 0, dur ? dur - 0.25 : t);
    // ⚠️ lastTime מתעדכן *לפני* הקפיצה: אם הקפיצה עצמה נכשלת (הכתובת
    // החתומה פגה), ההתאוששות צריכה להמשיך מהיעד — לא מהמקום הקודם.
    this.lastTime = t;
    if (v.readyState >= 1) v.currentTime = t; else this.startAt = t;
    this.paintSeek(t);
    $('[data-clock]').textContent = fmt(t);
  },

  skip(delta) {
    this.seek(this.video.currentTime + delta);
    this.modeOsd(delta < 0 ? '◀◀ REW' : 'FF ▶▶');
  },

  duration() {
    const d = this.video.duration;
    return Number.isFinite(d) && d > 0 ? d : (this.tape?.duration || 0);
  },

  onMeta() {
    this.setDuration(this.duration());
    if (this.startAt > 0) {
      const d = this.duration();
      this.video.currentTime = d ? Math.min(this.startAt, d - 0.5) : this.startAt;
    }
    this.startAt = 0;
    if (this.wantPlay && this.video.paused) this.play();
  },

  onPlaying() {
    Static.stop();
    this.hidePrompt();
    $('[data-fault]').hidden = true;
    this.updatePlayState();
  },

  onTime() {
    const v = this.video;
    if (!this.tape) return;
    const t = v.currentTime;
    if (t > 0 && !v.seeking && !v.error) this.lastTime = t;
    // ⚠️ מונה הניסיונות מתאפס רק אחרי 15 שניות של התקדמות אמיתית מנקודת
    // ההתאוששות. כשהאיפוס היה ב-'playing' הוא כמעט אף פעם לא קרה (האירוע
    // נורה מיד אחרי הטעינה, לפני שעבר זמן), ואחרי שלוש תפוגות — רבע שעה
    // של צפייה — הנגן היה מוותר על סרטון תקין לגמרי. נמצא בבדיקה.
    if (this.attempts && t > this.recoveryPoint + 15) this.attempts = 0;
    if (!this.dragging) {
      this.paintSeek(t);
      $('[data-clock]').textContent = fmt(t);
    }
    this.syncChapter(t);
    if (Date.now() - this.saveTick > 4000) this.persist();
  },

  onEnded() {
    this.wantPlay = false;
    this.updatePlayState();
    this.modeOsd('STOP ■', 0);
    Saved.savePosition(this.tape.id, 0, this.duration());     // הקלטת הסתיימה — "גולגלה"
    this.showPrompt('לצפות שוב');
  },

  persist() {
    this.saveTick = Date.now();
    if (!this.tape) return;
    const t = this.video.readyState >= 1 ? this.video.currentTime : this.lastTime;
    if (this.video.ended) return;
    Saved.savePosition(this.tape.id, t || this.lastTime, this.duration());
  },

  /**
   * התאוששות מכשל רשת.
   * ⚠️ זה לא מקרה קצה: הכתובת החתומה של GitHub פגה אחרי 5 דקות, ולכן כל
   * צפייה ארוכה תיתקל בזה בקפיצה הראשונה שאחרי. מבקשים את כתובת ה-Release
   * המקורית שוב — היא מנפיקה הפניה טרייה — וחוזרים לאותה נקודה ולאותו
   * מצב ניגון. הפרמטר r= עוקף את מטמון המדיה של הדפדפן, שאחרת עלול למחזר
   * את ההפניה הישנה (GitHub מתעלם מפרמטרים לא מוכרים — נבדק).
   */
  recover() {
    const v = this.video;
    const err = v.error;
    if (!this.tape || !err || !v.getAttribute('src')) return;
    if (err.code === 1) return;                                   // MEDIA_ERR_ABORTED — אנחנו ביטלנו

    if (this.attempts >= 3) {
      Static.start();
      this.setLed('err');
      const box = $('[data-fault]');
      $('[data-fault-text]', box).textContent = navigator.onLine === false
        ? 'אין חיבור לאינטרנט. כשהחיבור יחזור — לחצו לנסות שוב.'
        : 'לא הצלחנו לטעון את הסרטון. ייתכן שהרשת איטית או שהקובץ לא זמין כרגע.';
      box.hidden = false;
      this.hidePrompt();
      console.warn('הנגן: ההתאוששות נכשלה', err.code, err.message);
      return;
    }

    this.attempts += 1;
    this.recoveryPoint = this.lastTime;
    this.startAt = this.lastTime;
    this.recovering = true;
    Static.start();                     // "שלג" עד שהתמונה חוזרת, במקום מסך שחור
    const src = this.tape.src;
    v.src = /^https?:/.test(src) ? `${src}${src.includes('?') ? '&' : '?'}r=${Date.now().toString(36)}` : src;
    v.load();
    this.modeOsd('TRACKING…', 0);
  },

  retry() {
    // לחיצה של המשתמש = סבב ניסיונות חדש. הכתובת המקורית מנפיקה הפניה טרייה.
    if (!this.tape) return;
    this.attempts = 0;
    $('[data-fault]').hidden = true;
    this.setLed('on');
    const v = this.video;
    this.startAt = this.lastTime;
    v.src = this.tape.src;
    v.load();
    this.play();
  },

  /* ---------- פרקים ---------- */

  /**
   * מספר הפרק כפי שהוא *מופיע בכותרת*, לא מקומו ברשימה.
   * ⚠️ בסרטונים של דן הרשימה כוללת גם "פתיחה", כותרות חלקים ("חלק א · …")
   * ו"סיום". מספור רץ היה מציג את "פרק 1" בתור 03 — ומקש 1 היה קופץ
   * לפתיחה. כשאף כותרת לא מתחילה ב"פרק <מספר>" חוזרים למספור רץ.
   */
  numbering(i) {
    const chs = this.tape?.chapters || [];
    const c = chs[i];
    if (!c) return { no: null, part: false };
    const numbered = chs.some((x) => /^פרק\s+\d+/.test(x.title));
    if (!numbered) return { no: i + 1, part: false };
    const m = c.title.match(/^פרק\s+(\d+)/);
    // ⚠️ כותרת ביניים היא "חלק" או "שער": הספר "מבוא למינהל ולניהול ציבורי"
    // מחולק לשערים, ובלי "שער" כאן הכותרות האלה נראו כמו שורה רגילה ברשימה.
    return { no: m ? Number(m[1]) : null, part: /^(חלק|שער)\s/.test(c.title) };
  },

  /** הכותרת להצגה: "פרק 4 · עצמה" → "עצמה", כי המספר כבר מוצג לידה. */
  shownTitle(i) {
    const c = this.tape.chapters[i];
    const short = c.title.replace(/^פרק\s+\d+\s*[·:\-–—]\s*/, '');
    return short.trim() ? short : c.title;
  },

  /** מקשי 1–9: לפרק שמספרו בכותרת הוא n. */
  goNumber(n) {
    const chs = this.tape?.chapters || [];
    const i = chs.findIndex((_, j) => this.numbering(j).no === n);
    if (i >= 0) this.goChapter(i, { announceIt: true });
  },

  spokenChapter(i) {
    const c = this.tape.chapters[i];
    const { no } = this.numbering(i);
    // כשהמספר כבר בכותרת ("פרק 4 · …") לא מקריאים אותו פעמיים
    return no != null && !/^פרק\s+\d+/.test(c.title) ? `פרק ${no}: ${c.title}` : c.title;
  },

  renderChapters() {
    const list = $('[data-chapter-list]');
    const chs = this.tape.chapters;
    list.replaceChildren(...chs.map((c, i) => {
      const li = document.createElement('li');
      const { no, part } = this.numbering(i);
      if (part) li.className = 'ch-part';
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ch';
      b.dataset.ch = String(i);
      const noEl = Object.assign(document.createElement('span'), { className: 'ch__no', textContent: no != null ? String(no).padStart(2, '0') : '' });
      const title = Object.assign(document.createElement('span'), { className: 'ch__title', textContent: this.shownTitle(i) });
      const time = Object.assign(document.createElement('span'), { className: 'ch__time', textContent: fmt(c.t) });
      b.setAttribute('aria-label', `${this.spokenChapter(i)}, ${spoken(c.t)}`);
      b.append(noEl, title, time);
      li.append(b);
      return li;
    }));
    $('[data-chapter-empty]').hidden = chs.length > 0;
    $$('[data-act="prev-ch"], [data-act="next-ch"]').forEach((b) => { b.disabled = chs.length < 2; });
  },

  paintTicks() {
    const box = $('[data-ticks]');
    const d = this.duration();
    const chs = this.tape?.chapters || [];
    box.replaceChildren(...(d ? chs.slice(1) : []).map((c) => {
      const s = document.createElement('span');
      s.style.left = `${(c.t / d) * 100}%`;
      return s;
    }));
  },

  indexAt(t) {
    const chs = this.tape?.chapters || [];
    let idx = chs.length ? 0 : -1;
    for (let i = 0; i < chs.length; i++) if (chs[i].t <= t + 0.3) idx = i;
    return idx;
  },

  syncChapter(t) {
    const idx = this.indexAt(t);
    if (idx === this.chapterIdx) return;
    const first = this.chapterIdx === -1;
    this.chapterIdx = idx;
    $$('.ch').forEach((b) => {
      const on = Number(b.dataset.ch) === idx;
      if (on) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
    });
    const cur = $('.ch[aria-current]');
    if (cur) cur.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    // תצוגת "CH 02" כמו במכשיר — גם כשהפרק מתחלף מעצמו בזמן הניגון
    if (idx >= 0 && !first && !this.video.paused) this.chapterOsd(idx);
  },

  goChapter(i, { announceIt = false } = {}) {
    const chs = this.tape?.chapters || [];
    if (!chs.length) return;
    i = clamp(i, 0, chs.length - 1);
    this.seek(chs[i].t + 0.01);
    this.chapterIdx = -2;          // מאלץ עדכון סימון ברשימה
    this.syncChapter(chs[i].t + 0.01);
    this.chapterOsd(i);
    if (announceIt) announce(this.spokenChapter(i));
    if (this.video.ended || this.video.paused) this.play();
  },

  prevChapter() {
    const t = this.video.currentTime;
    const i = this.indexAt(t);
    const chs = this.tape?.chapters || [];
    // כמו בכל נגן: באמצע פרק — חזרה לתחילתו; בתחילתו — לפרק הקודם
    if (i >= 0 && t - chs[i].t > 3) this.goChapter(i, { announceIt: true });
    else this.goChapter(i - 1, { announceIt: true });
  },

  nextChapter() {
    const chs = this.tape?.chapters || [];
    const i = this.indexAt(this.video.currentTime);
    if (i < chs.length - 1) this.goChapter(i + 1, { announceIt: true });
  },

  toggleChapters(force, { focus = true } = {}) {
    const nav = $('#chapters');
    const open = typeof force === 'boolean' ? force : nav.dataset.open !== 'true';
    nav.dataset.open = String(open);
    $('[data-act="chapters"]').setAttribute('aria-expanded', String(open));
    if (open && focus) ($('.ch[aria-current]') || $('.ch'))?.focus({ preventScroll: true });
  },

  /* ---------- תצוגה ---------- */

  setDuration(d) {
    const seek = $('[data-seek]');
    seek.max = String(d || 0);
    this.paintTicks();
  },

  paintSeek(t) {
    const seek = $('[data-seek]');
    const d = Number(seek.max) || 0;
    if (!this.dragging) seek.value = String(t);
    seek.style.setProperty('--fill', `${d ? (clamp(t, 0, d) / d) * 100 : 0}%`);
    seek.setAttribute('aria-valuetext', `${spoken(t)} מתוך ${spoken(d)}`);
  },

  updatePlayState() {
    const playing = !this.video.paused && !this.video.ended;
    const btn = $('[data-act="play"]');
    btn.setAttribute('aria-label', playing ? 'השהיה' : 'ניגון');
    $('[data-play-icon]').setAttribute('href', playing ? '#v-pause' : '#v-play');
    $('#deck').classList.toggle('is-playing', playing);
    if (this.tape) this.setLed(playing ? 'play' : 'on');
    if (playing) this.modeOsd('PLAY ▶'); else if (!this.video.ended && this.tape && this.video.readyState) this.modeOsd('PAUSE ❚❚', 0);
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
  },

  updateVolume() {
    const v = this.video;
    const silent = v.muted || v.volume === 0;
    const btn = $('[data-act="mute"]');
    btn.setAttribute('aria-pressed', String(silent));
    btn.setAttribute('aria-label', silent ? 'ביטול השתקה' : 'השתקה');
    $('[data-vol-icon]').setAttribute('href', silent ? '#v-mute' : '#v-vol');
    $('[data-vol]').value = String(v.muted ? 0 : v.volume);
    Saved.saveSettings({ volume: v.volume, muted: v.muted });
  },

  setLed(state) {
    const led = $('[data-led]');
    led.dataset.state = state;
  },

  osd(text, ms = 2400) {
    const el = $('[data-osd]');
    el.textContent = text;
    el.classList.add('is-on');
    clearTimeout(this.osdTimer);
    this.osdTimer = setTimeout(() => el.classList.remove('is-on'), ms);
  },

  chapterOsd(i) {
    const { no } = this.numbering(i);
    const el = $('[data-osd]');
    const parts = [];
    if (no != null) parts.push(Object.assign(document.createElement('span'), { className: 'osd__ch', textContent: `CH ${String(no).padStart(2, '0')}` }));
    parts.push(Object.assign(document.createElement('span'), { className: 'osd__title', textContent: this.shownTitle(i) }));
    el.replaceChildren(...parts);
    el.classList.add('is-on');
    clearTimeout(this.osdTimer);
    this.osdTimer = setTimeout(() => el.classList.remove('is-on'), 2600);
  },

  /** תצוגת המצב בפינה: PLAY / PAUSE / FF. ms=0 — נשארת עד השינוי הבא. */
  modeOsd(text, ms = 1600) {
    const el = $('[data-osd-mode]');
    el.textContent = text;
    el.classList.add('is-on');
    clearTimeout(this.modeTimer);
    if (ms) this.modeTimer = setTimeout(() => el.classList.remove('is-on'), ms);
  },

  showPrompt(label) {
    const b = $('[data-act="play-prompt"]');
    $('[data-prompt-label]', b).textContent = label;
    b.hidden = false;
  },
  hidePrompt() { $('[data-act="play-prompt"]').hidden = true; },

  /* ---------- מסך מלא ---------- */

  toggleFullscreen() {
    const deck = $('#deck');
    const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
    if (fsEl) {
      (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
      return;
    }
    const req = deck.requestFullscreen || deck.webkitRequestFullscreen;
    if (req) {
      const p = req.call(deck);
      if (p?.catch) p.catch(() => this.nativeFullscreen());
    } else {
      this.nativeFullscreen();
    }
  },

  /** אייפון: מסך מלא קיים רק לאלמנט הווידאו עצמו, בנגן המובנה של iOS. */
  nativeFullscreen() {
    const v = this.video;
    if (typeof v.webkitEnterFullscreen === 'function') v.webkitEnterFullscreen();
  },

  onFullscreen() {
    const on = !!(document.fullscreenElement || document.webkitFullscreenElement);
    const deck = $('#deck');
    deck.classList.toggle('is-fs', on);
    const btn = $('[data-act="fullscreen"]');
    btn.setAttribute('aria-label', on ? 'יציאה ממסך מלא' : 'מסך מלא');
    if (on) deck.classList.add('ui-awake');
  },

  /* ---------- Media Session: מסך הנעילה ואוזניות ---------- */

  setupMediaSession() {
    if (!('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    const on = (a, fn) => { try { ms.setActionHandler(a, fn); } catch {} };
    on('play', () => this.play());
    on('pause', () => this.pause());
    on('seekbackward', () => this.skip(-10));
    on('seekforward', () => this.skip(10));
    on('previoustrack', () => this.prevChapter());
    on('nexttrack', () => this.nextChapter());
    on('seekto', (d) => { if (Number.isFinite(d.seekTime)) this.seek(d.seekTime); });
  },

  updateMediaSession() {
    if (!('mediaSession' in navigator) || !this.tape || typeof MediaMetadata !== 'function') return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: this.tape.title,
      artist: 'דן טואיטו',
      album: 'אוסף קלטות הוידאו של דן',
    });
  },

  /* ---------- פעולות ---------- */

  act(name) {
    switch (name) {
      case 'play':        return this.toggle();
      case 'play-prompt': return this.play();
      case 'rew':         return this.skip(-10);
      case 'ff':          return this.skip(10);
      case 'prev-ch':     return this.prevChapter();
      case 'next-ch':     return this.nextChapter();
      case 'mute': {
        const v = this.video;
        if (v.muted || v.volume === 0) { v.muted = false; if (v.volume === 0) v.volume = 0.6; }
        else v.muted = true;
        return;
      }
      case 'chapters':    return this.toggleChapters();
      case 'fullscreen':  return this.toggleFullscreen();
      case 'rewind-all':
        this.seek(0);
        this.modeOsd('◀◀ REWIND');
        Saved.savePosition(this.tape.id, 0, this.duration());
        return announce('הקלטת גולגלה להתחלה');
      case 'retry':       return this.retry();
      case 'back':        return Router.back();
      case 'keys':        return Keys.open();
    }
  },
};

/* ============================================================================
 * §6 — ניתוב, מקלדת ואתחול
 * ========================================================================== */

const Router = {
  pushedFromStore: false,

  parse() {
    const m = location.hash.match(/^#\/tape\/([a-z0-9-]+)(?:\/(\d+))?\/?$/);
    return m ? { name: 'tape', id: m[1], ch: m[2] ? Number(m[2]) : 0 } : { name: 'store' };
  },

  go(hash) {
    this.pushedFromStore = true;
    location.hash = hash;
  },

  /** "אחורה" אמיתי כשהגענו מהמדף — כך כפתור החזרה של הדפדפן נשאר עקבי. */
  back() {
    if (this.pushedFromStore) { this.pushedFromStore = false; history.back(); }
    else location.hash = '#/';
  },

  apply() {
    const r = this.parse();
    const store = $('#store-view');
    const player = $('#player-view');

    if (r.name === 'tape') {
      const tape = Catalog.byId(r.id);
      if (!tape) {
        announce('הקלטת לא נמצאה על המדף');
        history.replaceState(null, '', '#/');
        return this.apply();
      }
      const from = Insert.take(tape.id);
      store.hidden = true;
      player.hidden = false;
      this.lastTapeId = tape.id;
      if (!from) player.focus({ preventScroll: true });
      Player.open(tape, { ch: r.ch, from });
      if (from) $('[data-act="play"]').focus({ preventScroll: true });
      scrollTo(0, 0);
      return;
    }

    const wasPlaying = !!Player.tape;
    Player.eject({ silent: !wasPlaying });
    this.pushedFromStore = false;
    player.hidden = true;
    store.hidden = false;
    if (wasPlaying) {
      Store.refresh();
      const back = this.lastTapeId && $(`.tape[data-tape-id="${CSS.escape(this.lastTapeId)}"]`);
      (back || store).focus({ preventScroll: false });
    }
  },
};

/**
 * קיצורי המקלדת — מקור אמת אחד: גם הטיפול במקשים וגם החלונית נגזרים
 * מהטבלה הזו, כך שהתיעוד לא יכול לשקר.
 * ‏e.code ולא e.key: code הוא המקש הפיזי, ולכן F עובד גם כשהמקלדת
 * בעברית (שם e.key הוא "כ"), ו-[ ו-] לא מתהפכים בפריסה העברית.
 */
const SHORTCUTS = [
  { codes: ['Space', 'KeyK'], show: ['רווח', 'K'], label: 'ניגון / השהיה', run: () => Player.toggle() },
  { codes: ['ArrowLeft'],  show: ['←'], label: '10 שניות אחורה', run: () => Player.skip(-10) },
  { codes: ['ArrowRight'], show: ['→'], label: '10 שניות קדימה', run: () => Player.skip(10) },
  { codes: ['BracketLeft'],  show: ['['], label: 'לפרק הקודם', run: () => Player.prevChapter() },
  { codes: ['BracketRight'], show: [']'], label: 'לפרק הבא', run: () => Player.nextChapter() },
  { codes: ['Digit1'], show: ['1–9'], label: 'קפיצה ישירה לפרק לפי מספרו', run: null },
  { codes: ['Home'], show: ['Home'], label: 'לתחילת הקלטת', run: () => Player.seek(0) },
  { codes: ['KeyC'], show: ['C'], label: 'רשימת הפרקים', run: () => Player.toggleChapters() },
  { codes: ['KeyF'], show: ['F'], label: 'מסך מלא', run: () => Player.toggleFullscreen() },
  { codes: ['KeyM'], show: ['M'], label: 'השתקה', run: () => Player.act('mute') },
  { codes: ['Escape'], show: ['Esc'], label: 'הוצאת הקלטת וחזרה למדף', run: null },
];

const Keys = {
  open() {
    const dl = $('[data-keys-list]');
    if (!dl.childElementCount) {
      for (const s of SHORTCUTS) {
        const dt = document.createElement('dt');
        s.show.forEach((k, i) => {
          if (i) dt.append(' · ');
          dt.append(Object.assign(document.createElement('kbd'), { textContent: k }));
        });
        const dd = Object.assign(document.createElement('dd'), { textContent: s.label });
        dl.append(dt, dd);
      }
    }
    $('#keys-dialog').showModal();
  },

  onKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if ($('dialog[open]')) return;                      // דיאלוג פתוח מטפל ב-Esc בעצמו
    if ($('#player-view').hidden || !Player.tape) return;
    const t = e.target;
    const tag = t?.tagName;
    const onRange = tag === 'INPUT' && t.type === 'range';
    // ⚠️ רווח על כפתור ממוקד כבר "לוחץ" עליו. טיפול נוסף כאן היה מפעיל
    // ומשהה באותה לחיצה — כלומר לא עושה כלום.
    if (e.code === 'Space' && (tag === 'BUTTON' || tag === 'A')) return;
    // על פס הזמן ופס העוצמה החצים כבר מזיזים את הערך
    if (onRange && /^Arrow|^Home$|^End$/.test(e.code)) return;

    if (e.code === 'Escape') {
      const nav = $('#chapters');
      if (nav.dataset.open === 'true' && matchMedia('(max-width: 900px)').matches) {
        Player.toggleChapters(false);
        $('[data-act="chapters"]').focus();
      } else {
        Router.back();
      }
      e.preventDefault();
      return;
    }

    const digit = e.code.match(/^Digit([1-9])$/);
    if (digit) {
      Player.goNumber(Number(digit[1]));
      e.preventDefault();
      return;
    }

    const s = SHORTCUTS.find((x) => x.run && x.codes.includes(e.code));
    if (!s) return;
    e.preventDefault();
    s.run();
  },
};

async function init() {
  Light.init();
  Player.init();
  document.addEventListener('keydown', (e) => Keys.onKey(e));
  $('#store-view [data-act="about"]').addEventListener('click', () => $('#about-dialog').showModal());
  addEventListener('hashchange', () => Router.apply());

  try {
    await Catalog.load();
  } catch (err) {
    console.error(err);
    const aisle = $('#aisle');
    aisle.innerHTML = '<p class="aisle__note aisle__note--error">לא הצלחנו לטעון את רשימת הקלטות. <a href="">נסו לרענן את העמוד</a>.</p>';
    return;
  }
  Store.render();
  Router.apply();
}

init();
