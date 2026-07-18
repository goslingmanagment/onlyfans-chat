// REPL driver for ChatGoose Desktop (Electron).
// Launches the BUILT app (apps/desktop/out) via playwright-core's _electron
// with an ISOLATED keyless profile (CHATGOOSE_USER_DATA_DIR) so the real
// dev profile, hub credentials, and encrypted DB are never touched.
// Designed for agents: run inside tmux, drive with send-keys / capture-pane.
import { _electron as electron } from 'playwright-core';
import * as readline from 'node:readline';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { tmpdir } from 'node:os';

const APP_DIR =
  process.env.CHATGOOSE_APP_DIR ??
  path.resolve(import.meta.dirname, '../../../apps/desktop');
const RUN_DIR = path.join(tmpdir(), 'chatgoose-run');
const SHOT_DIR = process.env.SCREENSHOT_DIR ?? path.join(RUN_DIR, 'shots');
const PROFILE = process.env.CHATGOOSE_RUN_PROFILE ?? path.join(RUN_DIR, 'profile');
fs.mkdirSync(SHOT_DIR, { recursive: true });
fs.mkdirSync(PROFILE, { recursive: true });

const electronBin =
  process.platform === 'darwin'
    ? path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron')
    : path.join(APP_DIR, 'node_modules/electron/dist/electron');

let app = null;
let page = null;

const COMMANDS = {
  async launch() {
    if (app) return console.log('already launched');
    app = await electron.launch({
      executablePath: electronBin,
      // Linux containers need --no-sandbox; harmless elsewhere.
      args: [...(process.platform === 'linux' ? ['--no-sandbox'] : []), APP_DIR],
      env: { ...process.env, CHATGOOSE_USER_DATA_DIR: PROFILE },
      timeout: 30_000,
    });
    page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('#root > *', { timeout: 20_000 }).catch(() => {});
    console.log('launched.', app.windows().length, 'windows:');
    for (const w of app.windows()) console.log(' ', w.url());
  },

  async ss(name) {
    if (!page) return console.log('ERROR: launch first');
    const f = path.join(SHOT_DIR, (name || `ss-${Date.now()}`) + '.png');
    await page.screenshot({ path: f });
    console.log('screenshot:', f);
  },

  // DOM click via evaluate(), not locator.click(): coordinate-based clicks
  // can hit the wrong layer; DOM .click() always reaches the element.
  async click(sel) {
    if (!page) return console.log('ERROR: launch first');
    const r = await page.evaluate((s) => {
      const el = document.querySelector(s);
      if (!el) return 'NOT_FOUND';
      el.click();
      return 'OK';
    }, sel);
    console.log('click', sel, '→', r);
  },

  async 'click-text'(text) {
    if (!page) return console.log('ERROR: launch first');
    const r = await page.evaluate((t) => {
      const els = [...document.querySelectorAll('button, a, [role="button"], [role="tab"]')];
      const el =
        els.find((e) => e.textContent?.trim() === t) ??
        els.find((e) => e.textContent?.includes(t));
      if (!el) return 'NOT_FOUND';
      el.click();
      return 'OK: ' + el.tagName + ' ' + (el.textContent?.trim().slice(0, 40) ?? '');
    }, text);
    console.log('click-text', JSON.stringify(text), '→', r);
  },

  async type(text) {
    if (!page) return console.log('ERROR: launch first');
    await page.keyboard.type(text, { delay: 30 });
    console.log('typed');
  },

  async press(key) {
    if (!page) return console.log('ERROR: launch first');
    await page.keyboard.press(key);
    console.log('pressed', key);
  },

  async wait(sel) {
    if (!page) return console.log('ERROR: launch first');
    try {
      await page.waitForSelector(sel, { timeout: 10_000 });
      console.log('found:', sel);
    } catch {
      console.log('TIMEOUT:', sel);
    }
  },

  async eval(expr) {
    if (!page) return console.log('ERROR: launch first');
    try {
      console.log(JSON.stringify(await page.evaluate(expr)));
    } catch (e) {
      console.log('ERROR:', e.message);
    }
  },

  async text(sel) {
    if (!page) return console.log('ERROR: launch first');
    console.log(
      await page.evaluate(
        (s) => (s ? document.querySelector(s) : document.body)?.innerText ?? '(null)',
        sel || null,
      ),
    );
  },

  // List clickable elements — the fastest way to find click-text targets.
  async buttons() {
    if (!page) return console.log('ERROR: launch first');
    const list = await page.evaluate(() =>
      [...document.querySelectorAll('button, a, [role="button"], [role="tab"]')]
        .map((e) => e.textContent?.trim().replace(/\s+/g, ' ').slice(0, 60))
        .filter(Boolean),
    );
    console.log(JSON.stringify(list));
  },

  async windows() {
    if (!app) return console.log('ERROR: launch first');
    for (const w of app.windows()) console.log(' ', w.url());
  },

  async quit() {
    if (app) await app.close().catch(() => {});
    app = null;
    page = null;
    console.log('quit done');
  },

  help() {
    console.log('commands:', Object.keys(COMMANDS).join(', '));
  },
};

// Raw-fd stdin: Electron child would otherwise steal the REPL's input.
const stdin = fs.createReadStream(null, { fd: fs.openSync('/dev/stdin', 'r') });
const rl = readline.createInterface({ input: stdin, output: process.stdout, prompt: 'driver> ' });

rl.on('line', async (line) => {
  const [cmd, ...rest] = line.trim().split(/\s+/);
  if (!cmd) return rl.prompt();
  const fn = COMMANDS[cmd];
  if (!fn) {
    console.log('unknown:', cmd, '— try: help');
    return rl.prompt();
  }
  try {
    await fn(rest.join(' '));
  } catch (e) {
    console.log('ERROR:', e.message);
  }
  if (cmd === 'quit') {
    rl.close();
    process.exit(0);
  }
  rl.prompt();
});
rl.on('close', async () => {
  await COMMANDS.quit();
  process.exit(0);
});

console.log('chatgoose driver — "help" for commands, "launch" to start');
console.log('profile:', PROFILE);
console.log('shots:', SHOT_DIR);
rl.prompt();
