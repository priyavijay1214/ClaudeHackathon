import Anthropic from '@anthropic-ai/sdk'
import type { NudgePayload } from '../src/shared/types.js'

const SYSTEM_PROMPT = `You are EchoConnect, a social cue interpreter for people with autism,
ADHD, or social anxiety. You analyze video call screenshots to detect
conversational tone and provide calm, actionable guidance.

TASK: Examine the facial expressions, body language, and context visible
in this screenshot. Output a single JSON object — nothing else.

OUTPUT FORMAT (strict JSON, no markdown):
{
  "tone": "curious" | "warm" | "disengaged" | "tense" | "neutral",
  "nudge": "<max 12 words — one specific actionable suggestion>",
  "reasoning": "<1–2 sentences explaining what you saw and why>",
  "confidence": <0.0–1.0 float>
}

TONE DEFINITIONS:
- curious: leaning forward, raised eyebrows, frequent nodding, eye focus
- warm: smiling, relaxed posture, mirroring body language
- disengaged: looking away, checking phone, flat expression, slouching
- tense: tight jaw, crossed arms, furrowed brow, clipped responses
- neutral: no strong signal in either direction

NUDGE GUIDELINES:
- Be literal and specific. Not "be more engaging" → "Ask a follow-up question now"
- Never say "they seem..." — say what to DO
- Keep under 12 words. This is a glance-able overlay.
- Avoid alarm. Even "tense" should suggest calm action.
- If confidence < 0.6 or the image is unclear, return confidence: 0.4

EXAMPLES:
{"tone":"curious","nudge":"Share a specific example from your last project","reasoning":"Participant is leaning forward with raised eyebrows indicating active interest.","confidence":0.82}
{"tone":"disengaged","nudge":"Pause and ask if they have questions","reasoning":"Person appears to be looking away with a flat expression, suggesting attention drift.","confidence":0.71}
{"tone":"tense","nudge":"Slow down — let them finish speaking first","reasoning":"Participant shows a furrowed brow and tight posture suggesting tension.","confidence":0.76}`

// Simple token bucket: max 1 req per 3s, never queue
let client: Anthropic | null = null
let lastCall = 0
const MIN_GAP_MS = 3000

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }
  return client
}

export async function analyzeFrame(base64Image: string): Promise<NudgePayload | null> {
  const now = Date.now()
  if (now - lastCall < MIN_GAP_MS) return null
  lastCall = now

  try {
    const resp = await getClient().messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 256,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: 'image/png', data: base64Image },
            },
            {
              type: 'text',
              text: 'Analyze this video call frame and return a JSON nudge.',
            },
          ],
        },
      ],
    })

    const text = resp.content[0].type === 'text' ? resp.content[0].text : ''
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return null

    const parsed = JSON.parse(match[0])
    return {
      tone: parsed.tone,
      nudge: parsed.nudge,
      reasoning: parsed.reasoning,
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0,
      timestamp: Date.now(),
    }
  } catch (err) {
    console.error('[EchoConnect] Claude analysis error:', err)
    return null
  }
}
