#!/usr/bin/env python3
"""בדיקות אוסף קלטות הוידאו של דן — מול GitHub Releases מדומה (tests/fakegithub.py).

כל בדיקה כאן מודדת את מה שקורה בפועל בנגן (currentTime, מצב ניגון, מה שמוצג
על המסך) ולא את מה שהקוד מדווח על עצמו.

הרצה (השרת עם כותרות הייצור חייב לרוץ, כמו ב-verify.py):
    python3 tests/cspserve.py &
    python3 tests/videos_check.py

⚠️ קובץ הבדיקה הוא VP9/Opus בתוך MP4 ולא H.264: כרומיום של playwright
נבנה בלי קודקים מוגנים, ו-H.264 פשוט לא מתנגן בו. הסרטונים האמיתיים של
דן יכולים להיות H.264 — כל דפדפן רגיל מנגן אותם.
"""
import json
import os
import re
import socket
import ssl
import subprocess
import sys
import tempfile
import time
import urllib.request
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8788"
CHROME = os.environ.get("DL_CHROME", "")
SHOT = os.environ.get("DL_SHOTS", tempfile.mkdtemp(prefix="dl-video-shots-"))

REL = "https://github.com/DanTouitou91/Dans-Library/releases/download/videos-v1/test-tape.mp4"
CHAPTERS = [{"t": 0, "title": "פתיחה"}, {"t": 4, "title": "פרק שני: המדינה"}, {"t": 8, "title": "סיכום"}]
CATALOG = {"tapes": [
    {"id": "test-tape", "title": "קלטת בדיקה", "subtitle": "מבוא למדיניות", "colour": "#8E1B2B",
     "src": REL, "duration": 12, "new": True, "chapters": CHAPTERS},
    {"id": "second", "title": "יחסים בינלאומיים", "colour": "#1F3D2B", "src": REL, "duration": 12, "chapters": []},
    # ‏כמו הסרטונים של דן: פתיחה, כותרת חלק, "פרק <מספר>", סיום
    {"id": "numbered", "title": "קלטת ממוספרת", "src": REL, "duration": 12, "chapters": [
        {"t": 0, "title": "פתיחה"}, {"t": 2, "title": "חלק א · יסודות"}, {"t": 3, "title": "פרק 1 · אחד"},
        {"t": 5, "title": "שער ב · המשך"}, {"t": 6, "title": "פרק 2 · שניים"}, {"t": 10, "title": "סיום"}]},
    # ‏מארח שאינו GitHub — חייב להידחות בגלוי, לא להופיע כקלטת שלעולם לא תתנגן
    {"id": "evil", "title": "מארח זר", "src": "https://example.com/x.mp4"},
]}

fails, notes = [], []


def check(label, cond, detail=""):
    (notes if cond else fails).append(f"{'PASS' if cond else 'FAIL'}  {label}" + (f"  — {detail}" if detail else ""))


def free_port():
    s = socket.socket(); s.bind(("127.0.0.1", 0)); p = s.getsockname()[1]; s.close()
    return p


class FakeGitHub:
    """מפעיל את fakegithub.py בתהליך נפרד עם הגדרות תפוגה וקצב."""

    def __init__(self, **env):
        self.port = free_port()
        e = dict(os.environ, FAKEGH_PORT=str(self.port), **{k: str(v) for k, v in env.items()})
        self.proc = subprocess.Popen([sys.executable, os.path.join(HERE, "fakegithub.py")], env=e)
        for _ in range(50):
            try:
                socket.create_connection(("127.0.0.1", self.port), timeout=0.2).close()
                return
            except OSError:
                time.sleep(0.1)
        raise RuntimeError("fakegithub לא עלה")

    def log(self):
        ctx = ssl._create_unverified_context()
        op = urllib.request.build_opener(urllib.request.ProxyHandler({}), urllib.request.HTTPSHandler(context=ctx))
        req = urllib.request.Request(f"https://127.0.0.1:{self.port}/__log", headers={"Host": "github.com"})
        return json.loads(op.open(req, timeout=5).read())

    def count(self, kind):
        return sum(1 for e in self.log() if e["kind"] == kind)

    def stop(self):
        self.proc.terminate()
        self.proc.wait(timeout=5)


def launch(pw, gh, **ctx_opts):
    args = ["--no-sandbox", "--disable-dev-shm-usage", "--no-proxy-server", "--ignore-certificate-errors",
            f"--host-resolver-rules=MAP github.com 127.0.0.1:{gh.port}, "
            f"MAP release-assets.githubusercontent.com 127.0.0.1:{gh.port}"]
    opts = {"args": args}
    if CHROME:
        opts["executable_path"] = CHROME
    browser = pw.chromium.launch(**opts)
    ctx = browser.new_context(**{"viewport": {"width": 1400, "height": 900}, **ctx_opts})
    return browser, ctx


def instrument(page, catalog=CATALOG):
    """רושם שגיאות והפרות CSP, ומחליף את tapes.json בקטלוג הבדיקה."""
    rec = {"errors": [], "csp": []}
    page.on("pageerror", lambda e: rec["errors"].append(str(e)))

    def on_console(m):
        if "Content Security Policy" in m.text or "Refused to" in m.text:
            rec["csp"].append(m.text)
    page.on("console", on_console)
    if catalog is not None:
        page.route("**/tapes.json", lambda r: r.fulfill(status=200, content_type="application/json",
                                                         body=json.dumps(catalog)))
    return rec


VSTATE = """()=>{const v=document.querySelector('.tv__video');return {t:v.currentTime, paused:v.paused,
    err:v.error&&v.error.code, rs:v.readyState, src:v.getAttribute('src'),
    fault:!document.querySelector('[data-fault]').hidden,
    prompt:!document.querySelector('[data-act=play-prompt]').hidden}}"""


def vstate(page):
    return page.evaluate(VSTATE)


def wait_for(page, js, timeout=8000):
    try:
        page.wait_for_function(js, timeout=timeout)
        return True
    except Exception:
        return False


def advancing(page, ms=900):
    a = vstate(page)["t"]; page.wait_for_timeout(ms); b = vstate(page)["t"]
    return b > a + 0.2, a, b


with sync_playwright() as pw:
    # =====================================================================
    # א. זרימה מלאה מול GitHub תקין (כתובת חתומה שלא פגה)
    # =====================================================================
    gh = FakeGitHub(FAKEGH_TTL=300)
    browser, ctx = launch(pw, gh)
    page = ctx.new_page()
    rec = instrument(page)

    # ---------- הכפתור בספרייה ----------
    page.goto(BASE + "/", wait_until="networkidle")
    link = page.locator("#btn-videos")
    check("library masthead links to the video store", link.count() == 1 and link.get_attribute("href") == "videos.html")
    check("library button reads 'לספריית קלטות הוידאו של דן'",
          link.locator(".btn__label").inner_text().strip() == "לספריית קלטות הוידאו של דן")
    link.click()
    page.wait_for_load_state("networkidle")
    check("library button opens videos.html", page.url.endswith("/videos.html"), page.url)

    # ---------- החנות ----------
    page.wait_for_selector(".tape")
    check("store renders the valid tapes only", page.locator(".tape").count() == 3,
          f"found {page.locator('.tape').count()} (הקלטת מהמארח הזר צריכה להידחות)")
    lab = page.locator(".tape[data-tape-id=test-tape]").get_attribute("aria-label") or ""
    check("tape aria-label names title, length and chapters", "קלטת בדיקה" in lab and "3 פרקים" in lab, lab)
    check("'new' sticker shown", page.locator(".tape[data-tape-id=test-tape] .sticker--new").count() == 1)
    check("page is named 'אוסף קלטות הוידאו של דן'", page.title() == "אוסף קלטות הוידאו של דן"
          and page.locator(".sign__title").inner_text().strip() == "אוסף קלטות הוידאו של דן", page.title())
    page.click("#store-view [data-act='about']")
    page.wait_for_timeout(200)
    check("about button opens the about dialog", page.evaluate("document.querySelector('#about-dialog').open"))
    check("about dialog mentions the collection", "אוסף קלטות הוידאו של דן" in page.locator("#about-dialog").inner_text())
    page.keyboard.press("Escape")
    page.wait_for_timeout(200)
    check("Esc closes about and returns focus to its button",
          not page.evaluate("document.querySelector('#about-dialog').open")
          and page.evaluate("document.activeElement.dataset.act") == "about")
    # ---------- מתג האור — אותה הגדרה כמו המנורה בספרייה ----------
    sw = page.locator("#store-view [data-light-toggle]")
    before = page.evaluate("document.documentElement.dataset.theme")
    sw.click()
    page.wait_for_timeout(650)
    after = page.evaluate("document.documentElement.dataset.theme")
    check("light switch toggles the theme", before != after and after in ("light", "dark"), f"{before} → {after}")
    check("switch state is announced (role=switch, aria-checked = light on)",
          sw.get_attribute("role") == "switch" and sw.get_attribute("aria-checked") == ("true" if after == "light" else "false"))
    check("switch shows its current state in words (דלוק/כבוי)",
          sw.locator("[data-light-state]").inner_text() == ("דלוק" if after == "light" else "כבוי"))
    saved = json.loads(page.evaluate("localStorage.getItem('dl:settings')") or "{}")
    check("switch writes the library's own setting and keeps its other fields",
          saved.get("theme") == after and "readerMode" in saved and "zoom" in saved, str(saved))
    page.goto(BASE + "/", wait_until="networkidle")
    check("library opens with the same light state", page.evaluate("document.documentElement.getAttribute('data-theme')") == after)
    page.goto(BASE + "/videos.html", wait_until="networkidle")
    page.wait_for_selector(".tape")
    check("store keeps the light state after reload", page.evaluate("document.documentElement.dataset.theme") == after)
    page.locator("#store-view [data-light-toggle]").click()          # מחזירים את האור לקדמותו
    page.wait_for_timeout(650)
    page.screenshot(path=f"{SHOT}/store-desktop.png")

    # ---------- הכנסת הקלטת ----------
    page.click(".tape[data-tape-id=test-tape]")
    page.wait_for_timeout(450)
    check("cassette animates toward the VCR", page.locator(".cassette").count() == 1)
    page.screenshot(path=f"{SHOT}/insert-mid.png")
    check("hash routes to the tape", page.evaluate("location.hash") == "#/tape/test-tape")
    ok = wait_for(page, "()=>{const v=document.querySelector('.tv__video');return !v.paused && v.currentTime>0.3}")
    check("tape actually plays after insertion", ok, str(vstate(page)))
    adv, a, b = advancing(page)
    check("playback time advances", adv, f"{a:.2f} → {b:.2f}")
    check("cassette removed after insertion", page.locator(".cassette").count() == 0)
    check("zero CSP violations while playing via redirect", not rec["csp"], "; ".join(rec["csp"][:2]))
    check("request went through the GitHub 302", gh.count("redirect") >= 1 and gh.count("asset") >= 1,
          f"redirect={gh.count('redirect')} asset={gh.count('asset')}")
    check("viewer notice about speech/text errors is shown under the player",
          page.locator(".notice").is_visible() and "ייתכנו שיבושים בדיבור או טעויות בטקסט" in page.locator(".notice").inner_text())
    check("tape without a book field hides the book link", not page.locator("[data-book-wrap]").is_visible())
    check("chapter list open beside the TV on desktop", page.locator("#chapters").get_attribute("data-open") == "true")
    page.screenshot(path=f"{SHOT}/player-desktop.png")

    # ---------- פרקים ----------
    page.click(".ch[data-ch='2']")
    ok = wait_for(page, "()=>document.querySelector('.tv__video').currentTime>=8", 4000)
    check("chapter 3 click seeks into chapter 3", ok, str(vstate(page)["t"]))
    check("current chapter marked", page.locator(".ch[aria-current='true']").get_attribute("data-ch") == "2")
    osd = page.locator("[data-osd]").inner_text()
    check("OSD shows CH 03 and its title", "CH 03" in osd and "סיכום" in osd, osd)
    page.screenshot(path=f"{SHOT}/osd-ch3.png")

    page.click("[data-act='prev-ch']")       # בתוך 3 שניות מתחילת הפרק → לפרק הקודם
    ok = wait_for(page, "()=>{const t=document.querySelector('.tv__video').currentTime;return t>=4&&t<7.5}", 3000)
    check("prev-chapter near a chapter start goes to the previous chapter", ok, str(vstate(page)["t"]))
    page.click("[data-act='next-ch']")
    ok = wait_for(page, "()=>document.querySelector('.tv__video').currentTime>=8", 3000)
    check("next-chapter button", ok, str(vstate(page)["t"]))

    # ---------- מקלדת ----------
    page.focus("#player-view")
    page.keyboard.press("Digit1")
    ok = wait_for(page, "()=>document.querySelector('.tv__video').currentTime<3", 3000)
    check("digit 1 jumps to chapter 1", ok, str(vstate(page)["t"]))
    page.keyboard.press("BracketRight")
    ok = wait_for(page, "()=>{const t=document.querySelector('.tv__video').currentTime;return t>=4&&t<8}", 3000)
    check("] jumps to the next chapter", ok, str(vstate(page)["t"]))
    page.keyboard.press("Space")
    page.wait_for_timeout(250)
    check("Space pauses", vstate(page)["paused"])
    page.keyboard.press("KeyK")
    page.wait_for_timeout(300)
    check("K resumes", not vstate(page)["paused"])

    # רווח על כפתור ממוקד חייב להפעיל אותו פעם אחת — לא גם את קיצור הדף
    page.focus("[data-act='play']")
    before = vstate(page)["paused"]
    page.keyboard.press("Space")
    page.wait_for_timeout(300)
    check("Space on the play button toggles exactly once", vstate(page)["paused"] != before)
    if vstate(page)["paused"]:
        page.click("[data-act='play']")

    # ---------- מסך מלא ----------
    page.focus("#player-view")
    page.keyboard.press("KeyF")
    page.wait_for_timeout(500)
    fs = page.evaluate("document.fullscreenElement && document.fullscreenElement.id")
    check("F puts the whole deck in fullscreen (not the bare video)", fs == "deck", str(fs))
    check("chapters and controls live inside the fullscreen element",
          page.evaluate("!!document.fullscreenElement && document.fullscreenElement.contains(document.querySelector('#chapters')) && document.fullscreenElement.contains(document.querySelector('.vcr'))"))
    page.screenshot(path=f"{SHOT}/fullscreen.png")
    page.keyboard.press("KeyF")
    page.wait_for_timeout(400)
    check("F again leaves fullscreen", page.evaluate("!document.fullscreenElement"))

    # ---------- חלונית המקשים ----------
    page.click("[data-act='keys']")
    page.wait_for_timeout(200)
    check("keys dialog opens", page.evaluate("document.querySelector('#keys-dialog').open"))
    n = page.locator("[data-keys-list] dt").count()
    check("keys dialog lists every shortcut", n == page.evaluate("SHORTCUTS.length"), str(n))
    page.keyboard.press("Escape")
    page.wait_for_timeout(200)
    check("Esc closes the dialog and keeps the tape playing",
          page.evaluate("!document.querySelector('#keys-dialog').open") and page.evaluate("location.hash") == "#/tape/test-tape")

    # ---------- המשך צפייה ----------
    page.focus("#player-view")
    page.evaluate("Player.seek(6.5)")
    page.wait_for_timeout(300)
    page.evaluate("Player.pause()")
    page.wait_for_timeout(300)
    page.reload(wait_until="networkidle")
    page.wait_for_selector("[data-act=play-prompt]:not([hidden])", timeout=5000)
    label = page.locator("[data-prompt-label]").inner_text()
    check("direct link shows a play prompt with the resume point", "המשך מ-0:06" in label, label)
    page.click("[data-act=play-prompt]")
    ok = wait_for(page, "()=>{const v=document.querySelector('.tv__video');return !v.paused && v.currentTime>=6}", 4000)
    check("resume continues from the saved position", ok, str(vstate(page)))

    # ---------- חזרה למדף ----------
    page.evaluate("Player.pause()")
    page.wait_for_timeout(200)
    page.click(".room__bar [data-act='back']")
    page.wait_for_timeout(400)
    check("back returns to the store", page.locator("#store-view").is_visible() and not page.locator("#player-view").is_visible())
    check("leaving releases the video download", vstate(page)["src"] is None)
    check("unfinished tape gets a 'not rewound' sticker",
          page.locator(".tape[data-tape-id=test-tape] .sticker--rewind").count() == 1)
    # ⚠️ דן: הפס "לא גולגלה" הסתיר את כותרת המשנה ואת שורת האורך
    hide = page.evaluate("""(()=>{const t=document.querySelector('.tape[data-tape-id=test-tape]');
        const r=e=>t.querySelector(e)?.getBoundingClientRect(); const a=r('.sticker--rewind');
        return ['.tape__sub','.tape__meta'].filter(e=>{const b=r(e);return b&&!(a.bottom<=b.top||a.top>=b.bottom)})})()""")
    check("'not rewound' band covers no text on the box", hide == [], str(hide))
    check("focus returns to the tape that was opened",
          page.evaluate("document.activeElement?.dataset?.tapeId") == "test-tape")

    # ---------- Esc מוציא את הקלטת ----------
    page.click(".tape[data-tape-id=second]")
    page.wait_for_timeout(2400)
    check("tape without chapters: chapter buttons disabled",
          page.locator("[data-act='next-ch']").is_disabled() and page.locator(".ch").count() == 0)
    page.focus("#player-view")
    page.keyboard.press("Escape")
    page.wait_for_timeout(300)
    check("Esc ejects back to the store", page.locator("#store-view").is_visible())

    # ---------- קישורים ישירים ----------
    page.goto(BASE + "/videos.html#/tape/test-tape/2", wait_until="networkidle")
    page.wait_for_selector("[data-act=play-prompt]:not([hidden])", timeout=5000)
    page.click("[data-act=play-prompt]")
    ok = wait_for(page, "()=>{const t=document.querySelector('.tv__video').currentTime;return t>=4&&t<8}", 4000)
    check("#/tape/<id>/2 opens at chapter 2", ok, str(vstate(page)["t"]))
    page.goto(BASE + "/videos.html#/tape/no-such-tape", wait_until="networkidle")
    page.wait_for_timeout(300)
    check("unknown tape falls back to the store", page.locator("#store-view").is_visible()
          and page.evaluate("location.hash") in ("#/", ""))

    # ---------- מספור לפי הכותרת ולא לפי המקום ברשימה ----------
    page.goto(BASE + "/videos.html#/tape/numbered", wait_until="networkidle")
    page.wait_for_selector("[data-act=play-prompt]:not([hidden])", timeout=5000)
    page.click("[data-act=play-prompt]")
    wait_for(page, "()=>!document.querySelector('.tv__video').paused")
    nos = page.evaluate("[...document.querySelectorAll('.ch__no')].map(e=>e.textContent)")
    check("chapter list numbers by title (פרק 1 → 01, headings unnumbered)", nos == ["", "", "01", "", "02", ""], str(nos))
    # ‏"חלק" וגם "שער" — הספר של מינהל ציבורי מחולק לשערים
    check("both 'חלק' and 'שער' headings styled as headings", page.locator("li.ch-part").count() == 2)
    meta = page.evaluate("Store.cover(Catalog.byId('numbered')).querySelector('.tape__meta').textContent")
    check("box counts real chapters, not opening/headings/ending", "2 פרקים" in meta, meta)
    page.focus("#player-view")
    page.keyboard.press("Digit2")
    ok = wait_for(page, "()=>{const t=document.querySelector('.tv__video').currentTime;return t>=6&&t<10}", 3000)
    check("key 2 jumps to 'פרק 2', not to the 2nd list item", ok, str(vstate(page)["t"]))
    osd = page.locator("[data-osd]").inner_text()
    check("OSD numbers by title (CH 02 for פרק 2)", "CH 02" in osd and "שניים" in osd, osd)

    check("no JS errors in the full flow", not rec["errors"], "; ".join(rec["errors"][:2]))
    check("zero CSP violations in the full flow", not rec["csp"], "; ".join(rec["csp"][:2]))
    ctx.close(); browser.close()

    # =====================================================================
    # ב. הקטלוג האמיתי שבמאגר
    # =====================================================================
    browser, ctx = launch(pw, gh)
    page = ctx.new_page()
    rec = instrument(page, catalog=None)
    real = json.load(open(os.path.join(ROOT, "tapes.json"), encoding="utf-8"))
    page.goto(BASE + "/videos.html", wait_until="networkidle")
    page.wait_for_timeout(300)
    n_real = len(real.get("tapes", []))
    lib_ids = set(re.findall(r"^\s+id: '([a-z0-9-]+)',", open(os.path.join(ROOT, "script.js"), encoding="utf-8").read(), re.M))
    bad = [t["id"] for t in real.get("tapes", []) if t.get("book") and t["book"] not in lib_ids]
    check("every tape's book link points to a book that exists in the library", not bad, str(bad))
    if n_real:
        first = real["tapes"][0]
        page.goto(BASE + f"/videos.html#/tape/{first['id']}", wait_until="networkidle")
        page.wait_for_timeout(300)
        if first.get("book"):
            href = page.locator("[data-book-link]").get_attribute("href")
            check("notice links to the tape's book", page.locator("[data-book-link]").is_visible()
                  and href == f"./#/book/{first['book']}", href)
        page.goto(BASE + "/videos.html", wait_until="networkidle")
        page.wait_for_timeout(300)
    shown = page.locator(".tape:not(.tape--blank)").count()
    check("every tape in tapes.json renders (nothing silently rejected)", shown == n_real, f"{shown}/{n_real}")
    if not n_real:
        check("empty catalog shows the 'coming soon' shelf", page.locator(".rack--empty").count() == 1)
    # ⚠️ "מבוא למינהל ולניהול ציבורי" — שם ארוך בשתי שורות עלה עד מדבקת "חדש!"
    hits = page.evaluate("""[...document.querySelectorAll('.tape')].filter(t=>{
        const st=t.querySelector('.sticker--new'); if(!st) return false;
        const r=document.createRange(); r.selectNodeContents(t.querySelector('.tape__title'));
        const a=st.getBoundingClientRect(), b=r.getBoundingClientRect();
        return !(a.bottom<=b.top||a.top>=b.bottom||a.right<=b.left||a.left>=b.right)}).map(t=>t.dataset.tapeId)""")
    check("'new' sticker covers no tape title (real catalog)", hits == [], str(hits))
    check("real catalog page: no JS errors / CSP violations", not rec["errors"] and not rec["csp"],
          "; ".join((rec["errors"] + rec["csp"])[:2]))
    ctx.close(); browser.close()
    gh.stop()

    # =====================================================================
    # ג. הכתובת החתומה פגה באמצע — הבאג שמחכה לכל צפייה של יותר מ-5 דקות
    # =====================================================================
    gh = FakeGitHub(FAKEGH_TTL=2.5, FAKEGH_TTL_AFTER=300, FAKEGH_CHUNK=12000, FAKEGH_DELAY=0.5)
    browser, ctx = launch(pw, gh)
    page = ctx.new_page()
    rec = instrument(page)
    page.goto(BASE + "/videos.html", wait_until="networkidle")
    page.click(".tape[data-tape-id=test-tape]")
    wait_for(page, "()=>document.querySelector('.tv__video').currentTime>0.5", 8000)
    page.evaluate("Player.pause()")
    page.wait_for_timeout(3500)                           # הכתובת החתומה פגה
    page.click(".ch[data-ch='2']")                        # קפיצה לאזור שעוד לא נטען
    ok = wait_for(page, "()=>{const v=document.querySelector('.tv__video');return !v.paused && v.currentTime>=8.2}", 15000)
    st = vstate(page)
    check("seek after the signed URL expired still plays chapter 3", ok, str(st))
    check("the expiry really happened (not a vacuous pass)", gh.count("expired") >= 1,
          f"expired={gh.count('expired')} redirects={gh.count('redirect')}")
    check("recovery fetched a fresh redirect", gh.count("redirect") >= 2, str(gh.count("redirect")))
    check("no fault screen after a recoverable expiry", not st["fault"])
    ok = wait_for(page, "()=>document.querySelector('.tv__video').ended", 10000)
    check("tape plays to the end after recovery", ok, str(vstate(page)))
    check("expiry flow: zero CSP violations", not rec["csp"], "; ".join(rec["csp"][:2]))
    ctx.close(); browser.close()
    gh.stop()

    # =====================================================================
    # ד. כשל קבוע — מסך כחול עם כפתור, לא מסך שחור ולא לולאה אינסופית
    # =====================================================================
    gh = FakeGitHub(FAKEGH_TTL=0.2, FAKEGH_CHUNK=4000, FAKEGH_DELAY=0.4)
    browser, ctx = launch(pw, gh)
    page = ctx.new_page()
    instrument(page)
    page.goto(BASE + "/videos.html", wait_until="networkidle")
    page.click(".tape[data-tape-id=test-tape]")
    ok = wait_for(page, "()=>!document.querySelector('[data-fault]').hidden", 25000)
    check("permanent failure ends on the blue fault screen", ok, str(vstate(page)))
    check("fault screen offers a retry button", page.locator("[data-fault] [data-act='retry']").is_visible())
    reds = gh.count("redirect")
    page.wait_for_timeout(2500)
    check("gives up after bounded retries (no endless loop)", gh.count("redirect") == reds and reds <= 5, str(reds))
    page.screenshot(path=f"{SHOT}/fault.png")
    ctx.close(); browser.close()
    gh.stop()

    # =====================================================================
    # ה. נייד, ותנועה מופחתת
    # =====================================================================
    gh = FakeGitHub(FAKEGH_TTL=300)
    browser, ctx = launch(pw, gh, viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True,
                          reduced_motion="reduce")
    page = ctx.new_page()
    rec = instrument(page)
    page.goto(BASE + "/videos.html", wait_until="networkidle")
    page.wait_for_selector(".tape")
    over = page.evaluate("document.scrollingElement.scrollWidth - innerWidth")
    check("mobile store: no horizontal page scroll", over <= 0, f"overflow {over}px")
    page.screenshot(path=f"{SHOT}/store-mobile.png")
    page.tap(".tape[data-tape-id=test-tape]")
    page.wait_for_timeout(150)
    check("reduced motion: no cassette animation", page.locator(".cassette").count() == 0)
    ok = wait_for(page, "()=>{const v=document.querySelector('.tv__video');return !v.paused && v.currentTime>0.3}")
    check("mobile: tape plays after a tap", ok, str(vstate(page)))
    over = page.evaluate("document.scrollingElement.scrollWidth - innerWidth")
    check("mobile player: no horizontal page scroll", over <= 0, f"overflow {over}px")
    box = page.evaluate("""()=>{const r=e=>document.querySelector(e).getBoundingClientRect();
        const t=r('.tv'), v=r('.vcr');return {tvL:t.left,tvR:t.right,vL:v.left,vR:v.right,vB:v.bottom}}""")
    check("mobile: TV and VCR fit the screen width",
          box["tvL"] >= 0 and box["tvR"] <= 390 and box["vL"] >= 0 and box["vR"] <= 390, str(box))
    check("mobile: VCR controls visible without scrolling", box["vB"] <= 844, str(box))
    check("mobile: chapter list starts closed", page.locator("#chapters").get_attribute("data-open") == "false")
    page.tap("[data-act='chapters']")
    page.wait_for_timeout(200)
    check("mobile: chapters button opens the list", page.locator(".ch").first.is_visible())
    check("mobile: keyboard-shortcuts button hidden", not page.locator("[data-act='keys']").is_visible())
    small = page.evaluate("""()=>[...document.querySelectorAll('.vbtn')].filter(b=>b.offsetParent)
        .map(b=>b.getBoundingClientRect()).filter(r=>r.width<40||r.height<40).length""")
    check("mobile: VCR buttons are at least 40px touch targets", small == 0, f"{small} too small")
    page.screenshot(path=f"{SHOT}/player-mobile.png", full_page=True)
    check("mobile: no JS errors / CSP violations", not rec["errors"] and not rec["csp"],
          "; ".join((rec["errors"] + rec["csp"])[:2]))
    ctx.close(); browser.close()
    gh.stop()

# =====================================================================
# ו. חילוץ הפרקים (tools/chapters.py) — אותם פרקים שהוטמעו בקובץ הבדיקה
# =====================================================================
try:
    out = subprocess.run([sys.executable, os.path.join(ROOT, "tools", "chapters.py"),
                          os.path.join(HERE, "fixtures", "test-tape.mp4")],
                         capture_output=True, text=True, encoding="utf-8", timeout=60)
    got = re.findall(r'\{ t: ([\d.]+), title: "([^"]*)" \}', out.stdout)
    want = [(f"{c['t']:g}", c["title"]) for c in CHAPTERS]
    check("chapters.py extracts exactly the embedded chapters", got == want, f"{got} / {out.stderr[-200:]}")
except FileNotFoundError as e:
    check("chapters.py runs", False, str(e))

print("\n".join(notes + fails))
print(f"\nscreenshots: {SHOT}")
print(f"\n{len(notes)} passed, {len(fails)} failed")
sys.exit(1 if fails else 0)
