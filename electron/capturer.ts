import { desktopCapturer } from 'electron'
import pixelmatch from 'pixelmatch'
import { PNG } from 'pngjs'

const CHANGE_THRESHOLD = 0.015  // 1.5% pixel change = meaningful

let lastFrameData: Buffer | null = null

/**
 * Captures the frontmost video-call window (Zoom, Meet, Teams, etc.)
 * or falls back to the first non-EchoConnect window.
 * Returns base64 PNG string, or null if nothing changed / no window found.
 */
export async function captureFrame(): Promise<string | null> {
  const sources = await desktopCapturer.getSources({
    types: ['window', 'screen'],
    thumbnailSize: { width: 1280, height: 720 },
  })

  const videoCallWindow = sources.find(s =>
    ['zoom', 'meet', 'teams', 'facetime', 'skype', 'discord', 'webex'].some(app =>
      s.name.toLowerCase().includes(app)
    )
  )

  // Fallback: first window that isn't our own overlay
  const target =
    videoCallWindow ??
    sources.find(s => !s.name.toLowerCase().includes('echoconnect'))

  if (!target) return null

  const buf = target.thumbnail.toPNG()
  if (!buf || buf.length === 0) return null

  if (lastFrameData && !hasSignificantChange(lastFrameData, buf)) {
    return null  // skip API call — frame too similar
  }

  lastFrameData = buf
  return buf.toString('base64')
}

function hasSignificantChange(prev: Buffer, curr: Buffer): boolean {
  try {
    const a = PNG.sync.read(prev)
    const b = PNG.sync.read(curr)
    if (a.width !== b.width || a.height !== b.height) return true

    const diff = new Uint8Array(a.width * a.height * 4)
    const changed = pixelmatch(
      new Uint8Array(a.data.buffer, a.data.byteOffset, a.data.byteLength),
      new Uint8Array(b.data.buffer, b.data.byteOffset, b.data.byteLength),
      diff,
      a.width,
      a.height,
      { threshold: 0.1 }
    )
    return changed / (a.width * a.height) > CHANGE_THRESHOLD
  } catch {
    return true  // on parse error, allow the API call
  }
}

export function resetLastFrame(): void {
  lastFrameData = null
}
