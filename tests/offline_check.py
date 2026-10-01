#!/usr/bin/env python3
"""בדיקות קריאה בלי אינטרנט (sw.js + Offline ב-script.js).

⚠️ "בלי אינטרנט" כאן אמיתי: הבדיקה מרימה עותק משלה של tests/cspserve.py
על פורט נפרד, ו**הורגת אותו** לפני החלק הלא-מקוון. ‏context.set_offline
לבדו לא מספיק — אם הוא לא חל על בקשות ה-Service Worker, כל הבדיקה הייתה
עוברת מול השרת החי בלי לבדוק כלום. ‏set_offline מופעל בנוסף, כדי ש-
navigator.onLine יהיה false כמו במצב טיסה (ממנו נגזרים הפס וההודעות).

הרצה:  python3 tests/offline_check.py
"""
import os
import subprocess
import sys
import tempfile
import time
import urllib.request
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = int(os.environ.get("DL_OFFLINE_PORT", "8791"))
BASE = f"http://127.0.0.1:{PORT}"
CHROME = os.environ.get("DL_CHROME", "")
SHOT = os.environ.get("DL_SHOTS") or tempfile.mkdtemp(prefix="dl-offline-")

SAVED, OTHER, REVVED = "lashon-hevra-tarbut", "yahasim-beinleumiyim", "mediniyut-tziburit"

fails, notes = [], []


def check(label, cond, detail=""):
    (notes if cond else fails).append(f"{'PASS' if cond else 'FAIL'}  {label}" + (f"  — {detail}" if detail else ""))


class Server:
    def __init__(self):
        self.proc = None

    def start(self):
        env = {**os.environ, "DL_PORT": str(PORT)}
        self.proc = subprocess.Popen([sys.executable, os.path.join(ROOT, "tests", "cspserve.py")], env=env,
                                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(50):
            try:
                urllib.request.urlopen(BASE + "/", timeout=1)
                return
            except Exception:
                time.sleep(0.1)
        raise RuntimeError("cspserve did not start")

    def stop(self):
        if self.proc:
            self.proc.terminate()
            self.proc.wait(5)
            self.proc = None


def cache_keys(page, name):
    return page.evaluate("""async (n) => { const c = await caches.open(n);
        return (await c.keys()).map(r => r.url.replace(location.origin, '')); }""", name)


def wait_rendered(page, timeout=20000):
    page.wait_for_function("() => !!document.querySelector('.leaf-canvas[data-rendered]')", timeout=timeout)


server = Server()
server.start()

launch = {"args": ["--no-sandbox", "--disable-dev-shm-usage"]}
if CHROME:
    launch["executable_path"] = CHROME

try:
    with sync_playwright() as pw:
        browser = pw.chromium.launch(**launch)
        ctx = browser.new_context(viewport={"width": 1280, "height": 900})
        page = ctx.new_page()
        errs, csp, book_responses, api_responses = [], [], [], []
        page.on("pageerror", lambda e: errs.append(str(e)))
        page.on("console", lambda m: csp.append(m.text) if "Content Security Policy" in m.text else None)

        def on_response(r):
            if "/books/" in r.url:
                book_responses.append((r.url, r.status, r.from_service_worker))
            if "/api/visits" in r.url or "/v/" in r.url:
                api_responses.append((r.url, r.from_service_worker))
        page.on("response", on_response)

        # ---------- 1. רישום ושליטה ----------
        page.goto(BASE + "/", wait_until="networkidle")
        page.wait_for_function("() => navigator.serviceWorker.controller !== null", timeout=15000)
        check("service worker registers and controls the page (no reload needed)", True)
        page.wait_for_timeout(1500)       # ההתקנה + הודעת warm
        shell = cache_keys(page, "dl-shell-v1")
        need = ["/", "/script.js?v=10", "/style.css?v=12", "/vendor/pdfjs/pdf.min.mjs",
                "/vendor/pdfjs/pdf.worker.min.mjs", "/vendor/pdfjs/pdfjs-init.mjs",
                "/vendor/page-flip/page-flip.browser.js", "/vendor/pdfjs/standard_fonts/FoxitSerif.pfb",
                "/manifest.webmanifest", "/assets/icons/icon-180.png"]
        missing = [u for u in need if u not in shell]
        check("shell cache holds the page, versioned code, PDF.js and its fonts", not missing, f"missing {missing}")
        check("shell cache holds no books, videos or API calls",
              not [u for u in shell if u.startswith(("/books/", "/videos", "/api/", "/v/", "/tapes"))], str(shell))

        # ---------- 2. שמירת ספר מהכרטיס ----------
        page.goto(BASE + f"/#/book/{SAVED}", wait_until="networkidle")
        page.wait_for_selector("[data-offline-slot]:not([hidden])")
        check("card shows the save button", page.inner_text("[data-offline-label]") == "שמירה לקריאה בלי אינטרנט")
        page.screenshot(path=f"{SHOT}/card_idle.png")
        page.click("[data-offline-save]")
        page.wait_for_selector("[data-offline-save][data-state='saved']", timeout=20000)
        check("button turns into '✓ שמור במכשיר'", page.inner_text("[data-offline-label]") == "שמור במכשיר"
              and page.locator("[data-offline-save] .icon--saved").is_visible())
        check("remove link appears", page.locator("[data-offline-remove]").is_visible())
        page.screenshot(path=f"{SHOT}/card_saved.png")
        books = cache_keys(page, "dl-books")
        check("the exact BookSource.urlFor URL is in dl-books", books == [f"/books/{SAVED}.pdf"], str(books))
        stored = page.evaluate(f"""async () => {{ const r = await (await caches.open('dl-books')).match('books/{SAVED}.pdf');
            const b = new Uint8Array(await (await r.clone().blob()).slice(0,5).arrayBuffer());
            return {{ magic: String.fromCharCode(...b), size: (await r.blob()).size }}; }}""")
        real = os.path.getsize(os.path.join(ROOT, "books", f"{SAVED}.pdf"))
        check("stored copy is the whole PDF", stored["magic"] == "%PDF-" and stored["size"] == real, str(stored))

        page.click("#card-layer .btn--ghost[data-close-layer]")
        page.wait_for_timeout(500)
        badges = page.evaluate("[...document.querySelectorAll('.book')].filter(b => b.querySelector('.book__saved')).map(b => b.dataset.bookId)")
        check("shelf marks only the saved book", badges == [SAVED], str(badges))
        label = page.get_attribute(f".book[data-book-id='{SAVED}']", "aria-label")
        check("saved spine tells screen readers", label.endswith("שמור במכשיר"), label)
        page.screenshot(path=f"{SHOT}/shelf_saved.png")

        # ---------- 3. אין שרת, אין רשת ----------
        server.stop()
        ctx.set_offline(True)
        book_responses.clear()
        page.reload(wait_until="load")
        page.wait_for_timeout(1200)
        check("offline reload: the shelf renders all 4 books",
              page.evaluate("document.querySelectorAll('#library .book').length") == 4)
        check("offline reload: styles applied (stylesheet from cache)",
              page.evaluate("getComputedStyle(document.querySelector('.book')).position") == "relative")
        bar = page.inner_text("[data-offline-bar]")
        check("offline bar is shown and counts the saved book",
              page.locator("[data-offline-bar]").is_visible() and "ספר אחד שמור במכשיר" in bar, bar)
        page.screenshot(path=f"{SHOT}/shelf_offline.png")

        # ---------- 4. ספר שמור נפתח ומדפדף ----------
        page.goto(BASE + f"/#/book/{SAVED}/read/1")
        wait_rendered(page)
        check("offline: saved book opens and renders a page", True)
        n = page.evaluate("Reader.source.numPages")
        page.evaluate(f"Reader.goTo({n - 3})")
        page.wait_for_function(f"() => Reader.currentPage() >= {n - 4}", timeout=10000)
        page.wait_for_timeout(1500)
        check("offline: jumping to a late page renders it",
              page.evaluate(f"""[...document.querySelectorAll('.leaf-canvas[data-rendered]')]
                  .some(c => +c.dataset.rendered >= {n - 5})"""), f"of {n}")
        from_sw = [s for (u, s, sw) in book_responses if sw]
        check("PDF.js got its byte ranges (206) from the service worker",
              206 in from_sw and all(sw for (_, _, sw) in book_responses), str(book_responses[:6]))
        page.screenshot(path=f"{SHOT}/reader_offline.png")

        # ---------- 5. הערות וסימניות בלי רשת ----------
        page.click('[data-act="bookmark"]')
        page.click('[data-act="notes"]')
        page.fill("#notepad-text", "הערה מהטיסה")
        page.wait_for_timeout(1200)
        mark_page = page.evaluate("Reader.currentPage()")
        page.reload(wait_until="load")
        wait_rendered(page)
        page.wait_for_timeout(800)
        check("offline: notes survive a reload", page.input_value("#notepad-text") == "הערה מהטיסה")
        check("offline: bookmark survives a reload", page.evaluate(f"Reader.marks.has({mark_page})"))

        # ---------- 6. ספר שלא נשמר ----------
        page.goto(BASE + f"/#/book/{OTHER}/read/1")
        page.wait_for_selector("#fault:not([hidden])", timeout=8000)
        check("offline: unsaved book explains itself instead of failing",
              page.inner_text("[data-fault-title]") == "הספר הזה לא נשמר במכשיר", page.inner_text("[data-fault-title]"))
        page.screenshot(path=f"{SHOT}/reader_unsaved.png")

        # ---------- 7. אוסף הקלטות ----------
        page.goto(BASE + "/#/")
        page.wait_for_timeout(400)
        page.click("#btn-videos")
        page.wait_for_timeout(500)
        check("offline: the video-store link stays on the shelf and explains why",
              page.url.split("#")[0].endswith(f"{PORT}/") and page.locator("[data-offline-note]").is_visible(),
              page.url)
        check("offline: no JS errors, no CSP violations", not errs and not csp, "; ".join((errs + csp)[:3]))

        # ---------- 8. חזרה לרשת: הסרה ----------
        server.start()
        ctx.set_offline(False)
        page.goto(BASE + f"/#/book/{SAVED}", wait_until="networkidle")
        page.wait_for_selector("[data-offline-save][data-state='saved']")
        page.click("[data-offline-remove]")
        page.wait_for_selector("[data-offline-save][data-state='idle']")
        check("remove deletes the book from the cache", cache_keys(page, "dl-books") == [])

        # ---------- 9. מהדורה קודמת משודרגת לבד ----------
        page.evaluate(f"""async () => {{ const c = await caches.open('dl-books');
            const r = await fetch('books/{REVVED}.pdf', {{cache:'reload'}});
            await c.put('books/{REVVED}.pdf?v=old', new Response(await r.blob(), {{headers:{{'Content-Type':'application/pdf'}}}})); }}""")
        page.goto(BASE + "/#/")
        page.reload(wait_until="networkidle")
        page.wait_for_function(f"""async () => {{ const k = (await (await caches.open('dl-books')).keys()).map(r => r.url);
            return k.length === 1 && k[0].endsWith('/books/{REVVED}.pdf'); }}""", timeout=15000)
        check("an older edition (other ?v=) is replaced by the current one when online", True)

        # ---------- 10. שמירת כל הספרייה ----------
        page.click("#btn-offline")
        page.wait_for_selector("#offline-layer:not([hidden]) .offline-row")
        page.wait_for_timeout(600)
        all_label = page.inner_text("[data-offline-all-label]")
        check("panel lists every book and the total size",
              page.locator(".offline-row").count() == 4 and "MB" in all_label, all_label)
        page.screenshot(path=f"{SHOT}/panel_before.png")
        page.click("[data-offline-all]")
        page.wait_for_function("() => Offline.savedCount() === 4 && Offline.busy.size === 0", timeout=30000)
        page.wait_for_timeout(300)
        check("save-all stores all four books", len(cache_keys(page, "dl-books")) == 4)
        check("panel confirms", "כל 4 הספרים שמורים" in page.inner_text("[data-offline-progress]"),
              page.inner_text("[data-offline-progress]"))
        check("header button counts saved books", page.inner_text("[data-offline-count]") == "4/4")
        page.screenshot(path=f"{SHOT}/panel_after.png")

        check("/api/visits never passes through the service worker",
              api_responses and not any(sw for _, sw in api_responses), str(api_responses[:3]))
        check("whole run: no JS errors, no CSP violations", not errs and not csp, "; ".join((errs + csp)[:3]))

        # כהה
        page.evaluate("Theme.apply('dark', {animate:false})")
        page.wait_for_timeout(300)
        page.screenshot(path=f"{SHOT}/panel_dark.png")
        ctx.close()

        # ---------- 11. נייד ----------
        m = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
        mp = m.new_page()
        mp.goto(BASE + f"/#/book/{SAVED}", wait_until="networkidle")
        mp.wait_for_selector("[data-offline-slot]:not([hidden])")
        over = mp.evaluate("document.scrollingElement.scrollWidth - innerWidth")
        card_over = mp.evaluate("(() => { const c = document.querySelector('.index-card'); return c.scrollWidth - c.clientWidth; })()")
        check("mobile: card with save button fits, no horizontal scroll", over <= 0 and card_over <= 0,
              f"page {over}px, card {card_over}px")
        mp.screenshot(path=f"{SHOT}/m_card.png")
        mp.goto(BASE + "/#/")
        mp.wait_for_timeout(300)
        mp.click("#btn-offline")
        mp.wait_for_timeout(800)
        over = mp.evaluate("document.scrollingElement.scrollWidth - innerWidth")
        check("mobile: offline panel fits", over <= 0, f"{over}px")
        mp.screenshot(path=f"{SHOT}/m_panel.png")
        mp.goto(BASE + "/#/")
        mp.wait_for_timeout(300)
        mp.screenshot(path=f"{SHOT}/m_shelf.png")
        m.close()
        browser.close()
finally:
    server.stop()

print("\n".join(notes + fails))
print(f"\nscreenshots: {SHOT}")
print(f"{len(notes)} passed, {len(fails)} failed")
sys.exit(1 if fails else 0)
