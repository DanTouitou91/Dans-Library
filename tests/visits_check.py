#!/usr/bin/env python3
"""בדיקות מונה המבקרים בדפדפן (assets/visits.js), בשני העמודים.

הפונקציה עצמה (netlify/functions/visits) נבדקת בנפרד ב-tests/visits_test.mjs;
כאן ‏/api/visits מדומה ב-page.route, כי השרת המקומי לא מריץ פונקציות.

הרצה:  python3 tests/cspserve.py &  &&  python3 tests/visits_check.py
"""
import json
import os
import sys
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8788"
CHROME = os.environ.get("DL_CHROME", "")
PAGES = [("/", "library", "ביקורים בספרייה"), ("/videos.html", "videos", "ביקורים בחנות")]

fails, notes = [], []


def check(label, cond, detail=""):
    (notes if cond else fails).append(f"{'PASS' if cond else 'FAIL'}  {label}" + (f"  — {detail}" if detail else ""))


def fake_api(page, calls, status=200, count=350):
    def handler(route, req):
        calls.append((req.method, req.url.split("?", 1)[1]))
        if status != 200:
            return route.fulfill(status=status, body="nope")
        route.fulfill(status=200, content_type="application/json",
                      body=json.dumps({"count": count + (1 if req.method == "POST" else 0)}))
    page.route("**/api/visits?*", handler)


def shown(page):
    return page.evaluate("""(()=>{const v=document.querySelector('[data-visits]');
        const drums=[...v.querySelectorAll('.visits__drum')].map(d=>d.style.getPropertyValue('--d')).join('');
        return {hidden:v.hidden, count:v.dataset.count||null, drums,
                text:v.querySelector('[data-visits-text]').textContent}})()""")


launch = {"args": ["--no-sandbox", "--disable-dev-shm-usage"]}
if CHROME:
    launch["executable_path"] = CHROME

with sync_playwright() as pw:
    browser = pw.chromium.launch(**launch)

    for path, key, noun in PAGES:
        # ---------- ביקור ראשון היום: POST, ואז רענון: GET בלבד ----------
        ctx = browser.new_context(viewport={"width": 1280, "height": 900})
        page = ctx.new_page()
        errs, csp, calls = [], [], []
        page.on("pageerror", lambda e: errs.append(str(e)))
        page.on("console", lambda m: csp.append(m.text) if "Content Security Policy" in m.text else None)
        fake_api(page, calls)

        page.goto(BASE + path, wait_until="networkidle")
        page.wait_for_timeout(1700)            # הגלגול בספרייה נמשך כ-1.8 שניות
        st = shown(page)
        check(f"[{key}] first visit today sends one POST for this page",
              calls == [("POST", f"page={key}")], str(calls))
        check(f"[{key}] counter shows the returned number (351 → 000351)",
              not st["hidden"] and st["count"] == "351" and st["drums"] == "000351", str(st))
        check(f"[{key}] screen-reader text names the number", st["text"] == f"351 {noun}", st["text"])

        page.reload(wait_until="networkidle")
        page.wait_for_timeout(300)
        check(f"[{key}] reload on the same day only reads (GET), never counts again",
              [m for m, _ in calls] == ["POST", "GET"], str(calls))

        # מחר: תאריך שמור של אתמול → נספר שוב
        page.evaluate(f"localStorage.setItem('dl:visits:{key}', '2000-01-01')")
        page.reload(wait_until="networkidle")
        page.wait_for_timeout(300)
        check(f"[{key}] a new day counts again (POST)", calls[-1][0] == "POST", str(calls))
        check(f"[{key}] no JS errors / CSP violations", not errs and not csp, "; ".join((errs + csp)[:2]))
        ctx.close()

        # ---------- השרת לא זמין: המונה נשאר מוסתר ----------
        ctx = browser.new_context(viewport={"width": 1280, "height": 900})
        page = ctx.new_page()
        errs = []
        page.on("pageerror", lambda e: errs.append(str(e)))
        fake_api(page, [], status=500)
        page.goto(BASE + path, wait_until="networkidle")
        page.wait_for_timeout(500)
        check(f"[{key}] failed request keeps the counter hidden (no 0, no error)",
              shown(page)["hidden"] and not errs, str(errs))
        check(f"[{key}] a failed request is not remembered as counted",
              page.evaluate(f"localStorage.getItem('dl:visits:{key}')") is None)
        ctx.close()

        # ---------- נייד ----------
        ctx = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
        page = ctx.new_page()
        fake_api(page, [], count=987654)
        page.goto(BASE + path, wait_until="networkidle")
        page.wait_for_timeout(500)
        over = page.evaluate("document.scrollingElement.scrollWidth - innerWidth")
        check(f"[{key}] mobile: counter visible, no horizontal scroll",
              not shown(page)["hidden"] and over <= 0, f"overflow {over}px")
        ctx.close()

    browser.close()

print("\n".join(notes + fails))
print(f"\n{len(notes)} passed, {len(fails)} failed")
sys.exit(1 if fails else 0)
