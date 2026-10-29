'use strict';

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const net = require('node:net');
const fs = require('node:fs/promises');
const path = require('node:path');

const DRIVER_PORT = 9515;
const ROOM_RE = /[a-f0-9]{32}/;

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function eventually(fn, description, timeoutMs = 10000) {
  const end = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < end) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (error) { lastError = error; }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${description}${lastError ? `: ${lastError.message}` : ''}`);
}

class WebDriver {
  constructor(process) { this.process = process; this.sessionId = null; }
  async request(method, route, body) {
    const response = await fetch(`http://127.0.0.1:${DRIVER_PORT}${route}`, {
      method,
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok || result.value?.error) throw new Error(JSON.stringify(result.value || result));
    return result.value;
  }
  async start() {
    this.process = spawn('chromedriver', [`--port=${DRIVER_PORT}`], { stdio: 'ignore' });
    await eventually(async () => (await fetch(`http://127.0.0.1:${DRIVER_PORT}/status`)).ok, 'ChromeDriver readiness');
    const created = await this.request('POST', '/session', { capabilities: { alwaysMatch: {
      browserName: 'chrome',
      'goog:chromeOptions': { args: ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--window-size=1365,900'] },
      'goog:loggingPrefs': { browser: 'ALL' },
    } } });
    this.sessionId = created.sessionId;
  }
  route(suffix) { return `/session/${this.sessionId}${suffix}`; }
  async navigate(url) { await this.request('POST', this.route('/url'), { url }); }
  async script(script, args = []) { return this.request('POST', this.route('/execute/sync'), { script, args }); }
  async element(selector) {
    const found = await this.request('POST', this.route('/element'), { using: 'css selector', value: selector });
    return found['element-6066-11e4-a52e-4f735466cecf'];
  }
  async click(selector) { const id = await this.element(selector); await this.request('POST', this.route(`/element/${id}/click`), {}); }
  async type(selector, text) { const id = await this.element(selector); await this.request('POST', this.route(`/element/${id}/value`), { text, value: [...text] }); }
  async setSize(width, height) { await this.request('POST', this.route('/window/rect'), { width, height }); }
  async logs() { return this.request('POST', this.route('/log'), { type: 'browser' }); }
  async screenshot(file) {
    const result = await this.request('GET', this.route('/screenshot'));
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, Buffer.from(result, 'base64'));
  }
  async stop() {
    if (this.sessionId) await this.request('DELETE', this.route('')).catch(() => {});
    if (this.process && this.process.exitCode === null) this.process.kill('SIGTERM');
  }
}

async function main() {
  const port = await freePort();
  const server = spawn(process.execPath, ['app.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, NODE_ENV: 'production', PORT: String(port) },
    stdio: 'ignore',
  });
  const browser = new WebDriver();
  let testError;
  try {
    await eventually(async () => {
      try { return (await fetch(`http://127.0.0.1:${port}/`)).ok; } catch { return false; }
    }, 'production-mode timer server');
    await browser.start();
    await browser.navigate(`http://127.0.0.1:${port}/`);
    await browser.script("window.__testErrors=[]; addEventListener('error', event => window.__testErrors.push(event.message));");
    await eventually(() => browser.script("return document.querySelector('#connection-status span')?.textContent === 'Connected'"), 'Socket.IO client connection');
    await browser.click('#join-button');
    assert.equal(await browser.script("return document.querySelector('#room-input').getAttribute('aria-invalid')"), 'true', 'invalid room input must show an accessible error');
    await browser.click('#new-room-button');
    const room = await browser.script("return new URL(location.href).searchParams.get('room')");
    assert.match(room, ROOM_RE, 'new-room action should create a capability URL');
    await eventually(() => browser.script("return document.querySelector('#participant-count').textContent === '1'"), 'first participant count');

    const second = new WebDriver();
    await second.start();
    try {
      await second.navigate(`http://127.0.0.1:${port}/?room=${room}`);
      await second.script("window.__testErrors=[]; addEventListener('error', event => window.__testErrors.push(event.message));");
      await eventually(() => second.script("return document.querySelector('#timer-panel')?.hidden === false"), 'shared room detail in second browser');
      await eventually(() => browser.script("return document.querySelector('#participant-count').textContent === '2'"), 'two synchronized participants');
      await browser.click('#start-button');
      await eventually(() => browser.script("return document.querySelector('#timer-state span').textContent === 'Running live'"), 'first browser running state');
      await eventually(() => second.script("return document.querySelector('#timer-state span').textContent === 'Running live'"), 'second browser running state');
      await second.setSize(390, 844);
      const mobile = await second.script("return {width:innerWidth, scrollWidth:document.documentElement.scrollWidth, controlsVisible:!!document.querySelector('#start-button')?.getClientRects().length}");
      assert.ok(mobile.width <= 430 && mobile.scrollWidth <= mobile.width + 1 && mobile.controlsVisible, `mobile layout should fit and expose controls: ${JSON.stringify(mobile)}`);
      assert.deepEqual(await browser.script('return window.__testErrors'), [], 'primary browser should have no uncaught page errors');
      assert.deepEqual(await second.script('return window.__testErrors'), [], 'second browser should have no uncaught page errors');
    } finally {
      await second.stop();
    }
    const browserLogs = await browser.logs();
    const severeLogs = browserLogs.filter((item) => item.level === 'SEVERE');
    assert.deepEqual(severeLogs, [], 'browser console should not contain severe errors');
    console.log('PASS: production server, invalid room validation, two-client shared timer start, mobile layout, and browser errors');
  } catch (error) {
    testError = error;
    await browser.screenshot(path.resolve(__dirname, '../test-results/timer-browser-failure.png')).catch(() => {});
    throw error;
  } finally {
    await browser.stop();
    if (server.exitCode === null) server.kill('SIGTERM');
    if (testError) console.error('Timer browser regression failed; screenshot attempted at test-results/timer-browser-failure.png');
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
