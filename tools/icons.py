#!/usr/bin/env python3
"""מייצר את אייקוני מסך הבית (assets/icons/*.png) מתוך assets/favicon.svg.

למה בכלל PNG: אייפון לא מקבל SVG כ-apple-touch-icon, ובלעדיו "הוסף למסך
הבית" מציג צילום מסך מוקטן של הדף. ובלי manifest עם אייקונים אנדרואיד לא
מציע התקנה.

הספר מוצב על רקע עץ מלא (ולא שקוף): אייפון ממלא שקיפות בשחור, ואנדרואיד
חותך את האייקון לעיגול — לכן הספר תופס רק כ-62% מהמרובע (האזור הבטוח של
אייקון maskable הוא עיגול בקוטר 80%).

הרצה:  python3 tools/icons.py      (צריך playwright + chromium)
"""
import os
import pathlib
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
SVG = (ROOT / "assets" / "favicon.svg").read_text(encoding="utf-8")
OUT = ROOT / "assets" / "icons"
SIZES = [180, 192, 512]

PAGE = """<!doctype html><meta charset="utf-8"><style>
html,body{margin:0}
.tile{width:%(s)dpx;height:%(s)dpx;display:grid;place-items:center;
  background:radial-gradient(ellipse at 50%% 28%%,#6B4423,#4A2418 58%%,#2E150C)}
.tile svg{width:62%%;height:62%%;filter:drop-shadow(0 %(sh)dpx %(bl)dpx rgba(0,0,0,.55))}
</style><div class="tile">%(svg)s</div>"""

OUT.mkdir(parents=True, exist_ok=True)
launch = {"args": ["--no-sandbox"]}
if os.environ.get("DL_CHROME"):
    launch["executable_path"] = os.environ["DL_CHROME"]
with sync_playwright() as pw:
    browser = pw.chromium.launch(**launch)
    for s in SIZES:
        page = browser.new_page(viewport={"width": s, "height": s})
        page.set_content(PAGE % {"s": s, "svg": SVG, "sh": max(1, s // 60), "bl": max(2, s // 30)})
        page.locator(".tile").screenshot(path=str(OUT / f"icon-{s}.png"))
        page.close()
    browser.close()
print("wrote", ", ".join(f"icon-{s}.png" for s in SIZES))
