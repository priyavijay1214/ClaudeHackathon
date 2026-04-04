export type ToneCategory =
  | 'curious'      // blue  — they want more detail
  | 'warm'         // green — rapport building, lean in
  | 'disengaged'   // amber — attention drifting, be concise
  | 'tense'        // red   — conflict, slow down, listen
  | 'neutral'      // gray  — baseline, no action needed

export interface NudgePayload {
  tone: ToneCategory
  nudge: string        // max 12 words — actionable hint
  reasoning: string    // 1–2 sentences for expanded view
  confidence: number   // 0–1 — hide nudge if < 0.6
  timestamp: number
}
