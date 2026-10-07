// Browser regressions: node tests/slides-browser.mjs
// Set CHROME_BIN if Chrome is installed outside the standard macOS/Linux paths.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const temporary = await mkdtemp(join(tmpdir(), 's5-browser-'));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let chrome;
let socket;
let sequence = 0;
const pending = new Map();
const errors = [];
function send(method, params = {}) {
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}
async function load(url) {
  // Force a new document even when only the fragment changes.
  await send('Page.navigate', { url: 'about:blank' });
  await send('Page.navigate', { url });
  for (let n = 0; n < 100; n++) {
    if (await evaluate('document.readyState === "complete" && typeof window.go === "function"')) {
      await pause(250);
      return;
    }
    await pause(50);
  }
  throw new Error('Slideshow did not initialize: ' + url);
}
const style = (selector, property) => evaluate(`getComputedStyle(document.querySelector(${JSON.stringify(selector)}))[${JSON.stringify(property)}]`);
async function key(key, code) {
  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', {key: ${JSON.stringify(key)}, keyCode: ${code}, bubbles: true}))`);
}
async function move(x, y) {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await pause(50);
}
async function hover(selector) {
  const point = await evaluate(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return {x: r.x + r.width / 2, y: r.y + r.height / 2}; })()`);
  await move(point.x, point.y);
}
async function viewport(width, height) {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
}
async function fixture(theme, controlVis, view = 'slideshow') {
  const path = join(temporary, `${theme}-${controlVis}-${view}.html`);
  await writeFile(path, `<!doctype html><html><head><base href="${pathToFileURL(root)}">
    <meta name="defaultView" content="${view}"><meta name="controlVis" content="${controlVis}">
    <link rel="stylesheet" href="ui/${theme}/slides.css" media="projection" id="slideProj">
    <link rel="stylesheet" href="ui/default/outline.css" media="screen" id="outlineStyle">
    <link rel="stylesheet" href="ui/default/print.css" media="print">
    <script src="ui/default/slides.js"></script></head><body>
    <div class="layout"><div id="header"></div><div id="footer"><h1>Footer</h1></div><div id="controls"></div><div id="currentSlide"></div></div>
    <div class="presentation"><div class="slide"><h1>Title</h1></div>
    <div class="slide"><h1>Incrementals</h1><ul class="incremental"><li>First</li><li>Second</li></ul></div>
    <div class="slide"><h1>Last</h1><a href="#slide1" id="internal">Back to incrementals</a></div></div>
    </body></html>`);
  return pathToFileURL(path).href;
}

try {
  let endpoint = process.env.S5_CDP_URL;
  if (!endpoint) {
    const binary = process.env.CHROME_BIN || [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
    ].find(existsSync);
    assert.ok(binary, 'Chrome not found; set CHROME_BIN');
    chrome = spawn(binary, ['--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      `--user-data-dir=${join(temporary, 'profile')}`, '--remote-debugging-port=0', 'about:blank'], { stdio: 'ignore' });
    chrome.on('error', error => errors.push(error.message));
    const portFile = join(temporary, 'profile', 'DevToolsActivePort');
    for (let n = 0; n < 100 && !existsSync(portFile); n++) {
      assert.equal(chrome.exitCode, null, 'Chrome exited before starting');
      await pause(100);
    }
    const port = (await readFile(portFile, 'utf8')).split('\n')[0];
    endpoint = `http://127.0.0.1:${port}`;
  }
  const pages = await (await fetch(endpoint + '/json/list')).json();
  socket = new WebSocket(pages.find(page => page.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const request = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) request.reject(new Error(message.error.message));
      else request.resolve(message.result);
    } else if (message.method === 'Runtime.exceptionThrown') {
      errors.push(message.params.exceptionDetails.text);
    }
  });
  await send('Page.enable');
  await send('Runtime.enable');
  for (const theme of ['default', 'i18n']) {
    const revealProperty = theme === 'default' ? 'opacity' : 'visibility';
    const concealed = theme === 'default' ? '0' : 'hidden';
    const revealed = theme === 'default' ? '1' : 'visible';
    for (const controls of ['hidden', 'visible']) {
      const url = await fixture(theme, controls);
      await viewport(1024, 768);
      await load(url);
      await move(0, 0);
      assert.equal(await evaluate('document.querySelectorAll(".slide.active").length'), 1);
      assert.equal(await style('#slide0', 'visibility'), 'visible');
      assert.equal(await style('#slide1', 'visibility'), 'hidden');
      assert.equal(await style('#currentSlide', 'visibility'), 'hidden');
      assert.equal(await evaluate('document.getElementById("s5ss")'), null);
      for (const [width, height] of [[1024, 768], [400, 900], [1600, 400]]) {
        await viewport(width, height);
        assert.ok(Math.abs(parseFloat(await style('body', 'fontSize')) - Math.min(width / 32, height / 22)) < 0.01);
      }
      await viewport(1024, 768);
      const hidden = controls === 'hidden' ? '#navLinks' : '#jumplist';
      const trigger = controls === 'hidden' ? '#controlForm' : '#navList';
      assert.equal(await style(hidden, 'visibility'), 'hidden');
      await hover(trigger);
      assert.equal(await style(hidden, 'visibility'), 'visible');
      await move(0, 0);
      assert.equal(await style(hidden, 'visibility'), 'hidden');
      await key('c', 67);
      assert.equal(await style(hidden, 'visibility'), 'visible');
      await evaluate('document.getElementById("jumplist").focus()');
      await key('c', 67);
      assert.equal(await style(hidden, 'visibility'), 'visible', 'Focus keeps controls available');
      await evaluate('document.activeElement.blur()');
      assert.equal(await style(hidden, 'visibility'), 'hidden');
      await evaluate('window.go(1)');
      await pause(250);
      assert.equal(await style('#slide0', 'visibility'), 'hidden');
      assert.equal(await style('#slide1', 'visibility'), 'visible');
      assert.equal(await style('#slide1 li', revealProperty), concealed);
      await key('ArrowRight', 39);
      await pause(250);
      assert.equal(await style('#slide1 li', revealProperty), revealed);
      const state = await evaluate('Array.from(document.querySelectorAll(".slide, .slide li"), el => el.className)');
      await key('t', 84);
      assert.equal(await style('body', 'fontSize'), '16px');
      assert.equal(await style('#slide0', 'position'), 'static');
      assert.equal(await style('#slide0', 'visibility'), 'visible');
      assert.equal(await style('#slide2', 'visibility'), 'visible');
      assert.equal(await style('#slide1 li:last-child', 'visibility'), 'visible');
      assert.equal(await style('#prev', 'display'), 'none');
      assert.equal(await style('#toggle', 'display'), 'block');
      await evaluate('window.go(1)');
      assert.equal(await evaluate('document.querySelector(".slide.active").id'), 'slide1');
      await key('t', 84);
      await pause(250);
      assert.deepEqual(await evaluate('Array.from(document.querySelectorAll(".slide, .slide li"), el => el.className)'), state);
      assert.equal(await style('#slide1 li:last-child', revealProperty), concealed);
      await key('ArrowRight', 39);
      await key('ArrowRight', 39);
      assert.equal(await evaluate('document.querySelector(".slide.active").id'), 'slide2');
      await evaluate('document.getElementById("internal").click()');
      assert.equal(await evaluate('document.querySelector(".slide.active").id'), 'slide1');
      await send('Emulation.setEmulatedMedia', { media: 'print' });
      for (let n = 0; n < 3; n++) {
        assert.equal(await style('#slide' + n, 'visibility'), 'visible');
        assert.equal(await style('#slide' + n, 'opacity'), '1');
        assert.equal(await style('#slide' + n, 'position'), 'static');
      }
      assert.equal(await style('#slide1 li:last-child', 'visibility'), 'visible');
      assert.equal(await style('body', 'fontSize'), '16px');
      assert.equal(await style('.layout', 'display'), 'none');
      await send('Emulation.setEmulatedMedia', { media: '' });
      await load(url + '#slide2');
      assert.equal(await evaluate('document.querySelectorAll(".slide.active").length'), 1);
      assert.equal(await evaluate('document.querySelector(".slide.active").id'), 'slide2');
      console.log(`PASS ${theme} / controls ${controls}: scaling, hover, focus, keyboard, navigation, outline, print, deep link`);
    }
    await load(await fixture(theme, 'hidden', 'outline'));
    assert.equal(await style('#slide2', 'visibility'), 'visible');
    await evaluate('window.toggle()');
    assert.equal(await style('#slide0', 'visibility'), 'visible');
    assert.equal(await style('#slide2', 'visibility'), 'hidden');
    console.log(`PASS ${theme}: default outline view`);
  }
  await load(pathToFileURL(join(root, 's5-intro.html')).href);
  await evaluate('window.goTo(3); window.toggle(); window.toggle()');
  assert.equal(await evaluate('document.querySelectorAll(".slide.active").length'), 1);
  assert.equal(await evaluate('document.querySelector(".slide.active").id'), 'slide3');
  assert.deepEqual(errors, [], 'Browser JavaScript errors');
  console.log('PASS existing introduction deck; no JavaScript errors');
} finally {
  socket?.close();
  if (chrome) {
    chrome.kill('SIGTERM');
    await new Promise(resolve => chrome.exitCode !== null ? resolve() : chrome.once('exit', resolve));
  }
  await rm(temporary, { recursive: true, force: true });
}
