// Take screenshots of the PTA CD app using Chrome DevTools Protocol
const { execSync, spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = 'http://127.0.0.1:5174';
const SHOTS_DIR = path.join(__dirname, '..', 'screenshots');

// Ensure screenshots dir exists
fs.mkdirSync(SHOTS_DIR, { recursive: true });

function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

function cdpSend(ws, id, method, params = {}) {
  return new Promise((resolve, reject) => {
    const WebSocket = require('ws');
    // We'll handle this inline
  });
}

// Simple approach: use Chrome's built-in screenshot via DevTools Protocol
// We'll use a simple HTTP-based approach with Chrome
async function main() {
  console.log('Starting Chrome in headless mode with remote debugging...\n');
  
  // Kill any existing Chrome instances using the debug port
  try { execSync('taskkill /F /IM chrome.exe 2>nul', { stdio: 'pipe' }); } catch {}
  
  // Start Chrome with remote debugging
  const chrome = spawn(CHROME, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--remote-debugging-port=9222',
    '--window-size=1280,900',
    '--hide-scrollbars'
  ], { stdio: 'pipe', detached: true });
  
  chrome.unref();
  
  // Wait for Chrome to start
  console.log('Waiting for Chrome to start...');
  await new Promise(r => setTimeout(r, 3000));
  
  try {
    // Get list of tabs
    const tabs = await httpGet('http://127.0.0.1:9222/json');
    console.log(`Found ${tabs.length} tab(s)`);
    
    if (tabs.length === 0) {
      console.error('No tabs found');
      process.exit(1);
    }
    
    const tab = tabs[0];
    console.log(`Using tab: ${tab.title}\n`);
    
    // Navigate to the app
    await httpGet(`http://127.0.0.1:9222/json/navigate?${encodeURIComponent(BASE)}`);
    await new Promise(r => setTimeout(r, 3000));
    
    // Now use Chrome DevTools Protocol via websocket
    const WebSocket = require('ws');
    const ws = new WebSocket(tab.webSocketDebuggerUrl);
    
    let msgId = 1;
    const pending = new Map();
    
    ws.on('message', (data) => {
      const msg = JSON.parse(data);
      if (msg.id && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      }
    });
    
    function send(method, params = {}) {
      return new Promise((resolve) => {
        const id = msgId++;
        pending.set(id, resolve);
        ws.send(JSON.stringify({ id, method, params }));
      });
    }
    
    function screenshot(filename) {
      return new Promise(async (resolve) => {
        const result = await send('Page.captureScreenshot', {
          format: 'png',
          clip: { x: 0, y: 0, width: 1280, height: 900, scale: 1 }
        });
        const buf = Buffer.from(result.result.data, 'base64');
        const outPath = path.join(SHOTS_DIR, filename);
        fs.writeFileSync(outPath, buf);
        console.log(`  ✓ Saved: ${filename} (${(buf.length / 1024).toFixed(0)}KB)`);
        resolve(outPath);
      });
    }
    
    function waitForLoad(ms = 2000) {
      return new Promise(r => setTimeout(r, ms));
    }
    
    function evaluate(expr) {
      return send('Runtime.evaluate', {
        expression: expr,
        awaitPromise: true,
        returnByValue: true
      });
    }
    
    ws.on('open', async () => {
      console.log('Connected to Chrome DevTools Protocol\n');
      
      // Enable necessary domains
      await send('Page.enable');
      await send('Runtime.enable');
      
      // Set viewport
      await send('Emulation.setDeviceMetricsOverride', {
        width: 1280,
        height: 900,
        deviceScaleFactor: 1,
        mobile: false
      });
      
      // 1. Login Screen
      console.log('1. Login Screen');
      await evaluate(`
        document.querySelector('.login-screen') ? true : 
        new Promise(r => setTimeout(() => r(true), 2000))
      `);
      await waitForLoad(2000);
      await screenshot('01-login-screen.png');
      
      // 2. Login with admin credentials
      console.log('\n2. Logging in as admin...');
      await evaluate(`
        (async () => {
          // Find and fill login form
          const inputs = document.querySelectorAll('input');
          const usernameInput = inputs[0];
          const passwordInput = inputs[1];
          if (usernameInput && passwordInput) {
            // Simulate React-compatible input changes
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            nativeInputValueSetter.call(usernameInput, 'admin');
            usernameInput.dispatchEvent(new Event('input', { bubbles: true }));
            nativeInputValueSetter.call(passwordInput, 'admin');
            passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
            // Submit
            const btn = document.querySelector('button[type="submit"]');
            if (btn) btn.click();
            return 'submitted';
          }
          return 'no form found';
        })()
      `);
      await waitForLoad(3000);
      
      // 3. Dashboard
      console.log('\n3. Dashboard');
      await screenshot('02-dashboard.png');
      
      // 4. Collections
      console.log('\n4. Collections - Navigate via sidebar');
      await evaluate(`
        document.querySelectorAll('.pta-nav-item')[1]?.click();
      `);
      await waitForLoad(2000);
      await screenshot('03-collections.png');
      
      // 5. Families
      console.log('\n5. Families & Balances');
      await evaluate(`
        document.querySelectorAll('.pta-nav-item')[2]?.click();
      `);
      await waitForLoad(2000);
      await screenshot('04-families.png');
      
      // 6. Disbursements
      console.log('\n6. Disbursements');
      await evaluate(`
        document.querySelectorAll('.pta-nav-item')[3]?.click();
      `);
      await waitForLoad(2000);
      await screenshot('05-disbursements.png');
      
      // 7. Advances & Liquidation
      console.log('\n7. Advances & Liquidation');
      await evaluate(`
        document.querySelectorAll('.pta-nav-item')[4]?.click();
      `);
      await waitForLoad(2000);
      await screenshot('06-advances.png');
      
      // 8. Funds & Distribution
      console.log('\n8. Funds & Distribution');
      await evaluate(`
        document.querySelectorAll('.pta-nav-item')[5]?.click();
      `);
      await waitForLoad(2000);
      await screenshot('07-funds.png');
      
      // 9. Reports
      console.log('\n9. Reports');
      await evaluate(`
        document.querySelectorAll('.pta-nav-item')[6]?.click();
      `);
      await waitForLoad(2000);
      await screenshot('08-reports.png');
      
      // 10. Settings
      console.log('\n10. Settings');
      await evaluate(`
        document.querySelectorAll('.pta-nav-item')[7]?.click();
      `);
      await waitForLoad(2000);
      await screenshot('09-settings.png');
      
      console.log('\n=== All screenshots captured ===');
      
      ws.close();
      chrome.kill();
      process.exit(0);
    });
    
  } catch (err) {
    console.error('Error:', err.message);
    chrome.kill();
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
