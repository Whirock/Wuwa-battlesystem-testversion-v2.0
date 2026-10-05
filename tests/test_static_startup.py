"""Real loopback HTTP static serving; does not change the startup/port policy."""
import json
import sys
import tempfile
import threading
import unittest
import urllib.request
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import APP_VERSION, BASE, Handler, Lab, ThreadingHTTPServer

class StaticStartupTests(unittest.TestCase):
    def test_home_index_and_static_assets(self):
        with tempfile.TemporaryDirectory() as user:
            server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
            server.lab = Lab(user)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            base = 'http://127.0.0.1:' + str(server.server_port)
            try:
                for route, file in [('/', 'index.html'), ('/index.html', 'index.html'),
                                    ('/assets/app.js', 'assets/app.js'),
                                    ('/assets/rule-text.js', 'assets/rule-text.js'),
                                    ('/assets/style.css', 'assets/style.css')]:
                    with self.subTest(route=route), urllib.request.urlopen(base + route) as response:
                        self.assertEqual(response.status, 200)
                        self.assertEqual(response.read(), (BASE / 'web' / file).read_bytes())
                with urllib.request.urlopen(base + '/api/catalog') as response:
                    self.assertEqual(json.load(response)['app_version'], APP_VERSION)
            finally:
                server.shutdown()
                thread.join()
                server.server_close()

if __name__ == '__main__':
    unittest.main()
