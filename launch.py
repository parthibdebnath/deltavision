#!/usr/bin/env python3
"""DeltaVision launcher.

Serves this folder on a local port and opens the apps as standalone windows
(Chrome / Edge / Brave / Chromium "app mode"), falling back to the default
browser. Works on Windows, macOS and Linux with only the Python standard library.

    python3 launch.py            # web + mobile
    python3 launch.py web        # desktop app only
    python3 launch.py mobile     # mobile app only
    python3 launch.py --browser "C:/path/to/chrome.exe"
    python3 launch.py --tabs     # open in normal browser tabs instead of app windows

The server stops by itself shortly after the last app window is closed,
or when you press Ctrl+C.
"""
import argparse
import functools
import http.server
import os
import platform
import shutil
import socket
import subprocess
import sys
import threading
import time
import webbrowser

ROOT = os.path.dirname(os.path.abspath(__file__))
PROFILE = os.path.join(os.path.expanduser('~'), '.deltavision', 'browser-profile')
IDLE_SHUTDOWN = 90  # seconds without a heartbeat (minimized windows only ping about once a minute)

last_ping = [0.0]


class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith('/__ping'):
            last_ping[0] = time.time()
            self.send_response(204)
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            return
        super().do_GET()

    def end_headers(self):
        if not self.path.startswith('/__ping'):
            self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    def log_message(self, *args):
        pass


def free_port(preferred):
    for port in [preferred] + list(range(preferred + 1, preferred + 50)):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(('127.0.0.1', port))
                return port
            except OSError:
                continue
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(('127.0.0.1', 0))
        return s.getsockname()[1]


def find_browser():
    system = platform.system()
    candidates = []
    if system == 'Windows':
        bases = [os.environ.get(k) for k in ('PROGRAMFILES', 'PROGRAMFILES(X86)', 'LOCALAPPDATA')]
        rels = [r'Google\Chrome\Application\chrome.exe', r'Microsoft\Edge\Application\msedge.exe',
                r'BraveSoftware\Brave-Browser\Application\brave.exe', r'Chromium\Application\chrome.exe']
        candidates = [os.path.join(b, r) for b in bases if b for r in rels]
    elif system == 'Darwin':
        apps = ['Google Chrome.app/Contents/MacOS/Google Chrome', 'Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
                'Brave Browser.app/Contents/MacOS/Brave Browser', 'Chromium.app/Contents/MacOS/Chromium',
                'Arc.app/Contents/MacOS/Arc']
        for base in ('/Applications', os.path.expanduser('~/Applications')):
            candidates += [os.path.join(base, a) for a in apps]
    else:
        for name in ('google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser',
                     'microsoft-edge', 'microsoft-edge-stable', 'brave-browser', 'brave'):
            path = shutil.which(name)
            if path:
                candidates.append(path)
    for c in candidates:
        if c and os.path.isfile(c):
            return c
    return None


def screen_size():
    try:
        import tkinter
        r = tkinter.Tk()
        r.withdraw()
        size = r.winfo_screenwidth(), r.winfo_screenheight()
        r.destroy()
        return size
    except Exception:
        return 1920, 1080


def open_app(browser, url, size, pos):
    os.makedirs(PROFILE, exist_ok=True)
    args = [browser, f'--app={url}', f'--user-data-dir={PROFILE}',
            f'--window-size={size[0]},{size[1]}', f'--window-position={pos[0]},{pos[1]}',
            '--no-first-run', '--no-default-browser-check', '--disable-features=Translate']
    kwargs = {'stdout': subprocess.DEVNULL, 'stderr': subprocess.DEVNULL}
    if platform.system() == 'Windows':
        kwargs['creationflags'] = 0x00000008  # DETACHED_PROCESS
    return subprocess.Popen(args, **kwargs)


def main():
    sys.stdout.reconfigure(line_buffering=True)
    ap = argparse.ArgumentParser(description='Launch the DeltaVision demo apps.')
    ap.add_argument('which', nargs='?', default='both', choices=['both', 'web', 'mobile'])
    ap.add_argument('--port', type=int, default=8642)
    ap.add_argument('--browser', help='path to a Chromium-based browser executable')
    ap.add_argument('--tabs', action='store_true', help='open in regular browser tabs')
    opts = ap.parse_args()

    port = free_port(opts.port)
    handler = functools.partial(Handler, directory=ROOT)
    httpd = http.server.ThreadingHTTPServer(('127.0.0.1', port), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    base = f'http://127.0.0.1:{port}'
    urls = {'web': f'{base}/web/index.html', 'mobile': f'{base}/mobile/index.html?fit=1'}
    targets = ['web', 'mobile'] if opts.which == 'both' else [opts.which]

    sw, sh = screen_size()
    mob_size = (470, min(1010, sh - 60))
    both = len(targets) > 1
    web_w = int(sw * 0.86)
    if both and sw - mob_size[0] - 60 >= 1100:
        web_w = min(web_w, sw - mob_size[0] - 60)  # side by side when the screen is wide enough
    web_size = (max(1100, web_w), max(700, int(sh * 0.86)))
    web_x = 20 if both else max(0, (sw - web_size[0]) // 2)
    layout = {
        'web': (web_size, (web_x, max(0, (sh - web_size[1]) // 2))),
        'mobile': (mob_size, (max(0, sw - mob_size[0] - 20), max(0, (sh - mob_size[1]) // 2))),
    }

    browser = None if opts.tabs else (opts.browser or find_browser())
    print(f'DeltaVision is being served at {base}/')
    if browser:
        print(f'Opening app window(s) with {browser}')
        for i, t in enumerate(targets):
            open_app(browser, urls[t], *layout[t])
            if i == 0 and len(targets) > 1:
                time.sleep(1.5)  # let the first window create the shared profile
    else:
        if not opts.tabs:
            print('No Chrome, Edge, Brave or Chromium found; opening in your default browser instead.')
        for t in targets:
            webbrowser.open(urls[t], new=1)
            time.sleep(0.5)
    for t in targets:
        print(f'  {t:7s} {urls[t].replace("?fit=1", "")}')
    print('Close the app windows (or press Ctrl+C) to stop.')

    started = time.time()
    try:
        while True:
            time.sleep(1)
            if last_ping[0]:
                if time.time() - last_ping[0] > IDLE_SHUTDOWN:
                    print('All DeltaVision windows closed. Bye!')
                    break
            elif time.time() - started > 120:
                print('No window connected within 2 minutes; still serving. Press Ctrl+C to stop.')
                started = float('inf')
    except KeyboardInterrupt:
        print('\nStopped.')
    finally:
        httpd.shutdown()


if __name__ == '__main__':
    sys.exit(main())
