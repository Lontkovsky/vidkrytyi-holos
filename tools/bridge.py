#!/usr/bin/env python3
"""Internal loopback-only development transport; per-role command allowlist."""
import hmac
import json
import os
from http.server import HTTPServer, BaseHTTPRequestHandler
from reference import process

allowed = set(os.environ['CORE_ACTIONS'].split(','))
secret = open('/run/secrets/core-token').read().strip()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_GET(self):
        self.send_response(200 if self.path == '/health' else 404)
        self.end_headers()

    def do_POST(self):
        if self.path != '/run' or not hmac.compare_digest(self.headers.get('Authorization', ''), 'Bearer ' + secret):
            self.send_error(403); return
        if self.headers.get('Content-Type') != 'application/json':
            self.send_error(415); return
        try:
            length = int(self.headers['Content-Length'])
            if length < 1 or length > 8388608:
                self.send_error(413); return
            request = json.loads(self.rfile.read(length))
            if request['action'] not in allowed:
                self.send_error(403); return
            result = process(request)
            body = json.dumps(result, ensure_ascii=False).encode()
            self.send_response(200)
        except ValueError as error:
            # Explicit application outcomes only; upstream diagnostics may echo
            # inputs and must never be forwarded.
            code = str(error)
            if code in ['FINAL_VOTE_ALREADY_CAST', 'BALLOT_BOX_CLOSED', 'RESULTS_SUPPRESSED']:
                body = json.dumps({'error': code}).encode()
            else:
                body = b'{"error":"REFERENCE_REJECTED"}'
            self.send_response(422)
        except Exception:
            body = b'{"error":"REFERENCE_REJECTED"}'
            self.send_response(422)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)


server = HTTPServer(('0.0.0.0', 4310), Handler)
server.timeout = 100
server.serve_forever()
