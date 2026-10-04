"""Serves the harness and saves uploaded previews under the Admin's public/catalog folder."""
import http.server, os, re, urllib.parse

ROOT = os.path.dirname(os.path.abspath(__file__))
DEST = r'C:\my-dev\photobooth-admin\apps\admin\public\catalog'


class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def do_POST(self):
        q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        rel = q.get('path', [''])[0]
        if not re.fullmatch(r'(photo-4x6|badge|classic)/[a-z0-9-]+\.jpg', rel):
            self.send_response(400); self.end_headers(); return
        data = self.rfile.read(int(self.headers['Content-Length']))
        out = os.path.join(DEST, *rel.split('/'))
        os.makedirs(os.path.dirname(out), exist_ok=True)
        open(out, 'wb').write(data)
        self.send_response(200); self.end_headers(); self.wfile.write(b'ok')


http.server.ThreadingHTTPServer(('127.0.0.1', 8765), H).serve_forever()
