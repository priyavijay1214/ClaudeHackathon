import { app, BrowserWindow, ipcMain, globalShortcut, Tray, Menu, screen, nativeImage } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { captureFrame } from './capturer'
import { analyzeFrame } from './claude'

process.env.APP_ROOT = path.join(__dirname, '..')

// ── Load .env into process.env (API key stays in main process only) ──────────
const envFile = path.join(process.env.APP_ROOT, '.env')
if (fs.existsSync(envFile)) {
  fs.readFileSync(envFile, 'utf-8')
    .split('\n')
    .forEach(line => {
      const eqIdx = line.indexOf('=')
      if (eqIdx > 0) {
        const key = line.slice(0, eqIdx).trim()
        const val = line.slice(eqIdx + 1).trim()
        if (key && !process.env[key]) process.env[key] = val
      }
    })
}

// ── Paths ────────────────────────────────────────────────────────────────────
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST

// ── State ────────────────────────────────────────────────────────────────────
let overlayWin: BrowserWindow | null = null
let tray: Tray | null = null
let isQuiet = false
let captureInterval: ReturnType<typeof setInterval> | null = null

// ── Overlay Window ───────────────────────────────────────────────────────────
function createOverlayWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize

  overlayWin = new BrowserWindow({
    width: 380,
    height: 160,
    x: width - 400,
    y: height - 200,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: true,
    focusable: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  overlayWin.setAlwaysOnTop(true, 'screen-saver')
  overlayWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  if (VITE_DEV_SERVER_URL) {
    overlayWin.loadURL(VITE_DEV_SERVER_URL)
    // overlayWin.webContents.openDevTools({ mode: 'detach' })
  } else {
    overlayWin.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }

  overlayWin.on('closed', () => {
    overlayWin = null
  })
}

// ── Capture + Analyze Loop ───────────────────────────────────────────────────
function startCaptureLoop() {
  if (captureInterval) clearInterval(captureInterval)

  captureInterval = setInterval(async () => {
    if (isQuiet || !overlayWin) return

    overlayWin.webContents.send('echo:analyzing', true)
    try {
      const frame = await captureFrame()
      if (!frame) {
        overlayWin?.webContents.send('echo:analyzing', false)
        return
      }

      const nudge = await analyzeFrame(frame)
      overlayWin?.webContents.send('echo:analyzing', false)

      if (nudge && nudge.confidence >= 0.6) {
        overlayWin?.webContents.send('echo:nudge', nudge)
      }
    } catch (err) {
      console.error('[EchoConnect] Capture loop error:', err)
      overlayWin?.webContents.send('echo:analyzing', false)
    }
  }, 4000)
}

// ── System Tray ──────────────────────────────────────────────────────────────
function createTray() {
  const iconPath = path.join(process.env.VITE_PUBLIC!, 'electron-vite.svg')
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
  tray = new Tray(icon)
  tray.setToolTip('EchoConnect')

  const updateMenu = () => {
    const menu = Menu.buildFromTemplate([
      {
        label: isQuiet ? '▶  Resume Analysis' : '⏸  Pause Analysis',
        click: () => {
          isQuiet = !isQuiet
          overlayWin?.webContents.send('echo:quiet', isQuiet)
          updateMenu()
        },
      },
      { type: 'separator' },
      {
        label: 'Show Overlay',
        click: () => {
          if (!overlayWin) createOverlayWindow()
          else overlayWin.show()
        },
      },
      { type: 'separator' },
      { label: 'Quit EchoConnect', click: () => app.quit() },
    ])
    tray!.setContextMenu(menu)
  }

  updateMenu()
}

// ── IPC Handlers ─────────────────────────────────────────────────────────────
ipcMain.on('echo:toggle-quiet', () => {
  isQuiet = !isQuiet
  overlayWin?.webContents.send('echo:quiet', isQuiet)
})

ipcMain.on('echo:resize', (_event, height: number) => {
  if (overlayWin) {
    const [w] = overlayWin.getSize()
    overlayWin.setSize(w, height, true)
  }
})

// ── App Lifecycle ─────────────────────────────────────────────────────────────
app.on('window-all-closed', () => {
  // Keep app alive via tray on all platforms
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  if (captureInterval) clearInterval(captureInterval)
})

app.whenReady().then(() => {
  createOverlayWindow()
  createTray()
  startCaptureLoop()

  // Cmd+Shift+E (macOS) / Ctrl+Shift+E (Win/Linux) — toggle quiet mode
  globalShortcut.register('CommandOrControl+Shift+E', () => {
    isQuiet = !isQuiet
    overlayWin?.webContents.send('echo:quiet', isQuiet)
  })

  app.on('activate', () => {
    if (!overlayWin) createOverlayWindow()
  })
})
