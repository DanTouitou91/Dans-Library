/**
 * פונקציית Netlify למונה המבקרים — ‏/api/visits.
 * אותו origin כמו האתר, ולכן connect-src 'self' שב-CSP מספיק.
 * הלוגיקה עצמה ב-counter.mjs (ונבדקת ב-tests/visits_test.mjs).
 */
import { getStore } from '@netlify/blobs';
import { handle } from './counter.mjs';

export default async (request) =>
  handle(request, getStore({ name: 'visits', consistency: 'strong' }));

export const config = { path: '/api/visits' };
