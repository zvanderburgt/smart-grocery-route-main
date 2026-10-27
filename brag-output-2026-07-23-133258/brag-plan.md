# Brag Plan: Smart Grocery List

## What is this app?
A Progressive Web App that learns your grocery store layout over time — it tracks what you check off and in what order, then groups future lists to match your actual walking path through the store.

## The angle
The only grocery list that gets smarter every trip. No setup, no configuration — just shop normally and the app invisibly learns your store's layout. After 3-5 trips, your list is organized by your exact route: produce → dairy → meat → aisles, in the order you actually walk them.

## Hook (first 2-3 seconds)
Text fades in: "Your grocery store has a layout." Pause. "Your list should too."

## Key moments (the middle)
- The organized grocery list with section headers — items grouped by learned store sections (Produce, Dairy & Eggs, Meat & Deli, Pantry)
- Voice input UI — microphone active, "3 apples" appearing as text
- Camera OCR scanning a handwritten list, items being extracted
- "Learns your route" with a confidence badge

## Outro / punchline
"Smart Grocery List — The route knows itself."

## User flow worth showing
1. Add items via voice, camera scan, barcode, or recipe paste
2. List auto-organizes into store sections ordered by learned shopping path
3. Check off items while shopping; the app gets smarter each trip

## Tone
- Preset: polished
- Creative direction: Quiet premium product film — intelligence speaks for itself
- Interpretation: Longer holds, generous whitespace, clean reveals. Confidence through restraint, not through volume.

## Format: landscape — 1920x1080
## Duration: 20 seconds

## Visual identity (from the project)
- Background: `oklch(0.98 0.01 145)` — Cool Mint Field (light)
- Accent: `oklch(0.55 0.19 145)` — Fresh Produce Green
- Secondary accent: `oklch(0.65 0.21 35)` — Citrus Signal (warm orange)
- Text: `oklch(0.25 0.02 145)` — Route Ink (dark)
- Display font: Space Grotesk
- Body font: Space Grotesk

## Share copy (draft)
"Your grocery store has a layout. Now your list does too. Smart Grocery List learns your shopping route trip after trip — no setup, no configuration."

## Audio direction
- Role: Warm, professional bed — supportive, not driving
- Music: `happy-beats-business-moves-vol-12-by-ende-dot-app.mp3` (vol-12: steady and clean, best match for polished tone)
- Music treatment: Start at 0s, volume 0.32. Gentle fade-out in last 1.5s. Let the bed breathe, no dramatic swells.
- Music cue guidance: Track not bundled with a preset; cue metadata will be detected at composition time via `hyperframes beats` or the Python analysis script. Continue without beat/cue sync if unavailable — the bed is supportive, not structural.
- Audio-reactive treatment: subtle; use music RMS to make primary text glow gently and product card presence breathe. No waveform/equalizer visuals.
- SFX posture: sparse — 3-4 well-placed cues. `interface/drop_*` for item reveals, `interface/click_*` for input UI transitions, `impactBell_heavy_000` for the logo punch.
- Restraint rule: no aggressive hits, no chaotic accents. The audio should feel like a well-edited product launch video, not a game show.

## Storyboard

### Scene 1 — Hook — 3s
Large centered display type on mint background. First line: "Your grocery store has a layout." holds 1.5s. Second line fades in: "Your list should too."
Sequential/interaction: yes — first line appears, holds, second line fades in below
Audio intent: opening warmth — establishes something considered and premium is starting
Audio-coupled idea: text reveal with gentle music bed entrance
Music: gentle entrance from start, bed settles in
Transition mood: slow crossfade → Scene 2

### Scene 2 — The smart list — 5s
Recreate the app's main screen: an organized grocery list with section headers ("Produce", "Dairy & Eggs", "Meat & Deli", "Pantry") and items under each. Realistic items: "Bananas", "Avocados", "Milk", "Eggs", "Chicken breast", "Pasta". Subtle "Smart List" label in top-left.
Sequential/interaction: yes — section headers and items animate in one by one, fast reveal
Audio intent: clean, organized feeling — items arriving in succession
Audio-coupled idea: items appear in quick succession with light card sounds
Music: continues, clean and supportive
Transition mood: crossfade → Scene 3

### Scene 3 — Input flexibility — 4s
Show two input methods side by side or in quick alternation: a phone mockup with microphone active and "3 apples" appearing as text; a phone mockup with camera view scanning a handwritten list with items being extracted. Text overlay: "Type, speak, scan, or paste a recipe."
Sequential/interaction: yes — voice demo first (0-2s), then scan demo (2-4s)
Audio intent: quick, energetic — showing breadth of input options
Audio-coupled idea: light interface clicks and camera shutter sounds
Music: continues, slightly more energetic
Transition mood: quick crossfade → Scene 4

### Scene 4 — The learning payoff — 5s
Show the organized list from Scene 2 with a "Learn" badge and confidence indicator. Sections in logical store-walking order. Text: "Learns your route. Trip after trip." Sub-text: "No setup. Just shop."
Sequential/interaction: no — text appears and holds
Audio intent: satisfying payoff — the warm full-bed moment
Audio-coupled idea: text appearing with a soft accent sound
Music: full warm bed, peak moment
Transition mood: slow crossfade → Scene 5

### Scene 5 — Outro — 3s
App name centered on mint background. Brand green accent line or dot. Text: "Smart Grocery List". Sub-text (smaller, muted): "The route knows itself."
Sequential/interaction: no — clean logo reveal
Audio: music resolves, gentle final accent
Audio-coupled idea: logo hit with impactBell_heavy_000
Music: resolves and fades
Transition mood: fade to black

**Music mood for this video:** polished — steady and clean, warm professional bed
**Audio summary:** A warm, professional music bed from vol-12 runs underneath 20 seconds of clean, restrained motion; sparse SFX accent item reveals and the final logo hit.
