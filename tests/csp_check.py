"""Verify the reader under the PRODUCTION CSP — and check PIXELS, not just JS state.
The blank-reader bug passed every state assertion while showing nothing."""
import sys
from playwright.sync_api import sync_playwright
from PIL import Image
import os
EXE=os.environ.get("DL_CHROME","")
BASE=sys.argv[1] if len(sys.argv)>1 else "http://127.0.0.1:8788"
fails=[]
def check(l,c,d=""):
    print(("PASS  " if c else "FAIL  ")+l+(f"  — {d}" if d else ""))
    if not c: fails.append(l)

with sync_playwright() as pw:
    b=pw.chromium.launch(**({"executable_path":EXE} if EXE else {}),
                         args=["--no-sandbox","--disable-dev-shm-usage"])
    p=b.new_page(viewport={"width":1400,"height":950})
    msgs=[]
    p.on("console", lambda m: msgs.append(m.text) if m.type=="error" else None)
    BOOKS = [("yahasim-beinleumiyim", 4), ("lashon-hevra-tarbut", 3), ("mavo-minhal-nihul-tziburi", 9), ("mediniyut-tziburit", 5)]
    for bid, pg in BOOKS:
      msgs.clear()
      p.goto(BASE+f"/#/book/{bid}/read/{pg}", wait_until="networkidle")
      p.wait_for_timeout(9000)

      viol=[m for m in msgs if "Content Security Policy" in m or "Refused to" in m]
      check(f"no CSP violations [{bid}]", not viol, f"{len(viol)} found: {viol[:1]}")

      # --- the check that would have caught the blank reader ---
      box = p.evaluate("""(()=>{const l=[...document.querySelectorAll('.leaf')]
          .map(e=>e.getBoundingClientRect()).filter(r=>r.width>50&&r.height>50);
          return {visibleLeaves:l.length, maxW:Math.round(Math.max(0,...l.map(r=>r.width)))};})()""")
      check(f"leaves have real on-screen size [{bid}]", box["visibleLeaves"] >= 1,
            f"visible={box['visibleLeaves']} maxW={box['maxW']}")

      p.screenshot(path=f"csp_after_{bid}.png")
      im = Image.open(f"csp_after_{bid}.png").convert("RGB")
      stage = im.crop((0, 120, im.width, im.height))          # below the toolbar
      colors = stage.getcolors(maxcolors=1_000_000) or []
      top = max(colors)[0] / (stage.width*stage.height) if colors else 1
      # a blank stage is ~one flat colour; a rendered book is not
      check(f"stage is not a blank wash [{bid}]", top < 0.80, f"dominant colour = {top:.0%} of stage")
      # parchment-ish bright pixels must exist (the page itself)
      bright = sum(n for n,c in colors if c[0]>200 and c[1]>190 and c[2]>165)
      check(f"parchment page pixels present [{bid}]", bright/(stage.width*stage.height) > 0.05,
            f"{bright/(stage.width*stage.height):.0%} of stage")
    b.close()
print()
print("CSP CHECKS FAILED: "+", ".join(fails) if fails else "ALL CSP CHECKS PASSED")
sys.exit(1 if fails else 0)
