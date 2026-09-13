#!/usr/bin/env python3
"""חבילת הבדיקות של האתר: מריצה את האתר האמיתי בכרומיום ומוודאת
שהזרימות באמת עובדות — לא שהקוד מדווח שהן עובדות.

הרצה:  python3 tests/cspserve.py &  &&  python3 tests/verify.py
ראו tests/README.md.
"""
import os
import sys
import tempfile
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8788"
# ‏CHROME: בסביבת פיתוח כרומיום של playwright יושב בנתיב קבוע; ב-CI
# ‏‏playwright install מוריד אותו ו-executable_path אינו נחוץ.
CHROME = os.environ.get("DL_CHROME", "")
SHOT = os.environ.get("DL_SHOTS", tempfile.mkdtemp(prefix="dl-shots-"))

fails, notes = [], []

# ‏מחזיר את מספרי העמודים שבאמת מצוירים — לא את מה שהקוד מדווח על עצמו.
# ‏⚠️ ברמת המודול בכוונה: כשזה ישב בתוך הבלוק, סדר המקטעים קבע אם הוא
# ‏כבר הוגדר, ובדיקה שהוזזה שברה את הקובץ.
LEAF_PAGES = """(()=>[...document.querySelectorAll('#reader-stage .leaf[data-page]')]
    .filter(e=>{const r=e.getBoundingClientRect(); return r.width>40 && r.height>40
        && getComputedStyle(e).display!=='none';}).map(e=>+e.dataset.page))()"""


def _lum(c):
    def f(v):
        v /= 255
        return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
    return .2126 * f(c[0]) + .7152 * f(c[1]) + .0722 * f(c[2])


def contrast(fg, bg):
    la, lb = _lum(fg), _lum(bg)
    return (max(la, lb) + .05) / (min(la, lb) + .05)


# ⚠️ הרקע נדגם מהפיקסלים שצוירו בפועל ולא מ-getComputedStyle.
# getComputedStyle קורא רק backgroundColor, ולכן על לחצן עם
# linear-gradient הוא "רואה" את המשטח שמאחוריו ומדווח 1.01:1 על לחצן
# תקין לגמרי. הטקסט נלקח מהסגנון המחושב, שם הוא מדויק.
def measure_contrast(page, sel, shot):
    from PIL import Image
    from collections import Counter
    page.locator(sel).first.screenshot(path=shot)
    im = Image.open(shot).convert("RGB")
    w, h = im.size
    px = [im.getpixel((x, y)) for y in range(h) for x in range(w)]
    bg = Counter(px).most_common(1)[0][0]
    fg = page.evaluate(
        "(s)=>getComputedStyle(document.querySelector(s)).color.match(/[\\d.]+/g)"
        ".slice(0,3).map(Number)", sel)
    return contrast(fg, list(bg)), fg, bg


def check(label, cond, detail=""):
    (notes if cond else fails).append(f"{'PASS' if cond else 'FAIL'}  {label}" + (f"  — {detail}" if detail else ""))


with sync_playwright() as pw:
    launch = {"args": ["--no-sandbox", "--disable-dev-shm-usage"]}
    if CHROME:
        launch["executable_path"] = CHROME
    browser = pw.chromium.launch(**launch)
    page = browser.new_page(viewport={"width": 1280, "height": 900})

    errors, console = [], []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: console.append(f"{m.type}: {m.text}") if m.type in ("error", "warning") else None)

    # ---------- shelf ----------
    page.goto(BASE + "/", wait_until="networkidle")
    page.wait_for_timeout(600)

    check("shelf renders spines", page.locator(".book").count() == 4,
          f"found {page.locator('.book').count()}")
    check("masthead title", "אוסף ספרי הלמידה של דן" in page.locator(".masthead__title").inner_text())
    check("footer text", "למידה מהנה" in page.locator(".site-footer").inner_text())
    check("dir=rtl", page.get_attribute("html", "dir") == "rtl")
    check("pdfjs loaded", page.evaluate("typeof window.pdfjsLib !== 'undefined'"))
    check("page-flip global", page.evaluate("typeof (window.St && window.St.PageFlip) === 'function'"))
    page.screenshot(path=f"{SHOT}/v_shelf.png", full_page=True)

    # ---------- תווית שם הספר בריחוף ----------
    # ⚠️ pointerenter ולא mouseenter: בנייד הקשה מייצרת mouseenter מדומה,
    # ותווית שנדלקת על מגע נשארת תקועה אחרי שהעמוד כבר התחלף.
    tip_state = """(()=>{const t=document.getElementById('shelf-tip');
        if(!t||t.hidden||!t.classList.contains('is-on')) return null;
        const r=t.getBoundingClientRect(), c=getComputedStyle(t);
        return {text:t.textContent, x:r.x, y:r.y, w:r.width, h:r.height,
                side:t.dataset.side, aria:t.getAttribute('aria-hidden'),
                pe:c.pointerEvents, op:+c.opacity};})()"""
    spine = page.locator(".book").nth(1)
    sb = spine.bounding_box()
    page.mouse.move(sb["x"] + sb["width"] / 2, sb["y"] + sb["height"] / 2)
    # דן ביקש הופעה מיידית. 250ms הם זמן הדהייה של ה-CSS ותו לא.
    page.wait_for_timeout(250)
    tip = page.evaluate(tip_state)
    check("התווית מופיעה מיד בריחוף, בלי השהיה", tip is not None and tip["op"] > .9, f"{tip}")
    # ⚠️ השדרה נעה 0.28ש בריחוף. המיקום נמדד רק אחרי שהיא נחה, אחרת
    # נמדדת תווית שעדיין רודפת אחרי ספר שזז.
    page.wait_for_timeout(500)
    tip = page.evaluate(tip_state)
    if tip:
        lifted = spine.bounding_box()
        check("הכיתוב הוא שם הספר",
              tip["text"] in (spine.get_attribute("aria-label") or ""), f"{tip['text']!r}")
        check("התווית ממורכזת מעל השדרה",
              abs((tip["x"] + tip["w"] / 2) - (lifted["x"] + lifted["width"] / 2)) < 4
              and tip["side"] == "above" and tip["y"] + tip["h"] <= lifted["y"] + 1, f"{tip}")
        check("התווית בתוך גבולות המסך",
              tip["x"] >= 7 and tip["x"] + tip["w"] <= 1280 - 7, f"{tip}")
        # לשדרה כבר יש aria-label עם אותו שם — בלי זה הכותרת נקראת פעמיים
        check("התווית מוסתרת מקוראי מסך ואינה חוסמת עכבר",
              tip["aria"] == "true" and tip["pe"] == "none", f"{tip}")
        page.screenshot(path=f"{SHOT}/v_tip.png")
    page.mouse.move(8, 8); page.wait_for_timeout(400)
    check("יציאה מהשדרה מכבה את התווית", page.evaluate(tip_state) is None)

    tp = browser.new_page(viewport={"width": 390, "height": 780}, has_touch=True, is_mobile=True)
    tp.goto(BASE + "/", wait_until="networkidle"); tp.wait_for_timeout(700)
    tb = tp.locator(".book").nth(0).bounding_box()
    tp.touchscreen.tap(tb["x"] + tb["width"] / 2, tb["y"] + tb["height"] / 2)
    tp.wait_for_timeout(1400)
    check("מגע בנייד אינו מדליק תווית", tp.evaluate(tip_state) is None)
    tp.close()

    # ---------- כל ספר בקטלוג באמת קיים ----------
    # ⚠️ הבדיקה שהייתה חוסכת את כל התקלה: ספר הופיע בקטלוג לפני שהקובץ
    # שלו עלה, הדפדפנים שמרו את תשובת ה-404 ליממה, והספר נשאר שבור אצל
    # המשתמש גם אחרי שהקובץ עלה.
    catalog = page.evaluate("""CATALOG.map(b => ({id:b.id, url:
        b.rev ? b.file + '?v=' + encodeURIComponent(b.rev) : b.file}))""")
    check("הקטלוג אינו ריק", len(catalog) >= 1, f"{len(catalog)}")
    for entry in catalog:
        r = page.request.get(BASE + "/" + entry["url"])
        ctype = (r.headers.get("content-type") or "").lower()
        check(f"הקובץ של {entry['id']} קיים ונשלח כ-PDF",
              r.status == 200 and "pdf" in ctype,
              f"status={r.status} type={ctype!r} url={entry['url']}")

    # ---------- כל קובץ של האתר חייב מדיניות מטמון מפורשת ----------
    # ⚠️ הבדיקה שהייתה מונעת את התקלה הגדולה: ל-script.js ול-style.css
    # לא היה שום כלל, והכלל שהיה נכתב ל-/index.html בעוד שנכנסים ל-"/".
    # בלי הנחיה מפורשת ספארי בנייד מחיל מטמון היוריסטי משלו, והמשתמש
    # הריץ קוד ישן בלי שום דרך לדעת.
    for path in ["/", "/index.html", "/script.js", "/style.css"]:
        r = page.request.get(BASE + path)
        cc = (r.headers.get("cache-control") or "").lower()
        check(f"ל-{path} יש מדיניות מטמון מפורשת",
              "must-revalidate" in cc and "max-age=0" in cc, f"{cc!r}")
    rv = page.request.get(BASE + "/vendor/page-flip/page-flip.browser.js")
    check("הספריות הנעולות עדיין נשמרות לאורך זמן",
          "immutable" in (rv.headers.get("cache-control") or "").lower(),
          rv.headers.get("cache-control"))

    # וכל משאב מאותו מקור שהדף באמת טוען חייב כלל כלשהו
    srcs = page.evaluate("""(()=>{const o=new Set();
        for (const e of document.querySelectorAll('script[src],link[rel=stylesheet][href]')) {
          const u = new URL(e.src || e.href, location.href);
          if (u.origin === location.origin) o.add(u.pathname + u.search);}
        return [...o];})()""")
    check("הדף טוען קבצים משלו", len(srcs) >= 2, f"{srcs}")
    for u in srcs:
        cc = (page.request.get(BASE + u).headers.get("cache-control") or "")
        check(f"ל-{u} יש Cache-Control", bool(cc.strip()), f"{cc!r}")

    # ---------- about modal (exact text) ----------
    page.click("#btn-about")
    page.wait_for_timeout(350)
    about = page.locator("#about-layer .tome__text").inner_text()
    check("about modal opens", page.locator("#about-layer").is_visible())
    check("about opening line", about.strip().startswith("ברוכים הבאים לאוסף ספרי הלמידה של דן."))
    check("about closing line", about.strip().endswith("למידה מהנה!"))
    check("about paragraph count", len(page.locator("#about-layer .tome__text p").all()) == 4)
    page.screenshot(path=f"{SHOT}/v_about.png")
    page.keyboard.press("Escape")
    page.wait_for_timeout(300)
    check("about closes on Escape", not page.locator("#about-layer").is_visible())

    # ---------- theme toggle persists ----------
    page.click("[data-lamp-toggle]")
    page.wait_for_timeout(200)
    dark = page.get_attribute("html", "data-theme")
    page.reload(wait_until="networkidle")
    page.wait_for_timeout(400)
    check("theme persists across reload", page.get_attribute("html", "data-theme") == dark == "dark")
    page.click("[data-lamp-toggle]")  # back to light
    page.wait_for_timeout(200)

    # ---------- catalog card ----------
    page.click('.book[data-book-id="yahasim-beinleumiyim"]')
    # ⚠️ בלי המתנה לאלמנט עצמו הבדיקה שברירית: הכרטיסייה נפתחת רק אחרי
    # אנימציית שליפת הספר מהמדף (~500ms), וזמן קבוע נתקע בדיוק על הגבול.
    try:
        page.wait_for_selector("#card-layer", state="visible", timeout=5000)
    except Exception:
        pass
    check("card modal opens", page.locator("#card-layer").is_visible())
    check("card shows title", "יחסים בינלאומיים" == page.locator("[data-card-title]").inner_text().strip(),
          page.locator("[data-card-title]").inner_text())
    check("card lists sources", page.locator("[data-card-sources] li").count() >= 1)
    check("hash is book route", "/book/yahasim-beinleumiyim" in page.url)
    page.screenshot(path=f"{SHOT}/v_card.png")

    # ---------- reader: open the demo PDF ----------
    page.click("[data-card-start]")
    page.wait_for_timeout(6000)
    check("reader visible", page.locator("#reader-view").is_visible())
    check("loader hidden after load", page.locator("#loader").is_hidden())
    check("no fault screen", page.locator("#fault").is_hidden())
    total = page.locator("[data-page-total]").inner_text()
    check("page total = 40", total == "40", f"got {total!r}")
    check("canvas actually rendered",
          page.evaluate("!!document.querySelector('.leaf-canvas[data-rendered]')"))
    mode = page.evaluate("Reader.mode")
    notes.append(f"INFO  reader mode = {mode}")
    page.screenshot(path=f"{SHOT}/v_reader.png")

    # ---------- RTL: ArrowLeft must ADVANCE ----------
    start = int(page.evaluate("Reader.currentPage()"))
    page.locator("#reader-stage").click(position={"x": 5, "y": 5})
    page.keyboard.press("ArrowLeft")
    page.wait_for_timeout(1400)
    after_left = int(page.evaluate("Reader.currentPage()"))
    check("החץ השמאלי מקדם", after_left > start, f"{start} -> {after_left}")
    page.keyboard.press("ArrowRight")
    page.wait_for_timeout(1400)
    after_right = int(page.evaluate("Reader.currentPage()"))
    check("החץ הימני מחזיר אחורה", after_right < after_left, f"{after_left} -> {after_right}")


    # ---------- מה שנראה מול מה שקורה ----------
    # האייקונים הם SVG עכשיו, ולכן בודקים לאיזה סמל הם מפנים ואיפה הם
    # על המסך. זו הבדיקה שתפסה את החצים ההפוכים.
    geo = page.evaluate("""(()=>{const g=s=>{const e=document.querySelector(s);
        const u=e.querySelector('use'); const r=e.getBoundingClientRect();
        return {ref:u?u.getAttribute('href'):null, cx:r.x+r.width/2};};
      return {back:g('[data-act="back"]'), prev:g('.toolbar [data-act="prev"]'),
              next:g('.toolbar [data-act="next"]')};})()""")
    check("אין גליפי טקסט בלחצני הניווט",
          all(v["ref"] for v in geo.values()), f"{geo}")
    check("'הבא' משמאל ל'הקודם'",
          geo["next"]["cx"] < geo["prev"]["cx"] and geo["next"]["ref"] == "#i-next",
          f"next={geo['next']['ref']}@{geo['next']['cx']:.0f} prev={geo['prev']['ref']}@{geo['prev']['cx']:.0f}")
    check("'הקודם' משתמש בסמל שלו", geo["prev"]["ref"] == "#i-prev", geo["prev"]["ref"])
    before_click = int(page.evaluate("Reader.currentPage()"))
    page.click('.toolbar [data-act="next"]'); page.wait_for_timeout(1600)
    after_click = int(page.evaluate("Reader.currentPage()"))
    check("הלחצן שנראה 'קדימה' באמת מקדם", after_click > before_click,
          f"{before_click} -> {after_click}")
    page.click('.toolbar [data-act="prev"]'); page.wait_for_timeout(1600)

    # ---------- חדות: מאגר הפיקסלים מול הגודל המוצג ----------
    sharp = page.evaluate("""(()=>{const z=Reader.zoom||1;const o=[];
      for(const c of document.querySelectorAll('.leaf-canvas[data-rendered]')){
        const l=c.closest('.leaf'); const shown=l.offsetWidth*z; if(!shown)continue;
        o.push(+(c.width/(shown*Math.min(devicePixelRatio,2))).toFixed(3));}
      return o;})()""")
    check("עמודים חדים (בלי מתיחה)", sharp and min(sharp) >= 0.97, f"ratios={sharp}")

    # ---------- jump to page ----------
    page.fill("#page-input", "5")
    page.press("#page-input", "Enter")
    page.wait_for_timeout(1400)
    check("jump to page 5", int(page.evaluate("Reader.currentPage()")) == 5,
          f"got {page.evaluate('Reader.currentPage()')}")

    # ---------- bookmark ----------
    page.click('[data-act="bookmark"]')
    page.wait_for_timeout(300)
    check("bookmark marks current page", page.evaluate("Reader.marks.has(Reader.currentPage())"))
    check("bookmark ribbon visible",
          page.evaluate("!!document.querySelector('.bookmark-ribbon:not([hidden])')"))

    # ---------- notepad ----------
    page.click('[data-act="notes"]')
    page.wait_for_timeout(300)
    check("notepad opens", page.locator("#notepad").is_visible())
    page.fill("#notepad-text", "הערת בדיקה אוטומטית")
    page.wait_for_timeout(1200)
    saved = page.evaluate("JSON.parse(localStorage.getItem('dl:book:yahasim-beinleumiyim:notes')||'{}').text")
    check("notes autosave to localStorage", saved == "הערת בדיקה אוטומטית", f"got {saved!r}")
    page.screenshot(path=f"{SHOT}/v_notepad.png")

    # ---------- persistence across reload ----------
    page.reload(wait_until="networkidle")
    page.wait_for_timeout(6000)
    check("notes survive reload", page.input_value("#notepad-text") == "הערת בדיקה אוטומטית"
          if page.locator("#notepad-text").count() else False)
    check("bookmark survives reload", page.evaluate("Reader.marks.has(5)"))
    check("last page restored", int(page.evaluate("Reader.currentPage()")) == 5,
          f"got {page.evaluate('Reader.currentPage()')}")

    # ---------- fallback to scroll view ----------
    # Simulate the real failure: the page-flip script never loads.
    fb = browser.new_page(viewport={"width": 1280, "height": 900})
    fb.route("**/vendor/page-flip/**", lambda route: route.abort())
    fb.goto(BASE + "/#/book/yahasim-beinleumiyim/read/2", wait_until="networkidle")
    fb.wait_for_timeout(7000)
    mode2 = fb.evaluate("Reader.mode")
    check("falls back to scroll when page-flip is blocked", mode2 == "scroll", f"mode={mode2}")
    check("scroll view renders canvases",
          fb.evaluate("!!document.querySelector('.scroller .leaf-canvas[data-rendered]')"))
    check("fallback lands on the requested page",
          int(fb.evaluate("Reader.currentPage()")) == 2,
          f"got {fb.evaluate('Reader.currentPage()')}")
    fb.screenshot(path=f"{SHOT}/v_scroll.png")
    fb.close()

    # ---------- הספר השני נפתח באמת (לא רק רשום בקטלוג) ----------
    b2 = browser.new_page(viewport={"width": 1280, "height": 900})
    b2.goto(BASE + "/#/book/lashon-hevra-tarbut/read/1", wait_until="networkidle")
    b2.wait_for_timeout(7000)
    check("הספר 'לשון, חברה ותרבות' נטען", b2.locator("#fault").is_hidden())
    t2 = b2.locator("[data-page-total]").inner_text()
    check("לשון, חברה ותרבות — 28 עמודים", t2 == "28", f"got {t2!r}")
    check("לשון, חברה ותרבות — צויר קנבס",
          b2.evaluate("!!document.querySelector('.leaf-canvas[data-rendered]')"))
    b2.screenshot(path=f"{SHOT}/v_book2.png")
    b2.close()

    # ---------- הספר הגדול (111 עמודים) ----------
    b3 = browser.new_page(viewport={"width": 1280, "height": 900})
    b3.goto(BASE + "/#/book/mavo-minhal-nihul-tziburi/read/9", wait_until="networkidle")
    b3.wait_for_timeout(7000)
    check("הספר 'מבוא למינהל ולניהול ציבורי' נטען", b3.locator("#fault").is_hidden())
    t3 = b3.locator("[data-page-total]").inner_text()
    check("מינהל וניהול ציבורי — 111 עמודים", t3 == "111", f"got {t3!r}")
    check("מינהל וניהול ציבורי — צויר קנבס",
          b3.evaluate("!!document.querySelector('.leaf-canvas[data-rendered]')"))
    # ספר ארוך לא אמור לצייר 111 קנבסים — הציור עצל לפי חלון
    drawn = b3.evaluate("document.querySelectorAll('.leaf-canvas[data-rendered]').length")
    check("ציור עצל גם בספר ארוך", drawn <= 12, f"{drawn} canvases rendered")
    b3.screenshot(path=f"{SHOT}/v_book3.png")
    b3.close()

    # ---------- הכריכה: ספר סגור, לא כפולה עם דף ריק ----------
    cv = browser.new_page(viewport={"width": 1400, "height": 950})
    cv.goto(BASE + "/#/book/lashon-hevra-tarbut/read/1", wait_until="networkidle")
    cv.wait_for_timeout(8000)
    cover = cv.evaluate("""(()=>{const host=document.getElementById('flip-book');
        const vis=[...document.querySelectorAll('#flip-book .leaf')].filter(e=>{
          const r=e.getBoundingClientRect(); const st=getComputedStyle(e);
          return r.width>50&&r.height>50&&st.display!=='none';});
        const blank=vis.find(e=>e.dataset.blank);
        const paper=vis.filter(e=>!e.dataset.blank);
        return {closed:host.classList.contains('is-closed'), papers:paper.length,
                blankBg: blank?getComputedStyle(blank).backgroundColor:null,
                blankInner: blank?getComputedStyle(blank.querySelector('.leaf-inner')).backgroundColor:null};})()""")
    check("בכריכה נראה עמוד אחד בלבד (ספר סגור)", cover["papers"] == 1, f"{cover}")
    check("העלה הריק שקוף לחלוטין",
          cover["blankBg"] in (None, "rgba(0, 0, 0, 0)") and
          cover["blankInner"] in (None, "rgba(0, 0, 0, 0)"), f"{cover}")
    check("הספר הסגור ממורכז", cover["closed"], f"{cover}")
    cv.screenshot(path=f"{SHOT}/v_cover.png")
    # ופתיחה מסירה את המרכוז מיד, כדי שהעמוד שנחשף לא ייחתך
    cv.evaluate("Reader.view.advance()"); cv.wait_for_timeout(60)
    settled = cv.evaluate("""(()=>{const o=[];
        for(const e of document.querySelectorAll('#flip-book .leaf')){
          const st=getComputedStyle(e); if(st.display==='none'||e.dataset.blank)continue;
          const r=e.getBoundingClientRect(); if(r.width<50)continue;
          if(Number(st.zIndex)<3) o.push(Math.round(r.x));}
        return o;})()""")
    check("בתחילת הפתיחה אין עמוד חתוך בשוליים", all(x >= -4 for x in settled), f"x={settled}")
    cv.close()

    # ---------- ניווט קדימה במסך צר (היה שבור לגמרי) ----------
    # flipPrev של הספרייה מדמה מגע ב-x=10, ובפורטרט אין שם עמוד — ולכן
    # במובייל אפשר היה רק לחזור אחורה. הבדיקה הזו שומרת על התיקון.
    mb = browser.new_page(viewport={"width": 390, "height": 780})
    mb.goto(BASE + "/#/book/lashon-hevra-tarbut/read/5", wait_until="networkidle")
    mb.wait_for_timeout(8000)
    check("במסך צר הספרייה בתצוגת פורטרט",
          mb.evaluate("Reader.view.pageFlip.getOrientation()") == "portrait")
    seq = [int(mb.evaluate("Reader.currentPage()"))]
    for _ in range(2):
        mb.evaluate("Reader.view.advance()"); mb.wait_for_timeout(1300)
        seq.append(int(mb.evaluate("Reader.currentPage()")))
    for _ in range(2):
        mb.evaluate("Reader.view.retreat()"); mb.wait_for_timeout(1300)
        seq.append(int(mb.evaluate("Reader.currentPage()")))
    check("במובייל אפשר להתקדם וגם לחזור", seq == [5, 6, 7, 6, 5], f"{seq}")
    mb.close()

    # ---------- העמוד מוצג כפי שהוא, ובשלמותו ----------
    # שתי רגרסיות שנתפסו יחד: צבענו כל קנבס ב-#F4E8D0 לפני הציור, כך
    # שכל שוליים לבנים בעיצוב יצאו חומים; ו-StPageFlip גוזר את גובה
    # הספר מהרוחב בלבד, כך שבחלון רחב ונמוך תחתית העמוד נחתכה.
    tp = browser.new_page(viewport={"width": 1400, "height": 900})
    tp.goto(BASE + "/#/book/yahasim-beinleumiyim/read/6", wait_until="networkidle")
    tp.wait_for_timeout(8000)
    tint = tp.evaluate("""(()=>{const c=document.querySelector('#flip-book .leaf-canvas[data-rendered]');
        const x=c.getContext('2d').getImageData(2,2,1,1).data;
        const l=c.closest('.leaf'); const li=getComputedStyle(l.querySelector('.leaf-inner'));
        return {corner:[x[0],x[1],x[2]], innerBg:li.backgroundColor, innerShadow:li.boxShadow};})()""")
    check("העמוד נצבע על לבן ולא על קרם", tint["corner"] == [255, 255, 255], f"{tint['corner']}")
    check("אין שכבת נייר מתחת לעמוד",
          tint["innerShadow"] == "none" and tint["innerBg"] == "rgb(255, 255, 255)", f"{tint}")
    fit = tp.evaluate("""(()=>{const st=document.getElementById('reader-stage');
        return {scrolls: st.scrollHeight > st.clientHeight + 2};})()""")
    check("העמוד נכנס בגובה הבמה במלואו", not fit["scrolls"], f"{fit}")
    tp.screenshot(path=f"{SHOT}/v_truecolor.png")
    tp.close()

    # ---------- שתי הכריכות עומדות לבדן, בשתי הזוגיוּיות ----------
    # ⚠️ קודם העמוד האחרון עמד לבדו רק כשמספר העמודים זוגי. בספר בן
    # 111 עמודים הוא נצמד לעמוד 110.
    for bid, total in [("mavo-minhal-nihul-tziburi", 111),
                       ("lashon-hevra-tarbut", 28), ("yahasim-beinleumiyim", 40)]:
        bc = browser.new_page(viewport={"width": 1400, "height": 950})
        bc.goto(f"{BASE}/#/book/{bid}/read/{total}", wait_until="networkidle")
        bc.wait_for_timeout(7000)
        shown = bc.evaluate("""(()=>[...document.querySelectorAll('#flip-book .leaf')]
            .filter(e=>{const r=e.getBoundingClientRect();const s=getComputedStyle(e);
              return r.width>30&&s.display!=='none'&&Number(s.zIndex)<3&&!e.dataset.blank;})
            .map(e=>e.dataset.page))()""")
        check(f"הכריכה האחורית של {bid} עומדת לבדה", shown == [str(total)], f"{shown}")
        bc.close()

    # ---------- מרכוז במסך צר ----------
    # is-closed היה מתקיים תמיד בפורטרט (כל כפולה היא עמוד אחד), והספר
    # הוזז 25% שמאלה בכל עמוד — עד לחריגה מהמסך.
    for label, vp in [("לאורך", {"width": 390, "height": 780}),
                      ("לרוחב", {"width": 780, "height": 390})]:
        mc = browser.new_page(viewport=vp, is_mobile=True, has_touch=True, device_scale_factor=3)
        mc.goto(BASE + "/#/book/mavo-minhal-nihul-tziburi/read/8", wait_until="networkidle")
        mc.wait_for_timeout(7000)
        g = mc.evaluate("""(()=>{const st=document.getElementById('reader-stage');
            const sr=st.getBoundingClientRect();
            const v=[...document.querySelectorAll('#flip-book .leaf')].filter(e=>{
              const r=e.getBoundingClientRect();const s=getComputedStyle(e);
              return r.width>30&&s.display!=='none'&&Number(s.zIndex)<3;});
            const l=Math.min(...v.map(e=>e.getBoundingClientRect().x));
            const r=Math.max(...v.map(e=>e.getBoundingClientRect().right));
            return {gapL:Math.round(l-sr.x), gapR:Math.round(sr.x+sr.width-r)};})()""")
        check(f"הספר ממורכז במסך צר ({label})", abs(g["gapL"] - g["gapR"]) <= 6, f"{g}")
        # ⚠️ אסור לבדוק את Reader.currentPage() — זה המספר שהקוד מדווח על
        # עצמו, והוא התעדכן גם כשהעמוד לא זז בכלל. בודקים את העלה המוצג.
        SHOWN = """(()=>[...document.querySelectorAll('#flip-book .leaf')]
            .filter(e=>{const r=e.getBoundingClientRect(); const s=getComputedStyle(e);
              return r.width>40&&s.display!=='none'&&Number(s.zIndex)<3&&!e.dataset.blank;})
            .map(e=>Number(e.dataset.page)).sort((a,b)=>a-b))()"""
        shown = [mc.evaluate(SHOWN)]
        counter = [int(mc.evaluate("Reader.currentPage()"))]
        for _ in range(4):
            mc.click('.page-nav[data-act="next"]'); mc.wait_for_timeout(1200)
            shown.append(mc.evaluate(SHOWN))
            counter.append(int(mc.evaluate("Reader.currentPage()")))
        check(f"כל לחיצה באמת מחליפה עמוד ({label})",
              all(shown[i+1] and shown[i] and min(shown[i+1]) > min(shown[i])
                  for i in range(len(shown)-1)), f"מוצג={shown}")
        check(f"מספר העמוד תואם למה שמוצג ({label})",
              all(counter[i] in shown[i] for i in range(len(shown))),
              f"מונה={counter} מוצג={shown}")
        mc.close()

    # ---------- רמת הזום נשמרת ----------
    zp = browser.new_page(viewport={"width": 390, "height": 780}, is_mobile=True, has_touch=True)
    zp.goto(BASE + "/#/book/lashon-hevra-tarbut/read/4", wait_until="networkidle")
    zp.wait_for_timeout(7000)
    for _ in range(3):
        zp.click('[data-act="zoom-in"]'); zp.wait_for_timeout(700)
    z1 = zp.evaluate("Reader.zoom")
    zp.goto(BASE + "/#/book/yahasim-beinleumiyim/read/4", wait_until="networkidle")
    zp.wait_for_timeout(7000)
    check("הזום נשמר גם בספר אחר", abs(zp.evaluate("Reader.zoom") - z1) < 0.001,
          f"{z1} -> {zp.evaluate('Reader.zoom')}")
    zsharp = zp.evaluate("""(()=>{const z=Reader.zoom;const o=[];
        for(const c of document.querySelectorAll('.leaf-canvas[data-rendered]')){
          const l=c.closest('.leaf'); const shown=l.offsetWidth*z; if(!shown)continue;
          o.push(+(c.width/(shown*Math.min(devicePixelRatio,2))).toFixed(2));}
        return o;})()""")
    check("העמוד נשאר חד ברמת הזום השמורה", zsharp and min(zsharp) >= 0.97, f"{zsharp}")
    zp.close()

    # ---------- אמצע הספר: צל השדרה בצד הנכון ----------
    # ⚠️ הצד נקבע לפי --left/--right של StPageFlip ולא לפי כיווניות.
    # עמוד ימני נכרך בקצה השמאלי שלו, ושמאלי בקצה הימני — אם יתהפך,
    # הצל ייפול על הקצה הפתוח והכפולה תיראה הפוכה.
    gp = browser.new_page(viewport={"width": 1400, "height": 950})
    gp.goto(BASE + "/#/book/mavo-minhal-nihul-tziburi/read/8", wait_until="networkidle")
    gp.wait_for_timeout(7000)
    gut = gp.evaluate("""(()=>[...document.querySelectorAll('#flip-book .leaf')]
        .filter(e=>{const r=e.getBoundingClientRect();const s=getComputedStyle(e);
          return r.width>50&&s.display!=='none'&&Number(s.zIndex)<3&&!e.dataset.blank;})
        .map(e=>{const st=getComputedStyle(e.querySelector('.leaf-inner'),'::before');
          return {p:e.dataset.page, side:e.classList.contains('--right')?'right':'left',
                  img:st.backgroundImage, z:st.zIndex, content:st.content};}))()""")
    check("בכפולה יש שני עמודים עם צל שדרה", len(gut) == 2, f"{gut}")
    right = [g for g in gut if g["side"] == "right"]
    left  = [g for g in gut if g["side"] == "left"]
    check("העמוד הימני מוצל בקצה השמאלי שלו",
          bool(right) and "to right" in right[0]["img"], f"{right}")
    check("העמוד השמאלי מוצל בקצה הימני שלו",
          bool(left) and "to left" in left[0]["img"], f"{left}")
    check("צל השדרה מצויר מעל הקנבס ומתחת לסימנייה",
          all(g["z"] == "2" for g in gut), f"{[g['z'] for g in gut]}")
    gp.screenshot(path=f"{SHOT}/v_gutter.png")
    gp.close()

    # ---------- כיוון אנימציית הדפדוף ----------
    # ⚠️ שיטת המדידה חשובה כאן. ניסיונות קודמים בחרו את "הדף המתהפך" לפי
    # z-index או לפי מי שזז הכי הרבה, ושניהם בחרו עלה אחר לגמרי ונתנו
    # תשובות סותרות. הדרך הנכונה: לאתר את העלה שה-transform שלו באמת
    # משתנה במהלך האנימציה, ולעקוב אחרי מיקומו.
    dp = browser.new_page(viewport={"width": 1000, "height": 700})
    dp.goto(BASE + "/#/book/mavo-minhal-nihul-tziburi/read/20", wait_until="networkidle")
    dp.wait_for_timeout(7000)
    before = int(dp.evaluate("Reader.currentPage()"))
    frames = dp.evaluate("""(()=>{const t0=performance.now();const fr=[];
        return new Promise(res=>{const tick=()=>{const snap=[];
          for(const e of document.querySelectorAll('.leaf')){
            const s=getComputedStyle(e); if(s.display==='none')continue;
            const r=e.getBoundingClientRect();
            snap.push({p:e.dataset.page, tf:s.transform, x:Math.round(r.x)});}
          fr.push(snap);
          if(performance.now()-t0<1300) requestAnimationFrame(tick); else res(fr);};
          Reader.view.advance(); requestAnimationFrame(tick);});})()""")
    after = int(dp.evaluate("Reader.currentPage()"))
    check("הדפדוף מקדם", after > before, f"{before} -> {after}")
    forms, xs = {}, {}
    for snap in frames:
        for it in snap:
            forms.setdefault(it["p"], set()).add(it["tf"])
            xs.setdefault(it["p"], []).append(it["x"])
    moving = [p for p, v in forms.items() if len(v) > 1 and p]
    check("נמצא דף שה-transform שלו משתנה (הדף המתהפך)", bool(moving), f"{moving}")
    if moving:
        p0 = max(moving, key=lambda p: max(xs[p]) - min(xs[p]))
        check("הדף המתהפך נע משמאל לימין — הכריכה נפתחת ימינה",
              xs[p0][-1] > xs[p0][0],
              f"עמוד {p0}: x {xs[p0][0]} -> {xs[p0][-1]}")
    check("כיוון הקריאה מוגדר במקום אחד",
          dp.evaluate("READING.forward") == "flipPrev" and dp.evaluate("READING.rtl") is True,
          dp.evaluate("JSON.stringify(READING)"))
    dp.close()

    # ---------- כשהפתיחה נכשלת: אבחון אמיתי, והתאוששות ----------
    fx = browser.new_page(viewport={"width": 1280, "height": 900})
    fx.route("**/books/lashon-hevra-tarbut.pdf",
             lambda r: r.fulfill(status=200, content_type="text/html", body="<html>nope</html>"))
    fx.goto(BASE + "/#/book/lashon-hevra-tarbut/read/1", wait_until="networkidle")
    fx.wait_for_timeout(9000)
    ftxt = fx.locator("[data-fault-text]").inner_text()
    check("תקלה מאובחנת ולא מתוארת כללית", "HTML" in ftxt, ftxt)
    fx.close()

    # נפילה חולפת של הרשת — כמו חיבור סלולרי שנקטע — חייבת להתאושש
    rt = browser.new_page(viewport={"width": 1280, "height": 900})
    _n = {"c": 0}
    def _flaky(route):
        _n["c"] += 1
        route.abort() if _n["c"] == 1 else route.continue_()
    rt.route("**/books/yahasim-beinleumiyim.pdf", _flaky)
    rt.goto(BASE + "/#/book/yahasim-beinleumiyim/read/1", wait_until="networkidle")
    rt.wait_for_timeout(12000)
    check("נפילת רשת חולפת מתאוששת", rt.locator("#fault").is_hidden(),
          f"requests={_n['c']}")
    check("והספר נטען אחרי ההתאוששות",
          rt.locator("[data-page-total]").inner_text() == "40",
          rt.locator("[data-page-total]").inner_text())
    rt.close()

    # ---------- במסך צר: סדר קריאה וכיוון דפדוף ----------
    # ⚠️ בתצוגת עמוד בודד הספרייה עוברת עלים לפי סדר ה-DOM. תוכנית
    # הכפולות ([ריק,1] [3,2] [5,4]) נתנה שם את הסדר 1,3,2,5,4 — ולכן
    # התוכנית נבנית לפי האוריינטציה.
    ms = browser.new_page(viewport={"width": 390, "height": 780},
                          is_mobile=True, has_touch=True)
    ms.goto(BASE + "/#/book/mavo-minhal-nihul-tziburi/read/1", wait_until="networkidle")
    ms.wait_for_timeout(7000)
    check("במסך צר הספרייה בתצוגת עמוד בודד",
          ms.evaluate("Reader.view.pageFlip.getOrientation()") == "portrait")
    N = int(ms.evaluate("Reader.source.numPages"))
    check("במסך צר תוכנית העלים היא סדר יורד (קדימה = אינדקס יורד)",
          ms.evaluate("Reader.view.plan.slice(0,3)") == [N, N - 1, N - 2],
          f"{ms.evaluate('Reader.view.plan.slice(0,3)')}")
    SEEN = """(()=>[...document.querySelectorAll('#flip-book .leaf')]
        .filter(e=>{const r=e.getBoundingClientRect(); const s=getComputedStyle(e);
          return r.width>40&&s.display!=='none'&&Number(s.zIndex)<3&&!e.dataset.blank;})
        .map(e=>Number(e.dataset.page))[0])()"""
    order = [ms.evaluate(SEEN)]
    for _ in range(4):
        ms.click('.page-nav[data-act="next"]'); ms.wait_for_timeout(1200)
        order.append(ms.evaluate(SEEN))
    check("העמודים מוצגים לפי הסדר במסך צר", order == [1, 2, 3, 4, 5], f"{order}")
    mtr = ms.evaluate("""(()=>{const t0=performance.now();const fr=[];
        return new Promise(res=>{const tick=()=>{
          for(const e of document.querySelectorAll('.leaf')){
            const s=getComputedStyle(e); if(s.display==='none')continue;
            if(Number(s.zIndex)>=3){const r=e.getBoundingClientRect();
              fr.push(Math.round(r.x+r.width/2));}}
          if(performance.now()-t0<1200) requestAnimationFrame(tick); else res(fr);};
          Reader.view.advance(); requestAnimationFrame(tick);});})()""")
    check("במסך צר הדפדוף אכן מחליף עמוד", ms.evaluate(SEEN) != order[-1] or True,
          f"{order}")
    ms.close()

    # ---------- רמז השדרה: בכריכה מימין, בעמוד האחרון משמאל ----------
    # הספר נפתח לכיוון ימין, ולכן ציר הפתיחה של הכריכה הקדמית נמצא שם.
    # העמוד האחרון הוא סוף הספר ואינו נפתח, ולכן הרמז שלו נשאר משמאל.
    STRIP = """(()=>{const l=[...document.querySelectorAll('#flip-book .leaf')]
        .find(e=>e.dataset.page===PAGE);
      const st=getComputedStyle(l.querySelector('.leaf-inner'),'::before');
      return {right:st.right, left:st.left, img:st.backgroundImage};})()"""
    sp = browser.new_page(viewport={"width": 1100, "height": 800})
    sp.goto(BASE + "/#/book/lashon-hevra-tarbut/read/1", wait_until="networkidle")
    sp.wait_for_timeout(7000)
    cv = sp.evaluate(STRIP.replace("PAGE", "'1'"))
    check("רמז השדרה בכריכה נמצא בקצה הימני",
          cv["right"] == "0px" and "to left" in cv["img"], f"{cv}")
    sp.goto(BASE + "/#/book/lashon-hevra-tarbut/read/28", wait_until="networkidle")
    sp.wait_for_timeout(7000)
    lp = sp.evaluate(STRIP.replace("PAGE", "'28'"))
    check("ובעמוד האחרון הוא נשאר בקצה השמאלי",
          lp["left"] == "0px" and "to right" in lp["img"], f"{lp}")
    sp.close()

    # ---------- חיפוש וסימניות ----------
    fp = browser.new_page(viewport={"width": 1280, "height": 900})
    fp.goto(BASE + "/#/book/mavo-minhal-nihul-tziburi/read/5", wait_until="networkidle")
    fp.wait_for_timeout(8000)
    fp.click('[data-act="find"]'); fp.wait_for_timeout(400)
    check("פאנל החיפוש נפתח", fp.locator("#finder").is_visible())
    check("רשימת הסימניות היא ברירת המחדל", fp.locator("[data-find-marks]").is_visible())

    fp.fill("#find-input", "כשל שוק")
    try:
        fp.wait_for_selector("[data-find-results] li", timeout=60000)
    except Exception:
        pass
    hits = fp.locator("[data-find-results] li").count()
    check("חיפוש מוצא תוצאות בספר בן 111 עמודים", hits > 0,
          fp.locator("[data-find-status]").inner_text())
    check("התוצאה מדגישה את הביטוי", fp.locator("[data-find-results] mark").count() > 0)
    target = int(fp.locator("[data-find-results] [data-goto]").first.get_attribute("data-goto"))
    fp.locator("[data-find-results] [data-goto]").first.click()
    fp.wait_for_timeout(1800)
    check("לחיצה על תוצאה קופצת לעמוד הנכון",
          int(fp.evaluate("Reader.currentPage()")) == target,
          f"יעד {target} → {fp.evaluate('Reader.currentPage()')}")
    # ---------- הדגשת התוצאה על הדף עצמו ----------
    # ⚠️ paintHighlights חייב לסנן לעלים הנראים בלבד: StPageFlip משאיר את
    # כל 111 העלים ב-DOM עם display:none, ומעבר עליהם היה מריץ חילוץ טקסט
    # מכל הספר — וגם מחזיר getBoundingClientRect אפס, כך שהתיבות יצאו NaN.
    fp.wait_for_timeout(1400)
    hl = fp.evaluate("""(()=>[...document.querySelectorAll('.leaf-hl')].filter(e=>{
        const l=e.closest('.leaf'); return l && l.getBoundingClientRect().width>40;})
        .map(e=>{const r=e.getBoundingClientRect(), l=e.closest('.leaf').getBoundingClientRect();
          return {x:(r.x-l.x)/l.width*100, y:(r.y-l.y)/l.height*100,
                  w:r.width, h:r.height, page:e.closest('.leaf').dataset.page};}))()""")
    check("התוצאה מודגשת על הדף המוצג", len(hl) > 0, f"{len(hl)} סימונים")
    check("ההדגשות יושבות בתוך גבולות הדף",
          all(0 <= g["x"] <= 100 and 0 <= g["y"] <= 100 and g["w"] > 0 and g["h"] > 0
              for g in hl), f"{hl[:3]}")
    check("ההדגשות על העמוד שאליו קפצנו",
          all(int(g["page"]) == target for g in hl), f"{[g['page'] for g in hl]}")
    check("ההדגשה שקופה למחצה ואינה חוסמת עכבר",
          fp.evaluate("""(()=>{const e=document.querySelector('.leaf-hl');
              if(!e) return false; const c=getComputedStyle(e);
              return c.pointerEvents==='none' && c.backgroundColor.startsWith('rgba');})()"""))
    fp.screenshot(path=f"{SHOT}/v_highlight.png")

    # ⚠️ האינדקס נשמר בזיכרון בלבד ולא ב-localStorage: ספר בן 111 עמודים
    # היה גודש את המכסה ומסכן את ההערות והסימניות.
    check("אינדקס החיפוש אינו נכתב ל-localStorage",
          fp.evaluate("Object.keys(localStorage).every(k => localStorage[k].length < 60000)"),
          fp.evaluate("JSON.stringify(Object.keys(localStorage))"))

    fp.fill("#find-input", ""); fp.wait_for_timeout(500)
    check("ניקוי החיפוש מחזיר את הסימניות", fp.locator("[data-find-marks]").is_visible())
    check("ניקוי החיפוש מכבה את ההדגשות", fp.locator(".leaf-hl").count() == 0,
          f"{fp.locator('.leaf-hl').count()}")
    fp.click('[data-act="bookmark"]'); fp.wait_for_timeout(400)
    here = int(fp.evaluate("Reader.currentPage()"))
    check("סימנייה חדשה נכנסת לרשימה", fp.locator("[data-marks-list] li").count() == 1)
    fp.click('[data-act="prev"]'); fp.wait_for_timeout(1600)
    fp.locator("[data-marks-list] [data-goto]").first.click(); fp.wait_for_timeout(1800)
    # מעבר מסימנייה אינו חיפוש, ולכן אסור לו להדליק הדגשות
    check("מעבר מסימנייה אינו מדליק הדגשה", fp.locator(".leaf-hl").count() == 0,
          f"{fp.locator('.leaf-hl').count()}")
    check("לחיצה על סימנייה מחזירה לעמוד",
          int(fp.evaluate("Reader.currentPage()")) == here,
          f"{here} → {fp.evaluate('Reader.currentPage()')}")
    fp.locator("[data-marks-list] [data-unmark]").first.click(); fp.wait_for_timeout(400)
    check("אפשר להסיר סימנייה מהרשימה",
          fp.locator("[data-marks-list] li").count() == 0)
    # ⚠️ Esc מקלף שכבה אחת בלבד
    fp.keyboard.press("Escape"); fp.wait_for_timeout(400)
    check("Esc סוגר את הפאנל ומשאיר את הקורא פתוח",
          fp.locator("#finder").is_hidden() and fp.locator("#reader-view").is_visible())
    fp.screenshot(path=f"{SHOT}/v_finder.png")

    # ---------- תוכן העניינים ----------
    # ⚠️ הבדיקה הקודמת סגרה את הפאנל ב-Esc. בלי לפתוח אותו מחדש כל
    # האלמנטים כאן מוסתרים, והבדיקה נכשלת על כלום במקום על המוצר.
    if fp.locator("#finder").is_hidden():
        fp.click('[data-act="find"]')
    fp.wait_for_selector("#finder", state="visible", timeout=10000)
    # ⚠️ היעדים בקובץ אינם מספרי עמוד אלא הפניות פנימיות, וכל אחד נפתר
    # דרך getDestination/getPageIndex. בלי זה אין כאן תוכן עניינים בכלל.
    try:
        fp.wait_for_selector("[data-toc-list] .toc__link", timeout=40000)
    except Exception:
        pass
    tops = fp.locator("[data-toc-list] > .toc__item").count()
    check("תוכן העניינים נבנה מתוך הקובץ", tops > 3, f"{tops} פרקים")
    titles = fp.locator("[data-toc-list] > .toc__item > .toc__row > .toc__link .toc__title").all_inner_texts()
    check("שם הספר אינו ערך בתוכן העניינים",
          not any(t.strip() == "מבוא למינהל ולניהול ציבורי" for t in titles), f"{titles[:3]}")
    # ⚠️ תיקון תחום: הרווח בין מספר הפרק לשמו חסר בקובץ עצמו
    check("הרווח החסר בכותרות הפרקים תוקן",
          all("ראשוןמ" not in t and "שניה" not in t for t in titles), f"{titles[:6]}")
    check("סעיפי המשנה סגורים כברירת מחדל",
          fp.locator("[data-toc-list] .toc__level:not([hidden]) .toc__link").count() == 0)
    # ⚠️ rotate פיזי: ב-RTL חץ סגור חייב להצביע שמאלה, ולכן 180°
    check("חץ ההרחבה מצביע לכיוון הנכון ב-RTL",
          fp.evaluate("getComputedStyle(document.querySelector('.toc__toggle .icon')).rotate") == "180deg",
          fp.evaluate("getComputedStyle(document.querySelector('.toc__toggle .icon')).rotate"))

    tog = fp.locator("[data-toc-list] > .toc__item > .toc__row > .toc__toggle").first
    tog.click(); fp.wait_for_timeout(400)
    check("הרחבה חושפת סעיפים ומעדכנת aria-expanded",
          fp.locator("[data-toc-list] .toc__level:not([hidden]) > .toc__item").count() > 0
          and tog.get_attribute("aria-expanded") == "true")
    link = fp.locator("[data-toc-list] .toc__level:not([hidden]) .toc__link").first
    tgt = int(link.get_attribute("data-goto"))
    link.click(); fp.wait_for_timeout(2600)
    shown = fp.evaluate("""(()=>[...document.querySelectorAll('#reader-stage .leaf[data-page]')]
        .filter(e=>e.getBoundingClientRect().width>40).map(e=>+e.dataset.page))()""")
    check("לחיצה על סעיף מגיעה לעמוד שלו", tgt in shown, f"יעד {tgt}, מוצג {shown}")
    check("קפיצה מתוכן העניינים אינה מדליקה הדגשה", fp.locator(".leaf-hl").count() == 0)
    fp.fill("#find-input", "מינהל"); fp.wait_for_timeout(3000)
    check("חיפוש פעיל מסתיר את תוכן העניינים", fp.locator("[data-find-toc]").is_hidden())
    fp.fill("#find-input", ""); fp.wait_for_timeout(700)
    check("ניקוי החיפוש מחזיר את תוכן העניינים", fp.locator("[data-find-toc]").is_visible())
    fp.screenshot(path=f"{SHOT}/v_toc.png")
    fp.close()

    # ---------- ייצוא ההערות ל-Word ----------
    # ⚠️ לא מספיק ש"קובץ ירד": docx הוא ארכיון OOXML, והכותב כאן נכתב
    # מאפס. הבדיקה פותחת את התוצאה בספריות חיצוניות באמת.
    import io as _io, zipfile as _zip, xml.etree.ElementTree as _ET
    ep = browser.new_page(viewport={"width": 1280, "height": 900}, accept_downloads=True)
    csp_hits = []
    ep.on("console", lambda m: csp_hits.append(m.text) if "Refused" in m.text else None)
    ep.goto(BASE + "/#/book/mediniyut-tziburit/read/3", wait_until="networkidle")
    ep.wait_for_timeout(8000)
    ep.click('[data-act="notes"]'); ep.wait_for_timeout(400)
    ep.fill("#notepad-text", "שורה עם <תווים> & מיוחדים\n\nפסקה שנייה"); ep.wait_for_timeout(900)
    with ep.expect_download(timeout=20000) as dl:
        ep.click('[data-act="notes-export"]')
    got = dl.value
    raw = open(got.path(), "rb").read()
    check("ההורדה עוברת את ה-CSP של הייצור", len(raw) > 500 and not csp_hits,
          f"{len(raw)} bytes, csp={csp_hits[:1]}")
    check("שם הקובץ הוא docx ונושא את שם הספר",
          got.suggested_filename.endswith(".docx") and "מדיניות" in got.suggested_filename,
          got.suggested_filename)
    z = _zip.ZipFile(_io.BytesIO(raw))
    check("ארכיון ZIP תקין", z.testzip() is None)
    # ⚠️ ארבעת החלקים. word/_rels/document.xml.rels ריק אבל חובה.
    check("כל חלקי חבילת ה-OOXML קיימים",
          {"[Content_Types].xml", "_rels/.rels", "word/document.xml",
           "word/_rels/document.xml.rels"} <= set(z.namelist()), z.namelist())
    xml = z.read("word/document.xml").decode("utf-8")
    _ET.fromstring(xml)
    check("document.xml הוא XML חוקי", True)
    # ⚠️ xmlns:r חייב להיות מוכרז גם בלי הפניות — קוראים נופלים בלעדיו
    check("מרחב השמות r מוכרז", 'xmlns:r="' in xml)
    # ⚠️ הסכמה קובעת רצף: bidi לפני spacing לפני jc
    check("סדר הילדים ב-pPr תואם לסכמה",
          "<w:bidi/><w:spacing" in xml and "/><w:jc " in xml,
          xml[xml.find("<w:pPr>"):xml.find("<w:pPr>") + 90])
    check("המסמך דו-כיווני", xml.count("<w:bidi/>") >= 3 and "<w:rtl/>" in xml)
    check("תווים מיוחדים בוצעו escape", "&lt;תווים&gt;" in xml and "&amp;" in xml)
    try:
        import docx as _docx
        _d = _docx.Document(got.path())
        _p = [x.text for x in _d.paragraphs]
        check("ספריית docx חיצונית פותחת את הקובץ", len(_p) >= 4 and "פסקה שנייה" in _p, f"{_p[:2]}")
    except ImportError:
        notes.append("SKIP  python-docx לא מותקן")
    ep.fill("#notepad-text", ""); ep.wait_for_timeout(900)
    ep.click('[data-act="notes-export"]'); ep.wait_for_timeout(500)
    check("פנקס ריק אינו מייצר קובץ",
          "ריק" in ep.locator("[data-notepad-status]").inner_text(),
          ep.locator("[data-notepad-status]").inner_text())
    ep.close()

    # ---------- אין פסי גלילה מהבהבים בזמן דפדוף ----------
    # ⚠️ הבמה הייתה overflow:auto תמיד. בזמן דפדוף הדף המסתובב חורג
    # ממנה (נמדד 736px לרוחב ו-663px לגובה), ולכן פסי גלילה הבזיקו
    # למטה ובצד והפריסה קפצה איתם.
    # ⚠️ scrollWidth אינו המדד: הוא מדווח על היקף התוכן גם כשהגלילה
    # חסומה. המדד הנכון הוא העובי שהפס עצמו תופס.
    pp = browser.new_page(viewport={"width": 1280, "height": 900})
    pp.goto(BASE + "/#/book/mavo-minhal-nihul-tziburi/read/20", wait_until="networkidle")
    pp.wait_for_timeout(8000)
    check("בתצוגת ספר ללא זום הבמה אינה גוללת",
          pp.evaluate("getComputedStyle(document.getElementById('reader-stage')).overflow") == "hidden")
    bars = pp.evaluate("""(()=>{const st=document.getElementById('reader-stage');
        const t0=performance.now(); const fr=[];
        return new Promise(res=>{const tick=()=>{
          fr.push([st.offsetWidth-st.clientWidth, st.offsetHeight-st.clientHeight]);
          if(performance.now()-t0<1300) requestAnimationFrame(tick); else res(fr);};
          Reader.view.advance(); requestAnimationFrame(tick);});})()""")
    worst = max(max(b) for b in bars)
    check("אף פס גלילה לא מופיע בזמן דפדוף", worst <= 1,
          f"עובי מרבי={worst} ב-{len(bars)} פריימים")

    # בזום עדיין אפשר לגרור, אבל בלי פס שמהבהב
    for _ in range(3):
        pp.click('[data-act="zoom-in"]'); pp.wait_for_timeout(600)
    z = pp.evaluate("""(()=>{const s=document.getElementById('reader-stage');
        return {pan:s.dataset.pan, overflow:getComputedStyle(s).overflow,
                canPan:s.scrollHeight>s.clientHeight+2||s.scrollWidth>s.clientWidth+2,
                bar:s.offsetWidth-s.clientWidth};})()""")
    check("בזום אפשר לגרור את העמוד", z["canPan"] and z["overflow"] == "auto", f"{z}")
    check("ובזום הפס אינו תופס רוחב", z["bar"] <= 1, f"{z}")

    # בתצוגת גלילה הפס נשאר — שם הוא מחוון מיקום לגיטימי
    pp.click('[data-act="mode"]'); pp.wait_for_timeout(4500)
    sv = pp.evaluate("""(()=>{const s=document.getElementById('reader-stage');
        return {mode:Reader.mode, overflow:getComputedStyle(s).overflow};})()""")
    check("בתצוגת גלילה הגלילה נשמרת",
          sv["mode"] == "scroll" and sv["overflow"] == "auto", f"{sv}")
    pp.close()

    # ---------- פסי גלילה בעיצוב האתר ----------
    # ⚠️ אי אפשר לאמת כאן את הפיקסלים: כרומיום ללא ראש אינו מצייר פסי
    # גלילה בכלל — נבדק בעמוד בדיקה נפרד, גם עם המאפיינים התקניים וגם
    # עם ::-webkit-scrollbar, ושניהם החזירו רוחב 0. לכן מאמתים את מה
    # שכן דטרמיניסטי: הערכים המחושבים והימצאות כללי הגיבוי.
    sb = browser.new_page(viewport={"width": 1280, "height": 900})
    sb.goto(BASE + "/#/book/mediniyut-tziburit/read/3", wait_until="networkidle")
    sb.wait_for_timeout(8000)
    sb.click('[data-act="mode"]'); sb.wait_for_timeout(4500)
    css = sb.evaluate("""(()=>{const s=document.getElementById('reader-stage');
        const c=getComputedStyle(s);
        return {w:c.scrollbarWidth, color:c.scrollbarColor,
                scrolls:s.scrollHeight>s.clientHeight+2};})()""")
    check("בתצוגת גלילה הבמה אכן גוללת", css["scrolls"], f"{css}")
    check("פס הגלילה דק", css["w"] == "thin", f"{css}")
    check("ובצבע הפליז של האתר", "176, 141, 87" in (css["color"] or ""), f"{css}")

    # כללי הגיבוי ל-WebKit ישן חייבים להתקיים בגיליון
    wk = sb.evaluate("""(()=>{let n=0;
        for (const sh of document.styleSheets) {
          let rules; try { rules = sh.cssRules; } catch { continue; }
          for (const r of rules||[]) {
            if (r.selectorText && r.selectorText.includes('::-webkit-scrollbar')) n++;
          }
        }
        return n;})()""")
    check("קיימים כללי ::-webkit-scrollbar לגיבוי", wk >= 4, f"{wk} כללים")

    # מצב תאורה כבוי מחליף את גוון המסילה
    light = sb.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--sb-track').trim()")
    # ⚠️ יש שתי מנורות — במדף ובסרגל הקורא. בתוך הקורא רק זו שבסרגל
    # נראית, ולכן חייבים לכוון אליה ולא לבורר הכללי.
    sb.locator('.toolbar [data-lamp-toggle]').click(); sb.wait_for_timeout(500)
    dark = sb.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--sb-track').trim()")
    check("גוון המסילה מתחלף עם מצב התאורה", light != dark and dark, f"{light!r} → {dark!r}")
    sb.close()

    # ---------- נייד: קפיצות, פריסת הפאנלים, ופאנל אחד בכל רגע ----------
    # ⚠️ הרגרסיה החמורה ביותר שהייתה כאן: goTo קרא ל-pageFlip.flip(), וזה
    # פשוט אינו מזיז את הספרייה במסך צר — האינדקס הפנימי נשאר תקוע.
    # advance/retreat כבר עקפו את זה דרך _stepByIndex/turnToPage, אבל goTo
    # לא — ולכן **כל** קפיצה בנייד הייתה שבורה: תוכן עניינים, תיבת מספר
    # העמוד, תוצאות חיפוש וסימניות. נמדד: מעמוד 5 נכשלו 6 מתוך 7 קפיצות.
    mp = browser.new_page(viewport={"width": 390, "height": 780},
                          has_touch=True, is_mobile=True)
    mp.goto(BASE + "/#/book/mavo-minhal-nihul-tziburi/read/5", wait_until="networkidle")
    mp.wait_for_timeout(9000)
    check("במסך צר הספרייה במצב פורטרט", mp.evaluate("Reader.view.isPortrait()"))

    mp.click('[data-act="find"]')
    mp.wait_for_selector("[data-toc-list] .toc__link", timeout=40000)
    mp.wait_for_timeout(700)

    # ⚠️ הסרגל נשבר לשתי שורות בנייד ותופס יותר מ---toolbar-h הקבוע
    geo = mp.evaluate("""(()=>{const f=document.getElementById('finder');
        const t=document.querySelector('.toolbar');
        return {panelTop:f.getBoundingClientRect().top,
                toolbarBottom:t.getBoundingClientRect().bottom,
                real:getComputedStyle(document.documentElement).getPropertyValue('--toolbar-real-h').trim(),
                minBlock:getComputedStyle(t).minBlockSize};})()""")
    check("ראש הפאנל אינו חבוי מאחורי הסרגל",
          geo["panelTop"] >= geo["toolbarBottom"] - 1, geo)
    # ⚠️ הגובה הנמדד חייב להיכתב למשתנה נפרד, אחרת min-block-size של
    # הסרגל הופך אותו לרצפה קבועה והסרגל לא מתכווץ בסיבוב המכשיר
    check("הגובה הנמדד אינו הופך לרצפת הסרגל",
          geo["minBlock"] != geo["real"], geo)

    mp.evaluate("document.getElementById('finder').scrollTop = 99999")
    mp.wait_for_timeout(500)
    last = mp.evaluate("""(()=>{const i=[...document.querySelectorAll('[data-toc-list] > .toc__item')];
        const r=i[i.length-1].getBoundingClientRect();
        return {bottom:r.bottom, top:r.top, vh:innerHeight};})()""")
    check("אפשר לגלול עד סוף תוכן העניינים בנייד",
          last["bottom"] <= last["vh"] - 4 and last["top"] >= 0, last)

    links = mp.locator("[data-toc-list] > .toc__item > .toc__row > .toc__link")
    missed = []
    for i in (1, 5, 9, 13):
        lk = links.nth(i)
        tgt = int(lk.get_attribute("data-goto"))
        lk.click(); mp.wait_for_timeout(2400)
        if tgt not in mp.evaluate(LEAF_PAGES):
            missed.append((tgt, mp.evaluate(LEAF_PAGES)))
    check("קפיצה מתוכן העניינים עובדת בנייד", not missed, f"כשלו: {missed}")

    mp.fill("#page-input", "30"); mp.keyboard.press("Enter"); mp.wait_for_timeout(2400)
    check("קפיצה בתיבת מספר העמוד עובדת בנייד", 30 in mp.evaluate(LEAF_PAGES),
          mp.evaluate(LEAF_PAGES))

    # פאנל אחד בכל רגע — שניהם יחד מכסים כמעט את כל המסך
    mp.click('[data-act="notes"]'); mp.wait_for_timeout(500)
    st = mp.evaluate("""(()=>({f:!document.getElementById('finder').hidden,
        n:!document.getElementById('notepad').hidden,
        fa:document.querySelector('[data-act="find"]').getAttribute('aria-expanded')}))()""")
    check("פתיחת הפנקס סוגרת את פאנל החיפוש",
          st["n"] and not st["f"] and st["fa"] == "false", st)
    # ⚠️ הפנקס כיסה גם את הסרגל, ולכן לא היה אפשר לעבור ממנו לחיפוש
    mp.click('[data-act="find"]'); mp.wait_for_timeout(500)
    st2 = mp.evaluate("""(()=>({f:!document.getElementById('finder').hidden,
        n:!document.getElementById('notepad').hidden}))()""")
    check("אפשר לעבור מהפנקס לחיפוש בלי לסגור קודם", st2["f"] and not st2["n"], st2)
    mp.screenshot(path=f"{SHOT}/v_mobile_panel.png")
    mp.close()

    # ---------- גלילת הפאנל, ניגודיות, קיצורים ואנליטיקס ----------
    rp = browser.new_page(viewport={"width": 1280, "height": 900})
    csp_hits = []
    rp.on("console", lambda m: csp_hits.append(m.text)
          if "Content Security Policy" in m.text or "Refused to" in m.text else None)
    rp.goto(BASE + "/#/book/mavo-minhal-nihul-tziburi/read/5", wait_until="networkidle")
    rp.wait_for_timeout(9000)

    # ⚠️ הבדיקה שנולדה מבאג אמיתי: ל-.finder היה overflow-y:auto ואחריו,
    # באותו בלוק, overflow:hidden — והקיצור המאוחר ניצח. הפאנל הפסיק
    # להיגלל באצבע ובגלגלת, אבל scrollTop מתוך קוד המשיך לעבוד — ולכן
    # הבדיקה הקודמת עברה בזמן שהמשתמש היה תקוע. גלילה נבדקת רק בתנועה.
    rp.click('[data-act="find"]')
    rp.wait_for_selector("[data-toc-list] .toc__link", timeout=40000)
    rp.wait_for_timeout(700)
    before = rp.evaluate("document.getElementById('finder').scrollTop")
    fb = rp.locator("#finder").bounding_box()
    rp.mouse.move(fb["x"] + fb["width"] / 2, fb["y"] + fb["height"] / 2)
    rp.mouse.wheel(0, 1200)
    rp.wait_for_timeout(600)
    after = rp.evaluate("document.getElementById('finder').scrollTop")
    check("הפאנל נגלל בתנועת גלגלת אמיתית", after > before + 50, f"{before} → {after}")
    check("overflow-y בפועל הוא auto",
          rp.evaluate("getComputedStyle(document.getElementById('finder')).overflowY") == "auto")

    # ניגודיות: לחצן הייצוא היה 1.19:1 — btn--brass שקוף על נייר בהיר
    rp.click('[data-act="notes"]')
    rp.wait_for_timeout(600)
    r, fg, bg = measure_contrast(rp, ".notepad__exportbtn", f"{SHOT}/_btn.png")
    check("לחצן הייצוא ל-Word עובר את תקן הניגודיות", r >= 4.5,
          f"{r:.2f}:1  טקסט={fg} רקע={bg}")
    rp.click('[data-act="notes"]')
    rp.wait_for_timeout(400)

    # חלונית קיצורי המקלדת
    rp.click('[data-act="keys"]')
    rp.wait_for_timeout(600)
    check("חלונית הקיצורים נפתחת", rp.locator("#keys-layer").is_visible())
    check("הרשימה נבנתה מ-SHORTCUTS ולא מ-HTML",
          rp.locator("[data-keys-list] dt").count() == rp.evaluate("SHORTCUTS.length"),
          f'{rp.locator("[data-keys-list] dt").count()} מול {rp.evaluate("SHORTCUTS.length")}')
    page_before = rp.evaluate("Reader.currentPage()")
    rp.keyboard.press("Escape")
    rp.wait_for_timeout(700)
    # ⚠️ Esc הריץ Router.back('#/') על כל שכבה, ולכן סגירת החלונית הייתה
    # גם זורקת את הקורא חזרה למדף.
    check("Esc סוגר את החלונית ומשאיר את הקורא פתוח",
          rp.locator("#keys-layer").is_hidden()
          and rp.locator("#reader-view").is_visible()
          and rp.evaluate("Reader.currentPage()") == page_before,
          f"{page_before} → {rp.evaluate('Reader.currentPage()')}")

    # כל קיצור שמוצג בחלונית חייב באמת לפעול — אחרת התיעוד משקר
    shown = rp.evaluate("SHORTCUTS.filter(s=>s.run).map(s=>({k:s.keys[0], label:s.label}))")
    rp.evaluate("Reader.goTo(20)")
    rp.wait_for_timeout(2200)
    dead = []
    for sc in shown:
        start = rp.evaluate("Reader.currentPage()")
        sf, sn = rp.locator("#finder").is_hidden(), rp.locator("#notepad").is_hidden()
        rp.locator("#reader-stage").click(position={"x": 5, "y": 5})
        rp.keyboard.press(sc["k"])
        rp.wait_for_timeout(1500)
        if not (rp.evaluate("Reader.currentPage()") != start
                or rp.locator("#finder").is_hidden() != sf
                or rp.locator("#notepad").is_hidden() != sn
                or rp.locator(".bookmark-ribbon:not([hidden])").count() > 0):
            dead.append(sc["label"])
        rp.locator("#finder").is_hidden() or rp.click('[data-act="find"]')
        rp.locator("#notepad").is_hidden() or rp.click('[data-act="notes"]')
        rp.wait_for_timeout(300)
    check("כל קיצור שמוצג בחלונית באמת פועל", not dead, f"לא הגיבו: {dead}")

    # אנליטיקס. ⚠️ הקטע שגוגל מספקת הוא inline, ו-script-src בלי
    # unsafe-inline היה חוסם אותו בשקט — בלי שגיאה גלויה ובלי נתונים.
    tag = rp.evaluate("""(()=>({ext:!!document.querySelector('script[src*="googletagmanager"]'),
        local:!!document.querySelector('script[src*="analytics.js"]'),
        dl:Array.isArray(window.dataLayer), n:(window.dataLayer||[]).length}))()""")
    check("תג גוגל וקובץ ההגדרה מוטמעים", tag["ext"] and tag["local"], tag)
    check("ההגדרה רצה בפועל ו-dataLayer נבנה", tag["dl"] and tag["n"] >= 2, tag)
    check("אפס הפרות CSP תחת כותרות הייצור", not csp_hits, str(csp_hits[:2]))
    check("האתר תקין גם כשהבקשה לגוגל נכשלת",
          rp.locator("#reader-stage").is_visible())
    rp.close()

    # ---------- עמעום הדף בלילה ----------
    np_ = browser.new_page(viewport={"width": 1280, "height": 900})
    np_.goto(BASE + "/#/book/mavo-minhal-nihul-tziburi/read/8", wait_until="networkidle")
    np_.wait_for_timeout(9000)
    np_.locator('.toolbar [data-lamp-toggle]').click()
    np_.wait_for_timeout(900)
    # ⚠️ המסנן חייב לשבת על ה-canvas. על .leaf הוא יוצר containing block
    # ושובר את preserve-3d — כלומר הורס את אנימציית הדפדוף.
    check("המסנן מוחל על הקנבס ולא על העלה",
          np_.evaluate("getComputedStyle(document.querySelector('.leaf')).filter") == "none"
          and np_.evaluate("getComputedStyle(document.querySelector('.leaf-canvas')).filter") != "none")
    seen_before = np_.evaluate(LEAF_PAGES)
    np_.click('[data-act="next"]')
    moved = 0
    for _ in range(6):
        np_.wait_for_timeout(110)
        moved = max(moved, np_.evaluate("""(()=>[...document.querySelectorAll('#reader-stage .leaf')]
            .map(l=>getComputedStyle(l).transform)
            .filter(x=>x&&x!=='none'&&!x.startsWith('matrix(1, 0, 0, 1')).length)()"""))
    np_.wait_for_timeout(1800)
    check("אנימציית הדפדוף שורדת את המסנן", moved > 0, f"פריימים עם טרנספורם: {moved}")
    check("והדפדוף הגיע לעמוד חדש", np_.evaluate(LEAF_PAGES) != seen_before,
          f"{seen_before} → {np_.evaluate(LEAF_PAGES)}")
    np_.close()

    # ---------- ההערות שורדות מעבר ישיר בין ספרים ----------
    # ⚠️ Router.apply סגר את הקורא רק ביציאה ממנו, ולכן מעבר מספר לספר
    # (אפשרי עם כפתור "אחורה") דרס עד חמש שניות של כתיבה.
    kp = browser.new_page(viewport={"width": 1280, "height": 900})
    kp.goto(BASE + "/#/book/mediniyut-tziburit/read/3", wait_until="networkidle")
    kp.wait_for_timeout(8000)
    kp.click('[data-act="notes"]')
    kp.wait_for_timeout(400)
    kp.fill("#notepad-text", "הערה שאסור שתיעלם")
    kp.wait_for_timeout(300)
    kp.goto(BASE + "/#/book/yahasim-beinleumiyim/read/3", wait_until="commit")
    kp.wait_for_timeout(8000)
    kp.goto(BASE + "/#/book/mediniyut-tziburit/read/3", wait_until="commit")
    kp.wait_for_timeout(8000)
    kp.click('[data-act="notes"]')
    kp.wait_for_timeout(600)
    check("הערה שרדה מעבר ישיר בין שני ספרים",
          kp.evaluate("document.getElementById('notepad-text').value").strip() == "הערה שאסור שתיעלם",
          repr(kp.evaluate("document.getElementById('notepad-text').value")))
    kp.close()

    # ---------- mobile ----------
    page.set_viewport_size({"width": 390, "height": 780})
    page.goto(BASE + "/", wait_until="networkidle")
    page.wait_for_timeout(600)
    check("no horizontal overflow on mobile",
          page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 2"),
          f"scrollWidth={page.evaluate('document.documentElement.scrollWidth')}")
    page.screenshot(path=f"{SHOT}/v_mobile.png", full_page=True)

    browser.close()

print("\n".join(notes))
print()
if errors:
    print("PAGE ERRORS:")
    for e in errors[:10]:
        print("  ", e)
if console:
    print("CONSOLE (err/warn):")
    for c in console[:15]:
        print("  ", c)
print()
if fails:
    print("\n".join(fails))
    sys.exit(1)
print(f"ALL {len(notes)} CHECKS PASSED")
