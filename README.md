# EchoConnect

A privacy-first desktop overlay that gives neurodivergent individuals real-time social cue interpretation during video calls — powered by Claude's multimodal reasoning.

## Setup

1. Clone the repo
2. `cd echoconnect`
3. `npm install`
4. Create a `.env` file inside the `echoconnect` folder: ANTHROPIC_API_KEY=your_key_here
5. `npm run dev`

## Features
- Real-time social cue detection during video calls
- Color-coded nudges (curious, warm, disengaged, tense, neutral)
- Privacy-first: screenshots never stored to disk
- Quiet mode toggle (Cmd+Shift+E)

## Built With
- Electron + React + TypeScript
- Claude Vision API (Anthropic)
- Vite + Tailwind CSS
