"""Serve the site with the exact headers from _headers (a local dev server doesn't)."""
import http.server, functools, re, sys, os
# ‏שורש המאגר, נגזר ממיקום הקובץ — נתיב מקובע לא היה עובד ב-CI.
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = int(os.environ.get("DL_PORT", "8788"))

def parse_headers(path):
    rules, cur = [], None
    for line in open(path, encoding="utf-8"):
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        if not line.startswith((" ", "\t")):
            cur = (line.strip(), []); rules.append(cur)
        elif cur:
            k, _, v = line.strip().partition(":")
            cur[1].append((k.strip(), v.strip()))
    return rules

RULES = parse_headers(os.path.join(ROOT, "_headers"))

def match(pattern, path):
    rx = "^" + re.escape(pattern).replace(r"\*", ".*") + "$"
    return re.match(rx, path) is not None

class H(http.server.SimpleHTTPRequestHandler):
    """⚠️ תומך ב-Range. בלי זה השרת המקומי מחזיר תמיד את הקובץ כולו,
    ו-PDF.js נופל בשקט למסלול אחר לגמרי מזה שרץ בייצור (Netlify תומכת
    ב-Range). זה בדיוק סוג הפער שהחביא כאן באג בעבר."""

    def send_head(self):
        rng = self.headers.get('Range')
        if not rng:
            return super().send_head()
        path = self.translate_path(self.path)
        if os.path.isdir(path):
            return super().send_head()
        try:
            f = open(path, 'rb')
        except OSError:
            self.send_error(404)
            return None
        size = os.fstat(f.fileno()).st_size
        m = re.match(r'bytes=(\d*)-(\d*)$', rng.strip())
        if not m:
            f.close(); self.send_error(416); return None
        start, end = m.group(1), m.group(2)
        if start == '':
            length = int(end); start = max(0, size - length); end = size - 1
        else:
            start = int(start); end = int(end) if end else size - 1
        if start >= size or start > end:
            f.close(); self.send_error(416); return None
        end = min(end, size - 1)
        self.send_response(206)
        self.send_header('Content-Type', self.guess_type(path))
        self.send_header('Accept-Ranges', 'bytes')
        self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
        self.send_header('Content-Length', str(end - start + 1))
        self.end_headers()
        f.seek(start)
        self.wfile.write(f.read(end - start + 1))
        f.close()
        return None

    def end_headers(self):
        # ⚠️ אין לנרמל "/" ל-"/index.html". Netlify מתאימה כללי כותרות לפי
        # נתיב הבקשה בפועל, ולכן כלל שנכתב ל-/index.html אינו חל על דף
        # הבית. הנרמול שהיה כאן הסתיר בדיוק את הפער הזה מהבדיקות.
        p = self.path.split("?")[0].split("#")[0]
        self.send_header('Accept-Ranges', 'bytes')
        for pattern, hdrs in RULES:
            if match(pattern, p):
                for k, v in hdrs:
                    self.send_header(k, v)
        super().end_headers()
    def log_message(self, *a):
        pass

http.server.HTTPServer(("127.0.0.1", PORT),
    functools.partial(H, directory=ROOT)).serve_forever()
