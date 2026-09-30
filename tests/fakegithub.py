"""‏GitHub Releases מדומה — כדי לבדוק את הנגן מול ההתנהגות האמיתית, בלי רשת.

מה הוא מחקה (כל אחד מהם נמדד מול GitHub האמיתי):
  1. github.com/<owner>/<repo>/releases/download/<tag>/<file>
     → ‏302 לכתובת חתומה ב-release-assets.githubusercontent.com
  2. הכתובת החתומה תומכת ב-Range ‏(206), מחזירה application/octet-stream
     ו-Content-Disposition: attachment — בדיוק כמו המקור.
  3. ⚠️ הכתובת החתומה **פגה**. אצל GitHub אחרי 5 דקות, ואז הוא מחזיר
     סטטוס 618. כאן משך החיים נקבע ב-FAKEGH_TTL (שניות), כדי שבדיקה לא
     תצטרך לחכות 5 דקות.

למה לא page.route של playwright: בקשה שנוצרת מהפניה (302) שמולאה ב-route
**אינה** מיורטת שוב, וכרומיום יוצא איתה לרשת האמיתית. זה בדיוק החלק
שצריך לבדוק — ההפניה, ה-CSP על יעד ההפניה, והתפוגה.

הדפדפן מופנה לכאן עם:
  --host-resolver-rules="MAP github.com 127.0.0.1:<port>, MAP release-assets.githubusercontent.com 127.0.0.1:<port>"
  --ignore-certificate-errors --no-proxy-server
‏(תעודה עצמית נוצרת בהפעלה עם openssl.)

‏GET https://github.com/__log מחזיר JSON של כל הבקשות — הבדיקות קוראות ממנו.
"""
import http.server
import json
import os
import re
import ssl
import subprocess
import tempfile
import threading
import time
import urllib.parse

ROOT = os.path.dirname(os.path.abspath(__file__))
FIXTURES = os.path.join(ROOT, "fixtures")
PORT = int(os.environ.get("FAKEGH_PORT", "8443"))
TTL = float(os.environ.get("FAKEGH_TTL", "300"))
# ‏משך החיים של כל כתובת חתומה *אחרי הראשונה*. בפועל כתובת פגה פעם ב-5
# ‏דקות צפייה; בבדיקה, כשכל הכתובות קצרות ובנוסף מגבילים קצב, הדפדפן לא
# ‏מספיק להוריד כלום לפני שהכתובת הבאה פגה — וזה מצב שלא קורה במציאות.
TTL_AFTER = float(os.environ.get("FAKEGH_TTL_AFTER", str(TTL)))
ISSUED = [0]
# ‏מגבלת קצב: לכל היותר CHUNK בתים לתשובה, עם השהיה של DELAY שניות.
# ‏בלי זה קובץ הבדיקה (140KB) נטען כולו בבקשה אחת, הדפדפן לא מבקש שום
# ‏דבר אחרי שהכתובת פגה, ובדיקת ההתאוששות עוברת בלי לבדוק כלום. שרת
# ‏מותר לו להחזיר פחות ממה שהתבקש (Content-Range מדויק), והדפדפן פשוט
# ‏מבקש את ההמשך — כך נוצרות בקשות רבות לאורך זמן, כמו בסרטון של 250MB.
CHUNK = int(os.environ.get("FAKEGH_CHUNK", "0"))
DELAY = float(os.environ.get("FAKEGH_DELAY", "0"))
ASSET_HOST = "release-assets.githubusercontent.com"

LOG = []
LOCK = threading.Lock()


def note(**kw):
    with LOCK:
        LOG.append({"at": round(time.time(), 3), **kw})


class H(http.server.BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def do_GET(self):
        host = (self.headers.get("Host") or "").split(":")[0]
        url = urllib.parse.urlsplit(self.path)

        if host == "github.com" and url.path == "/__log":
            with LOCK:
                body = json.dumps(LOG).encode()
            return self.reply(200, body, {"Content-Type": "application/json"})

        if host == "github.com":
            m = re.match(r"^/[^/]+/[^/]+/releases/download/[^/]+/([^/]+)$", url.path)
            if not m:
                note(kind="github-404", path=url.path)
                return self.reply(404, b"Not Found")
            with LOCK:
                ISSUED[0] += 1
                first = ISSUED[0] == 1
            exp = time.time() + (TTL if first else TTL_AFTER)
            sig = f"{exp:.3f}"
            loc = f"https://{ASSET_HOST}/github-production-release-asset/{m.group(1)}?se={sig}&sig=fake"
            note(kind="redirect", path=self.path)
            return self.reply(302, b"", {"Location": loc})

        if host == ASSET_HOST:
            name = url.path.rsplit("/", 1)[-1]
            qs = urllib.parse.parse_qs(url.query)
            exp = float(qs.get("se", ["0"])[0])
            rng = self.headers.get("Range")
            if time.time() > exp:
                # ‏כך GitHub עונה על כתובת חתומה שפגה (נמדד: 618, לא 403)
                note(kind="expired", range=rng)
                return self.reply(618, b"jwt:expired")
            path = os.path.join(FIXTURES, os.path.basename(name))
            if not os.path.isfile(path):
                note(kind="asset-404", name=name)
                return self.reply(404, b"Not Found")
            data = open(path, "rb").read()
            size = len(data)
            hdr = {"Content-Type": "application/octet-stream",
                   "Content-Disposition": f"attachment; filename={name}",
                   "Accept-Ranges": "bytes"}
            m = re.match(r"bytes=(\d*)-(\d*)$", (rng or "").strip())
            if not m:
                note(kind="asset", range=None)
                return self.reply(200, data, hdr)
            a, b = m.group(1), m.group(2)
            if a == "":
                a, b = max(0, size - int(b)), size - 1
            else:
                a, b = int(a), (int(b) if b else size - 1)
            b = min(b, size - 1)
            if CHUNK:
                b = min(b, a + CHUNK - 1)
            if DELAY:
                time.sleep(DELAY)
            if a >= size:
                return self.reply(416, b"", {"Content-Range": f"bytes */{size}"})
            note(kind="asset", range=rng)
            hdr["Content-Range"] = f"bytes {a}-{b}/{size}"
            return self.reply(206, data[a:b + 1], hdr)

        note(kind="unknown-host", host=host)
        return self.reply(421, b"Misdirected")

    def reply(self, status, body, headers=None):
        try:
            self.send_response(status)
            for k, v in (headers or {}).items():
                self.send_header(k, v)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError, ssl.SSLError):
            pass   # הדפדפן מבטל טווחים שכבר לא צריך — זה תקין

    def log_message(self, *a):
        pass


def make_cert(d):
    cert, key = os.path.join(d, "c.pem"), os.path.join(d, "k.pem")
    subprocess.run(["openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "2",
                    "-subj", "/CN=github.com", "-keyout", key, "-out", cert],
                   check=True, capture_output=True)
    return cert, key


if __name__ == "__main__":
    d = tempfile.mkdtemp(prefix="fakegh-")
    cert, key = make_cert(d)
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ctx.load_cert_chain(cert, key)
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), H)
    srv.socket = ctx.wrap_socket(srv.socket, server_side=True)
    srv.serve_forever()
