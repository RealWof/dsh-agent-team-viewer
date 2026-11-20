#!/usr/bin/env node
/**
 * Capture the README screenshots from the standalone mocks — no dependencies.
 *
 *   node scripts/capture.mjs --base http://127.0.0.1:9222
 *   node scripts/capture.mjs --electron "C:\...\DeepSeek Harness.exe"
 *   node scripts/capture.mjs                      # headless Chrome/Edge
 *
 * The pages under `dev/preview/out/` are static HTML with fictional data, so a
 * screenshot can never expose a real session. This script drives Chrome DevTools
 * Protocol: it either launches a headless Chrome/Edge found in the standard
 * Windows paths, attaches to an already running debugging endpoint (Chrome or
 * the application started with `--remote-debugging-port`), or starts the
 * DeepSeek Harness executable in that mode itself.
 *
 * CDP is a WebSocket API and the project takes no runtime dependencies, so the
 * minimal RFC 6455 client lives at the bottom of this file: one handshake, one
 * frame writer, one frame parser. Nothing else of the protocol is needed.
 */

import crypto from 'node:crypto'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const MOCK_DIR = path.join(ROOT, 'dev', 'preview', 'out')
const DEFAULT_OUT = path.join(ROOT, 'docs', 'screenshots')
const DEFAULT_PORT = 9333

/** The exact files the READMEs reference, in capture order. */
const SHOTS = [
  { name: 'board-light.png', page: 'board-en-light.html', width: 1680, height: 1050, scheme: 'light' },
  { name: 'board-ru.png', page: 'board-ru-light.html', width: 1680, height: 1050, scheme: 'light' },
  { name: 'board-zh.png', page: 'board-zh-light.html', width: 1680, height: 1050, scheme: 'light' },
  { name: 'panel-light.png', page: 'board-en-light.html?view=panel', width: 1080, height: 1440, scheme: 'light' },
  { name: 'panel-ru.png', page: 'board-ru-light.html?view=panel', width: 1080, height: 1440, scheme: 'light' },
  { name: 'panel-zh.png', page: 'board-zh-light.html?view=panel', width: 1080, height: 1440, scheme: 'light' },
  { name: 'task-dialog.png', page: 'task-en-light.html', width: 1280, height: 860, scheme: 'light' },
  { name: 'task-dialog-ru.png', page: 'task-ru-light.html', width: 1280, height: 860, scheme: 'light' },
  { name: 'task-dialog-zh.png', page: 'task-zh-light.html', width: 1280, height: 860, scheme: 'light' },
  { name: 'agent-dialog.png', page: 'agent-en-light.html', width: 1280, height: 900, scheme: 'light' },
  { name: 'agent-dialog-ru.png', page: 'agent-ru-light.html', width: 1280, height: 900, scheme: 'light' },
  { name: 'agent-dialog-zh.png', page: 'agent-zh-light.html', width: 1280, height: 900, scheme: 'light' },
  { name: 'board-dark.png', page: 'board-en-dark.html', width: 1680, height: 1050, scheme: 'dark' },
  { name: 'board-dark-ru.png', page: 'board-ru-dark.html', width: 1680, height: 1050, scheme: 'dark' },
  { name: 'board-dark-zh.png', page: 'board-zh-dark.html', width: 1680, height: 1050, scheme: 'dark' },
]

/** Standard Windows install locations, per channel. */
const BROWSER_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  path.join(process.env.LOCALAPPDATA ?? '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  path.join(process.env.LOCALAPPDATA ?? '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
].filter(candidate => candidate !== '')

const USAGE = 'Usage: node scripts/capture.mjs [--base http://127.0.0.1:9222 | --electron "<DeepSeek Harness.exe>"]'
  + ' [--browser <chrome.exe>] [--out docs/screenshots] [--only <name>] [--help]'

function printUsage() {
  console.log(USAGE)
  console.log('')
  console.log('Screenshots (written to --out, default docs/screenshots):')
  for (const shot of SHOTS) {
    console.log('  ' + shot.name.padEnd(18) + shot.width + '×' + shot.height + '  ' + shot.page)
  }
  console.log('')
  console.log('Sources of a debugging endpoint:')
  console.log('  --base <url>     an already running CDP endpoint (Chrome, Edge, or DeepSeek Harness')
  console.log('                   started with --remote-debugging-port=9222)')
  console.log('  --electron <exe> launch "DeepSeek Harness.exe" with that port and attach')
  console.log('  (default)        launch a headless Chrome/Edge found on this machine')
  console.log('  --browser <exe>  use a specific Chrome/Edge executable')
}

function parseArgs(argv) {
  const args = { out: DEFAULT_OUT, input: MOCK_DIR, port: DEFAULT_PORT }
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    const next = () => {
      const value = argv[index + 1]
      if (value === undefined || value.startsWith('--')) throw new Error(flag + ' needs a value')
      index += 1
      return value
    }
    if (flag === '--help' || flag === '-h') args.help = true
    else if (flag === '--base') args.base = next().replace(/\/+$/, '')
    else if (flag === '--electron') args.electron = path.resolve(next())
    else if (flag === '--browser') args.browser = path.resolve(next())
    else if (flag === '--out') args.out = path.resolve(ROOT, next())
    else if (flag === '--input') args.input = path.resolve(ROOT, next())
    else if (flag === '--port') args.port = Number(next())
    else if (flag === '--only') args.only = next()
    else if (flag === '--detect') args.detect = true
    else throw new Error('unknown option: ' + flag)
  }
  return args
}

/** Pick the first browser that exists on this machine. */
function findBrowser(explicit) {
  if (explicit !== undefined) return fs.existsSync(explicit) ? explicit : undefined
  for (const candidate of BROWSER_CANDIDATES) {
    try {
      if (fs.existsSync(candidate)) return candidate
    } catch {
      // A malformed %LOCALAPPDATA% is not a reason to stop looking.
    }
  }
  return undefined
}

/* ------------------------------------------------------------------ *
 * Run control
 * ------------------------------------------------------------------ */

const running = { child: undefined, profile: undefined }

function cleanup() {
  if (running.child !== undefined) {
    try {
      running.child.kill()
    } catch {
      // Already gone.
    }
    running.child = undefined
  }
  if (running.profile !== undefined) {
    try {
      fs.rmSync(running.profile, { recursive: true, force: true })
    } catch {
      // A locked profile directory is harmless; the OS clears the temp dir.
    }
    running.profile = undefined
  }
}

process.on('SIGINT', () => {
  cleanup()
  process.exit(130)
})
process.on('exit', cleanup)

/* ------------------------------------------------------------------ *
 * Endpoint discovery
 * ------------------------------------------------------------------ */

const sleep = ms => new Promise(resolve => { setTimeout(resolve, ms) })

/** Wait until a CDP endpoint answers `/json/version`. */
async function waitForEndpoint(base, timeoutMs = 30000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(base + '/json/version')
      if (response.ok) {
        const version = await response.json()
        return version
      }
    } catch {
      // Not up yet.
    }
    await sleep(250)
  }
  return undefined
}

/** A page target's websocket URL, creating a tab when the endpoint has none. */
async function pageTarget(base) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const response = await fetch(base + '/json/list')
    const targets = await response.json()
    const page = targets.find(target => target.type === 'page' && typeof target.webSocketDebuggerUrl === 'string')
    if (page !== undefined) return page.webSocketDebuggerUrl
    if (attempt === 8) {
      try {
        await fetch(base + '/json/new?about:blank', { method: 'PUT' })
      } catch {
        // Older endpoints accept GET only; the next attempts still work.
      }
    }
    await sleep(250)
  }
  return undefined
}

/* ------------------------------------------------------------------ *
 * The screenshot run
 * ------------------------------------------------------------------ */

/** Turn a mock page name (with optional query) into a file URL. */
function pageUrl(input, page) {
  const [name, query] = page.split('?')
  const file = path.join(input, name)
  if (!fs.existsSync(file)) throw new Error('mock page missing: ' + path.relative(ROOT, file))
  const url = pathToFileURL(file).href
  return query === undefined ? url : url + '?' + query
}

/** Drive one target through the shot list. */
async function captureAll(client, options) {
  const shots = options.only === undefined
    ? SHOTS
    : SHOTS.filter(shot => shot.name.includes(options.only) || shot.page.includes(options.only))
  if (shots.length === 0) throw new Error('no shot matches --only ' + options.only)

  await client.send('Page.enable')
  await client.send('Runtime.enable')
  fs.mkdirSync(options.out, { recursive: true })

  for (const shot of shots) {
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: shot.width,
      height: shot.height,
      deviceScaleFactor: 1,
      mobile: false,
    })
    await client.send('Emulation.setEmulatedMedia', {
      media: 'screen',
      features: [{ name: 'prefers-color-scheme', value: shot.scheme }],
    })
    await client.send('Page.navigate', { url: pageUrl(options.input, shot.page) })
    await client.send('Runtime.evaluate', {
      expression: 'document.fonts.ready.then(() => document.readyState)',
      awaitPromise: true,
    })
    await client.send('Runtime.evaluate', {
      expression: 'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))',
      awaitPromise: true,
    })
    const captured = await client.send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: false,
    })
    const file = path.join(options.out, shot.name)
    fs.writeFileSync(file, Buffer.from(captured.data, 'base64'))
    const bytes = fs.statSync(file).size
    console.log('[capture] ' + shot.name.padEnd(18) + shot.width + '×' + shot.height
      + '  ' + Math.round(bytes / 1024) + ' KB')
  }
  return shots.length
}

/* ------------------------------------------------------------------ *
 * Entry point
 * ------------------------------------------------------------------ */

async function main() {
  let args
  try {
    args = parseArgs(process.argv.slice(2))
  } catch (error) {
    console.error('[capture] ' + error.message)
    console.log(USAGE)
    process.exit(2)
  }
  if (args.help) {
    printUsage()
    return 0
  }

  if (!fs.existsSync(path.join(args.input, 'board-en-light.html'))) {
    console.log('[capture] mocks not built yet, building them first')
    const result = spawnSync(process.execPath, [path.join(ROOT, 'dev', 'preview', 'build-mock.mjs')], { stdio: 'inherit' })
    if (result.status !== 0) throw new Error('build-mock.mjs failed')
  }

  if (args.detect) {
    const found = findBrowser(args.browser)
    console.log(found === undefined
      ? '[capture] no Chrome or Edge in the standard Windows paths'
      : '[capture] browser: ' + found)
    return 0
  }

  let base = args.base
  if (base === undefined && args.electron !== undefined) {
    if (!fs.existsSync(args.electron)) {
      console.error('[capture] executable not found: ' + args.electron)
      return 0
    }
    const port = args.port
    base = 'http://127.0.0.1:' + port
    console.log('[capture] starting ' + path.basename(args.electron) + ' with CDP on ' + port)
    running.child = spawn(args.electron, ['--remote-debugging-port=' + port], { stdio: 'ignore' })
    const version = await waitForEndpoint(base, 45000)
    if (version === undefined) {
      console.error('[capture] the application did not open a debugging port on ' + port)
      console.error('  start it yourself with --remote-debugging-port=9222 and pass --base http://127.0.0.1:9222')
      return 0
    }
  }

  if (base === undefined) {
    const browser = findBrowser(args.browser)
    if (browser === undefined) {
      console.log('[capture] no browser found: nothing to drive.')
      if (args.browser !== undefined) console.log('  not found: ' + args.browser)
      console.log('  install Google Chrome or Microsoft Edge, or pass --browser "<path to chrome.exe>"')
      console.log('  or attach to a running endpoint: --base http://127.0.0.1:9222')
      console.log('  or start the app: --electron "<path to DeepSeek Harness.exe>"')
      console.log('[capture] mock pages are ready in ' + path.relative(ROOT, args.input) + ' — open them by hand any time')
      return 0
    }
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-screenshot-'))
    running.profile = profile
    const port = args.port
    base = 'http://127.0.0.1:' + port
    console.log('[capture] browser: ' + browser)
    console.log('[capture] headless on port ' + port + ', output ' + path.relative(ROOT, args.out))
    running.child = spawn(browser, [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--disable-background-networking',
      '--force-device-scale-factor=1',
      '--user-data-dir=' + profile,
      '--remote-debugging-port=' + port,
      'about:blank',
    ], { stdio: 'ignore' })
    const version = await waitForEndpoint(base)
    if (version === undefined) {
      console.error('[capture] headless browser did not open a debugging port on ' + port)
      return 1
    }
  } else {
    const version = await waitForEndpoint(base, 5000)
    if (version === undefined) {
      console.error('[capture] no CDP endpoint at ' + base)
      console.error('  start Chrome/Edge with --remote-debugging-port=<port>, or pass --electron')
      return 0
    }
    console.log('[capture] attached to ' + base + ' (' + (version.Browser ?? 'unknown') + ')')
  }

  const socketUrl = await pageTarget(base)
  if (socketUrl === undefined) {
    console.error('[capture] the endpoint exposes no page target')
    return 1
  }

  const socket = new WebSocketClient()
  await socket.connect(socketUrl)
  const client = new CdpClient(socket)
  try {
    const count = await captureAll(client, args)
    console.log('[capture] ' + count + ' screenshots in ' + path.relative(ROOT, args.out))
  } finally {
    socket.close()
  }
  return 0
}

/* ------------------------------------------------------------------ *
 * Minimal RFC 6455 client — a browser-to-server socket, frames only
 * ------------------------------------------------------------------ */

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'

class WebSocketClient {
  constructor() {
    this.socket = undefined
    this.buffer = Buffer.alloc(0)
    this.fragments = []
    this.fragmentOpcode = 0
    this.messageHandlers = []
    this.closeHandlers = []
  }

  /** Open the socket and complete the upgrade handshake. */
  async connect(socketUrl) {
    const target = new URL(socketUrl)
    const key = crypto.randomBytes(16).toString('base64')
    const socket = net.connect({
      host: target.hostname,
      port: Number(target.port === '' ? (target.protocol === 'wss:' ? 443 : 80) : target.port),
    })
    this.socket = socket
    socket.setNoDelay(true)

    await new Promise((resolve, reject) => {
      let head = Buffer.alloc(0)
      const fail = error => {
        socket.removeListener('data', onData)
        reject(error)
      }
      const onData = chunk => {
        head = Buffer.concat([head, chunk])
        const end = head.indexOf('\r\n\r\n')
        if (end === -1) return
        socket.removeListener('data', onData)
        const response = head.slice(0, end).toString('latin1')
        if (!/^HTTP\/1\.1 101/.test(response)) {
          fail(new Error('websocket refused: ' + response.split('\r\n')[0]))
          return
        }
        const accept = /sec-websocket-accept:\s*(\S+)/i.exec(response)?.[1]
        const expected = crypto.createHash('sha1').update(key + GUID).digest('base64')
        if (accept !== expected) {
          fail(new Error('websocket accept mismatch'))
          return
        }
        socket.on('data', data => this.onData(data))
        const rest = head.slice(end + 4)
        if (rest.length > 0) this.onData(rest)
        resolve()
      }
      socket.on('error', fail)
      socket.on('data', onData)
      socket.once('connect', () => {
        socket.write('GET ' + (target.pathname === '' ? '/' : target.pathname) + (target.search === '' ? '' : target.search)
          + ' HTTP/1.1\r\n'
          + 'Host: ' + target.host + '\r\n'
          + 'Upgrade: websocket\r\n'
          + 'Connection: Upgrade\r\n'
          + 'Sec-WebSocket-Key: ' + key + '\r\n'
          + 'Sec-WebSocket-Version: 13\r\n\r\n')
      })
    })
  }

  /** Register a text-message handler. */
  onMessage(handler) {
    this.messageHandlers.push(handler)
  }

  /** Register a close handler. */
  onClose(handler) {
    this.closeHandlers.push(handler)
  }

  /** Send one masked text frame. */
  send(text) {
    if (this.socket === undefined) throw new Error('websocket is not connected')
    const payload = Buffer.from(text, 'utf8')
    const mask = crypto.randomBytes(4)
    let header
    if (payload.length < 126) {
      header = Buffer.from([0x81, 0x80 | payload.length])
    } else if (payload.length < 65536) {
      header = Buffer.alloc(4)
      header[0] = 0x81
      header[1] = 0x80 | 126
      header.writeUInt16BE(payload.length, 2)
    } else {
      header = Buffer.alloc(10)
      header[0] = 0x81
      header[1] = 0x80 | 127
      header.writeBigUInt64BE(BigInt(payload.length), 2)
    }
    const masked = Buffer.alloc(payload.length)
    for (let index = 0; index < payload.length; index += 1) {
      masked[index] = payload[index] ^ mask[index % 4]
    }
    this.socket.write(Buffer.concat([header, mask, masked]))
  }

  /** Send the close frame and drop the socket. */
  close() {
    if (this.socket === undefined) return
    try {
      this.socket.write(Buffer.from([0x88, 0x80, 0, 0, 0, 0]))
      this.socket.end()
    } catch {
      // Already closed.
    }
    this.socket = undefined
  }

  /** Feed incoming bytes into the frame parser. */
  onData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk])
    for (;;) {
      if (this.buffer.length < 2) return
      const first = this.buffer[0]
      const second = this.buffer[1]
      const fin = (first & 0x80) !== 0
      const opcode = first & 0x0f
      const masked = (second & 0x80) !== 0
      let length = second & 0x7f
      let offset = 2
      if (length === 126) {
        if (this.buffer.length < 4) return
        length = this.buffer.readUInt16BE(2)
        offset = 4
      } else if (length === 127) {
        if (this.buffer.length < 10) return
        length = Number(this.buffer.readBigUInt64BE(2))
        offset = 10
      }
      let mask
      if (masked) {
        if (this.buffer.length < offset + 4) return
        mask = this.buffer.subarray(offset, offset + 4)
        offset += 4
      }
      if (this.buffer.length < offset + length) return
      let payload = this.buffer.subarray(offset, offset + length)
      if (masked) {
        const copy = Buffer.alloc(payload.length)
        for (let index = 0; index < payload.length; index += 1) copy[index] = payload[index] ^ mask[index % 4]
        payload = copy
      }
      this.buffer = this.buffer.subarray(offset + length)
      this.onFrame(opcode, fin, payload)
    }
  }

  /** Handle one complete frame. */
  onFrame(opcode, fin, payload) {
    if (opcode === 0x9) {
      // Ping: answer with an empty masked pong.
      if (this.socket !== undefined) this.socket.write(Buffer.from([0x8a, 0x80, 0, 0, 0, 0]))
      return
    }
    if (opcode === 0x8) {
      for (const handler of this.closeHandlers) handler()
      this.close()
      return
    }
    if (opcode === 0x1 || opcode === 0x2) {
      if (fin) {
        this.deliver(payload)
        return
      }
      this.fragments = [payload]
      this.fragmentOpcode = opcode
      return
    }
    if (opcode === 0x0 && this.fragments.length > 0) {
      this.fragments.push(payload)
      if (fin) {
        const whole = Buffer.concat(this.fragments)
        this.fragments = []
        this.deliver(whole)
      }
    }
  }

  /** Hand a whole message to the listeners. */
  deliver(payload) {
    let message
    try {
      message = JSON.parse(payload.toString('utf8'))
    } catch {
      return
    }
    for (const handler of this.messageHandlers) handler(message)
  }
}

/** The slice of CDP this script needs: `send(method, params)` over one socket. */
class CdpClient {
  constructor(socket) {
    this.socket = socket
    this.nextId = 0
    this.pending = new Map()
    socket.onMessage(message => {
      if (message.id === undefined) return
      const entry = this.pending.get(message.id)
      if (entry === undefined) return
      this.pending.delete(message.id)
      if (message.error !== undefined) entry.reject(new Error(message.error.message ?? 'CDP error'))
      else entry.resolve(message.result ?? {})
    })
    socket.onClose(() => {
      for (const entry of this.pending.values()) entry.reject(new Error('websocket closed'))
      this.pending.clear()
    })
  }

  /** Send one command and resolve with its result. */
  send(method, params = {}) {
    const id = ++this.nextId
    const payload = JSON.stringify({ id, method, params })
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error('CDP timeout: ' + method))
      }, 30000)
      this.pending.set(id, {
        resolve: value => { clearTimeout(timer); resolve(value) },
        reject: error => { clearTimeout(timer); reject(error) },
      })
      this.socket.send(payload)
    })
  }
}

main()
  .then(code => { cleanup(); process.exit(code ?? 0) })
  .catch(error => {
    console.error('[capture] ' + (error?.message ?? String(error)))
    cleanup()
    process.exit(1)
  })
