#!/usr/bin/env python3
"""חילוץ הפרקים המוטמעים בקובץ MP4 והדפסתם כרשומה מוכנה לקטלוג הקלטות.

למה צריך את זה: הדפדפן **לא** חושף פרקים שמוטמעים ב-MP4 — אין לכך API.
לכן הפרקים נשלפים פעם אחת כאן ונכתבים לתוך TAPES ב-videos.js.

הרצה:
    pip install imageio-ffmpeg
    python3 tools/chapters.py <קובץ-מקומי-או-כתובת-Release>

כתובת מרוחקת נקראת דרך ממסר מקומי קטן שמעביר בקשות Range, ולכן **לא**
מורדים 250MB — רק הכותרת של הקובץ ואזור הפרקים. (הממסר קיים כי ffmpeg
עצמו לא יודע לעבור דרך proxy עם תעודות מותאמות; urllib כן.)

בנוסף נבדק אם ה-moov נמצא בתחילת הקובץ (faststart). אם לא, הדפדפן
צריך לקפוץ לסוף הקובץ לפני שהוא יכול להתחיל לנגן, והסרטון יתחיל לאט.
"""
import http.server
import json
import re
import shutil
import struct
import subprocess
import sys
import threading
import urllib.error
import urllib.request


def ffmpeg_exe():
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError:
        exe = shutil.which("ffmpeg")
        if not exe:
            sys.exit("חסר ffmpeg. התקן:  pip install imageio-ffmpeg")
        return exe


# ---------- קריאת טווחי בתים: קובץ מקומי או כתובת ----------

def remote_reader(url):
    def read(offset, n):
        req = urllib.request.Request(url, headers={"Range": f"bytes={offset}-{offset + n - 1}"})
        try:
            r = urllib.request.urlopen(req, timeout=60)
        except urllib.error.HTTPError as e:
            if e.code == 416:      # קריאה מעבר לסוף הקובץ = סוף הרשימה
                return b""
            raise
        with r:
            # ⚠️ שרת שמתעלם מ-Range מחזיר 200 ואת הקובץ מתחילתו — בלי
            # הבדיקה הזו כל "קופסה" הייתה נקראת כ-ftyp שוב ושוב.
            if r.status != 206 and offset > 0:
                raise RuntimeError("השרת אינו תומך בבקשות Range")
            return r.read(n)
    return read


def local_reader(path):
    def read(offset, n):
        with open(path, "rb") as f:
            f.seek(offset)
            return f.read(n)
    return read


def top_level_boxes(read, limit=64):
    """רשימת הקופסאות העליונות של ה-MP4 (ftyp, moov, mdat...) לפי הסדר."""
    boxes, offset = [], 0
    for _ in range(limit):
        head = read(offset, 16)
        if len(head) < 8:
            break
        size, kind = struct.unpack(">I4s", head[:8])
        if size == 1:
            size = struct.unpack(">Q", head[8:16])[0]
        elif size == 0:
            boxes.append(kind.decode("latin-1"))
            break
        boxes.append(kind.decode("latin-1"))
        if size < 8:
            break
        offset += size
    return boxes


# ---------- ממסר מקומי לכתובות מרוחקות ----------

def start_relay(url):
    class Relay(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            headers = {}
            if self.headers.get("Range"):
                headers["Range"] = self.headers["Range"]
            try:
                resp = urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=60)
            except urllib.error.HTTPError as e:
                self.send_error(e.code)
                return
            self.send_response(resp.status)
            for k in ("Content-Length", "Content-Range", "Accept-Ranges"):
                if resp.headers.get(k):
                    self.send_header(k, resp.headers[k])
            self.send_header("Content-Type", "video/mp4")
            self.end_headers()
            try:
                while True:
                    chunk = resp.read(65536)
                    if not chunk:
                        break
                    self.wfile.write(chunk)
            except (BrokenPipeError, ConnectionResetError):
                pass   # ffmpeg סוגר חיבור ברגע שקיבל מה שצריך — זה תקין
            finally:
                resp.close()

        def log_message(self, *a):
            pass

    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Relay)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, f"http://127.0.0.1:{srv.server_address[1]}/tape.mp4"


# ---------- חילוץ ----------

def probe(src):
    ff = ffmpeg_exe()
    meta = subprocess.run([ff, "-v", "error", "-i", src, "-f", "ffmetadata", "-"],
                          capture_output=True, text=True, encoding="utf-8")
    info = subprocess.run([ff, "-hide_banner", "-i", src],
                          capture_output=True, text=True, encoding="utf-8")
    m = re.search(r"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)", info.stderr)
    duration = int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3)) if m else None
    codecs = re.findall(r"Stream #\S+.*?: (Video|Audio): (\w+)", info.stderr)
    if meta.returncode != 0 and duration is None:
        sys.exit("ffmpeg לא הצליח לקרוא את הקובץ:\n" + (meta.stderr or info.stderr)[-800:])
    return parse_ffmetadata(meta.stdout), duration, codecs


def unescape(v):
    # ‏ffmetadata מסמן = ; # \ ושורה חדשה בלוכסן הפוך
    return re.sub(r"\\(.)", r"\1", v)


def parse_ffmetadata(text):
    chapters, cur = [], None
    for line in text.splitlines():
        line = line.strip()
        if line == "[CHAPTER]":
            cur = {"tb": 1 / 1000, "start": 0, "title": ""}
            chapters.append(cur)
        elif line.startswith("["):
            cur = None
        elif cur is not None and "=" in line:
            k, _, v = line.partition("=")
            if k == "TIMEBASE":
                num, _, den = v.partition("/")
                cur["tb"] = int(num) / int(den)
            elif k == "START":
                cur["start"] = int(v)
            elif k == "title":
                cur["title"] = unescape(v)
    return [{"t": round(c["start"] * c["tb"], 3), "title": c["title"] or f"פרק {i + 1}"}
            for i, c in enumerate(chapters)]


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    src = sys.argv[1]
    remote = src.startswith(("http://", "https://"))
    read = remote_reader(src) if remote else local_reader(src)

    try:
        boxes = top_level_boxes(read)
    except (RuntimeError, OSError) as e:
        print(f"// ⚠️ לא ניתן לבדוק faststart: {e}", file=sys.stderr)
        boxes = []
    relay = None
    if remote:
        relay, target = start_relay(src)
    else:
        target = src
    try:
        chapters, duration, codecs = probe(target)
    finally:
        if relay:
            relay.shutdown()

    if boxes:
        print(f"// ‏קופסאות עליונות: {' → '.join(boxes)}", file=sys.stderr)
    if "moov" in boxes and "mdat" in boxes and boxes.index("moov") > boxes.index("mdat"):
        print("// ⚠️ ה-moov בסוף הקובץ — הסרטון יתחיל לאט. תיקון בלי קידוד מחדש:\n"
              "//    ffmpeg -i in.mp4 -c copy -map 0 -movflags +faststart out.mp4",
              file=sys.stderr)
    if codecs:
        print("// ‏קודקים: " + ", ".join(f"{k}={c}" for k, c in codecs), file=sys.stderr)
    if not chapters:
        print("// ⚠️ לא נמצאו פרקים מוטמעים בקובץ.", file=sys.stderr)

    lines = [f"  duration: {round(duration, 2) if duration else 0},", "  chapters: ["]
    for c in chapters:
        lines.append(f"    {{ t: {c['t']:g}, title: {json.dumps(c['title'], ensure_ascii=False)} }},")
    lines.append("  ],")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
