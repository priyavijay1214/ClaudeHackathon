import { useState, useEffect, useRef, useCallback } from 'react'
import type { NudgePayload, ToneCategory } from './shared/types'
import './App.css'

// ── Tone color config ─────────────────────────────────────────────────────────
const TONE: Record<ToneCategory, { color: string; bg: string; label: string }> = {
  curious:    { color: '#60A5FA', bg: 'rgba(59,130,246,0.13)',   label: 'CURIOUS' },
  warm:       { color: '#34D399', bg: 'rgba(52,211,153,0.13)',   label: 'WARM' },
  disengaged: { color: '#FBBF24', bg: 'rgba(251,191,36,0.13)',   label: 'DISENGAGED' },
  tense:      { color: '#F87171', bg: 'rgba(248,113,113,0.13)',  label: 'TENSE' },
  neutral:    { color: '#9CA3AF', bg: 'rgba(156,163,175,0.13)',  label: 'NEUTRAL' },
}

const DISMISS_AFTER_MS = 12_000

export default function App() {
  const [nudge, setNudge] = useState<NudgePayload | null>(null)
  const [isExpanded, setIsExpanded] = useState(false)
  const [isPinned, setIsPinned] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isQuiet, setIsQuiet] = useState(false)
  const [visible, setVisible] = useState(false)

  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearDismiss = useCallback(() => {
    if (dismissTimer.current) {
      clearTimeout(dismissTimer.current)
      dismissTimer.current = null
    }
  }, [])

  const dismiss = useCallback(() => {
    clearDismiss()
    setVisible(false)
    setTimeout(() => {
      setNudge(null)
      setIsExpanded(false)
      setIsPinned(false)
    }, 300)
  }, [clearDismiss])

  const startDismissTimer = useCallback(() => {
    clearDismiss()
    dismissTimer.current = setTimeout(dismiss, DISMISS_AFTER_MS)
  }, [clearDismiss, dismiss])

  // ── IPC listeners ───────────────────────────────────────────────────────────
  useEffect(() => {
    const handleNudge = (_: unknown, payload: NudgePayload) => {
      clearDismiss()
      setNudge(payload)
      setIsExpanded(false)
      setIsPinned(false)
      setVisible(true)
      startDismissTimer()
    }

    const handleAnalyzing = (_: unknown, value: boolean) => setIsAnalyzing(value)
    const handleQuiet = (_: unknown, value: boolean) => setIsQuiet(value)

    window.ipcRenderer.on('echo:nudge', handleNudge)
    window.ipcRenderer.on('echo:analyzing', handleAnalyzing)
    window.ipcRenderer.on('echo:quiet', handleQuiet)

    return () => {
      window.ipcRenderer.off('echo:nudge', handleNudge)
      window.ipcRenderer.off('echo:analyzing', handleAnalyzing)
      window.ipcRenderer.off('echo:quiet', handleQuiet)
    }
  }, [clearDismiss, startDismissTimer])

  // ── Resize overlay window when expanded/collapsed ───────────────────────────
  useEffect(() => {
    if (nudge) {
      window.ipcRenderer.send('echo:resize', isExpanded ? 220 : 160)
    }
  }, [isExpanded, nudge])

  const handlePin = () => {
    setIsPinned(p => {
      if (!p) clearDismiss()
      else startDismissTimer()
      return !p
    })
  }

  const handleExpand = () => setIsExpanded(e => !e)

  const handleQuietToggle = () => window.ipcRenderer.send('echo:toggle-quiet')

  const tone = nudge ? TONE[nudge.tone] : null

  return (
    <div className="app-root">
      {/* ── Quiet mode pill ─────────────────────────────────────────────── */}
      {isQuiet && (
        <button className="quiet-pill" onClick={handleQuietToggle} title="Resume analysis">
          <span className="quiet-dot" />
          PAUSED · Click to resume
        </button>
      )}

      {/* ── Analyzing spinner ────────────────────────────────────────────── */}
      {isAnalyzing && !isQuiet && !nudge && (
        <div className="analyzing-pill">
          <span className="spinner" />
          Analyzing…
        </div>
      )}

      {/* ── Nudge card ───────────────────────────────────────────────────── */}
      {nudge && tone && (
        <div
          className={`nudge-card ${visible ? 'nudge-enter' : 'nudge-exit'}`}
          style={{ borderLeftColor: tone.color, background: `linear-gradient(135deg, rgba(15,15,20,0.92) 0%, ${tone.bg} 100%)` }}
        >
          {/* Header row */}
          <div className="nudge-header">
            <span className="tone-badge" style={{ color: tone.color }}>
              <span className="tone-dot" style={{ background: tone.color }} />
              {tone.label}
            </span>
            <span className="nudge-actions">
              {isAnalyzing && <span className="spinner-sm" />}
              <button
                className={`icon-btn ${isPinned ? 'icon-btn--active' : ''}`}
                onClick={handlePin}
                title={isPinned ? 'Unpin' : 'Pin'}
              >
                {isPinned ? '📌' : '📍'}
              </button>
              <button className="icon-btn" onClick={dismiss} title="Dismiss">
                ✕
              </button>
            </span>
          </div>

          {/* Nudge text */}
          <p className="nudge-text">{nudge.nudge}</p>

          {/* Expanded reasoning */}
          {isExpanded && (
            <p className="nudge-reasoning">{nudge.reasoning}</p>
          )}

          {/* Footer row */}
          <div className="nudge-footer">
            <button className="expand-btn" onClick={handleExpand}>
              {isExpanded ? '▲ less' : '▼ why'}
            </button>
            <span className="confidence-bar" title={`Confidence: ${Math.round(nudge.confidence * 100)}%`}>
              <span
                className="confidence-fill"
                style={{ width: `${nudge.confidence * 100}%`, background: tone.color }}
              />
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
