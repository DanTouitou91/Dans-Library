/* אתחול PDF.js.
 *
 * מגרסה 4 ואילך PDF.js מסופק כמודול ESM בלבד, ולכן הוא נטען כאן ולא
 * בתגית <script> רגילה. הקובץ הזה חיצוני (ולא inline) כדי שמדיניות
 * ה-CSP תוכל להישאר מחמירה, בלי 'unsafe-inline'.
 *
 * אנחנו משתמשים ב-build ה-legacy: הוא כולל polyfill ל-Promise.withResolvers
 * ולכן עובד גם בדפדפנים ישנים יותר (Safari מתחת ל-17.4, Firefox מתחת ל-121).
 */
import * as pdfjsLib from './pdf.min.mjs';

// ה-worker חייב להיות באותו origin — לכן נתיב מקומי ולא CDN.
pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdfjs/pdf.worker.min.mjs';

window.pdfjsLib = pdfjsLib;
window.dispatchEvent(new Event('pdfjs-ready'));
