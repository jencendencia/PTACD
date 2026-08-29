#!/usr/bin/env python3
"""Take screenshots using Chrome CDP - simpler version."""
import json, os, subprocess, time, base64, http.client
import websocket

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
BASE_URL = "http://127.0.0.1:5174"
SHOTS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "screenshots")
PORT = 9222

os.makedirs(SHOTS_DIR, exist_ok=True)

_mid = 0
def send(ws, method, params=None):
    global _mid; _mid += 1
    msg = {"id": _mid, "method": method}
    if params: msg["params"] = params
    ws.send(json.dumps(msg))
    while True:
        r = json.loads(ws.recv())
        if r.get("id") == _mid: return r

def js(ws, expr):
    r = send(ws, "Runtime.evaluate", {"expression": expr, "awaitPromise": True, "returnByValue": True})
    return r.get("result", {}).get("result", {}).get("value")

def shot(ws, name):
    r = send(ws, "Page.captureScreenshot", {"format": "png"})
    buf = base64.b64decode(r["result"]["data"])
    p = os.path.join(SHOTS_DIR, name)
    with open(p, "wb") as f: f.write(buf)
    print(f"  OK {name} ({len(buf)//1024}KB)")

def main():
    # Clean kill
    subprocess.run(["taskkill", "/F", "/IM", "chrome.exe"], capture_output=True)
    time.sleep(1)

    # Start Chrome
    subprocess.Popen([
        CHROME, "--headless=new", "--no-sandbox", "--disable-gpu",
        f"--remote-debugging-port={PORT}", "--remote-allow-origins=*",
        "--window-size=1280,900", "--hide-scrollbars"
    ], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    time.sleep(4)

    # Get the new tab
    conn = http.client.HTTPConnection("127.0.0.1", PORT, timeout=5)
    conn.request("GET", "/json")
    tabs = json.loads(conn.getresponse().read())
    conn.close()
    
    # Find a blank tab or use the first one
    tab = None
    for t in tabs:
        if "chrome://" in t.get("url", ""):
            tab = t
            break
    if not tab:
        tab = tabs[0]
    
    print(f"Tab: {tab.get('url', '')}")
    ws = websocket.create_connection(tab["webSocketDebuggerUrl"])
    send(ws, "Page.enable")
    send(ws, "Runtime.enable")
    
    # Navigate to app
    print("Navigating to app...")
    send(ws, "Page.navigate", {"url": BASE_URL})
    time.sleep(4)

    # Screenshot login
    print("\n[1] Login Screen")
    shot(ws, "01-login-screen.png")

    # Login as admin
    print("\n[2] Logging in...")
    result = js(ws, """
        (async () => {
            const inputs = document.querySelectorAll('.form input');
            if (inputs.length < 2) return 'no inputs found: ' + document.querySelector('.login-card')?.innerHTML?.slice(0,200);
            const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
            s.call(inputs[0], 'admin');
            inputs[0].dispatchEvent(new Event('input', {bubbles:true}));
            await new Promise(r => setTimeout(r, 100));
            s.call(inputs[1], 'admin');
            inputs[1].dispatchEvent(new Event('input', {bubbles:true}));
            await new Promise(r => setTimeout(r, 300));
            document.querySelector('button[type="submit"]').click();
            return 'submitted';
        })()
    """)
    print(f"  Login result: {result}")
    time.sleep(4)

    # Dashboard
    print("\n[3] Dashboard")
    shot(ws, "02-dashboard.png")

    # Navigate to each screen
    nav = [
        ("Collections", "03-collections.png", 1),
        ("Families", "04-families.png", 2),
        ("Disbursements", "05-disbursements.png", 3),
        ("Advances", "06-advances.png", 4),
        ("Funds & Distribution", "07-funds.png", 5),
        ("Reports", "08-reports.png", 6),
        ("Settings", "09-settings.png", 7),
    ]
    for name, fname, idx in nav:
        print(f"\n{idx+3}. {name}")
        js(ws, f"document.querySelectorAll('.pta-nav-item')[{idx}]?.click()")
        time.sleep(2)
        shot(ws, fname)

    ws.close()
    print("\n=== Done ===")

if __name__ == "__main__":
    main()
