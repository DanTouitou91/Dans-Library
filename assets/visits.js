/* מונה המבקרים — משותף לספרייה ולאוסף קלטות הוידאו.
 *
 * ביקור = דפדפן אחד, בעמוד אחד, פעם ביום. התאריך שבו כבר נספרת נשמר
 * ב-localStorage, ובשאר הפעמים באותו יום רק קוראים את המספר. כך רענון,
 * מעבר בין ספרים או חזרה למדף לא מנפחים את המונה.
 *
 * ⚠️ כשהבקשה נכשלת (שרת הבדיקה המקומי, חוסם פרסומות, אין רשת) המונה נשאר
 * מוסתר. מונה שמציג 0 או שגיאה גרוע ממונה שלא מופיע.
 *
 * העיצוב שונה בכל עמוד (תופי פליז בספרייה, LED בחנות), אבל המבנה זהה:
 * לכל ספרה "תוף" עם רצועת 0–9, ו---d קובע איזו ספרה נראית. ב-CSS של
 * הספרייה הרצועה מתגלגלת; בחנות היא פשוט קופצת, כמו תצוגת LED.
 */
(() => {
  const el = document.querySelector('[data-visits]');
  if (!el) return;
  const page = el.dataset.visits;
  const key = `dl:visits:${page}`;

  // התאריך המקומי ולא UTC: "היום" של המבקר מתחלף בחצות שלו
  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  let counted = false;
  try { counted = localStorage.getItem(key) === today; } catch { /* מצב פרטי — נספר שוב, לא נורא */ }

  fetch(`/api/visits?page=${encodeURIComponent(page)}`, {
    method: counted ? 'GET' : 'POST',
    cache: 'no-store',
  })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
    .then(({ count }) => {
      if (!Number.isInteger(count) || count < 0) throw new Error('bad count');
      if (!counted) { try { localStorage.setItem(key, today); } catch {} }
      render(count);
    })
    .catch(() => { /* נשאר מוסתר */ });

  function render(count) {
    const digits = String(count).padStart(6, '0');
    const box = el.querySelector('[data-visits-digits]');
    box.replaceChildren(...[...digits].map((ch, i) => {
      const drum = document.createElement('span');
      drum.className = 'visits__drum';
      drum.style.setProperty('--i', String(i));
      const strip = document.createElement('span');
      strip.className = 'visits__strip';
      for (let n = 0; n <= 9; n++) strip.append(Object.assign(document.createElement('span'), { textContent: String(n) }));
      drum.append(strip);
      // מתחילים מ-0 ומגלגלים לספרה בפריים הבא — כך המעבר באמת מונפש
      drum.style.setProperty('--d', '0');
      drum.dataset.digit = ch;
      return drum;
    }));
    el.querySelector('[data-visits-text]').textContent =
      `${count.toLocaleString('he-IL')} ${el.dataset.visitsNoun || 'ביקורים'}`;
    el.dataset.count = String(count);
    el.hidden = false;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      box.querySelectorAll('.visits__drum').forEach((drum) => drum.style.setProperty('--d', drum.dataset.digit));
    }));
  }
})();
