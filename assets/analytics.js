/* Google Analytics — הגדרת gtag.
 *
 * ⚠️ הקוד הזה הגיע במקור כבלוק <script> מוטבע ב-index.html, והוא היה
 * נחסם שם בשקט: ל-script-src אין 'unsafe-inline' (רק ל-style-src יש,
 * בשביל StPageFlip). החלופה — להתיר unsafe-inline לסקריפטים — הייתה
 * פותחת את האתר להזרקת קוד, מחיר גבוה בהרבה מקובץ נפרד אחד.
 *
 * הטעינה של gtag.js עצמו היא async, והאתר חייב לעבוד במלואו גם כשהיא
 * נכשלת — חוסם פרסומות, מצב לא מקוון, או רשת חסומה. dataLayer נבנה כאן
 * ולכן הקריאות פשוט נערמות בו בלי לזרוק.
 */
window.dataLayer = window.dataLayer || [];
function gtag() { dataLayer.push(arguments); }
gtag('js', new Date());
gtag('config', 'G-PNNQZ1Y4MP');
