# Hyperframes Composition Brief: Smart Grocery List

## Objective
Create a short launch-style brag video for Smart Grocery List — a PWA that learns your grocery store layout over time.

## Output
- Composition directory: `brag-output-2026-07-23-133258/composition/`
- Rendered video: `brag-output-2026-07-23-133258/brag.mp4`
- Format: landscape — 1920x1080
- Duration: 20 seconds

## Source Material
- Project root: `smart-grocery-route-main`
- Primary files read: `index.html` (SPA shell, Space Grotesk font), `DESIGN.md` (design system, green accent palette), `PRD.md` (all features), `PRODUCT.md` (positioning)
- Product name: Smart Grocery List
- Tagline: "The only grocery list that learns your exact in-store route trip after trip."
- Key UI or visual moment: The organized list with section headers (Produce, Dairy & Eggs, Meat & Deli, Pantry) arranged by learned store layout
- Copy that must appear verbatim: none — inspired by the product's positioning

## Creative Direction
- Tone preset: polished
- Creative direction: Quiet premium product film — intelligence speaks for itself
- Interpretation: Longer holds, generous whitespace, clean reveals. Confidence through restraint.
- Angle: The only grocery list that gets smarter every trip. No setup, no configuration — just shop normally and the app invisibly learns your store's layout.
- Hook: "Your grocery store has a layout. Your list should too."
- Outro: "Smart Grocery List — The route knows itself."
- Avoid: Generic SaaS language, abstract filler visuals, gamified shopping aesthetics, enterprise dashboard language

## Visual Identity
- Background: #f5f9f5 (Cool Mint Field)
- Text: #1a2b20 (Route Ink)
- Accent: #3a9a5c (Fresh Produce Green)
- Secondary accent: #d48a2c (Citrus Signal orange)
- Display font: Space Grotesk
- Body font: Space Grotesk
- Visual references: Green checkboxes, white cards with rounded corners and soft borders, section headers

## Storyboard
Use the storyboard in `brag-output-2026-07-23-133258/brag-plan.md` as the creative contract.

Scene summary:
1. Hook — 3s — "Your grocery store has a layout." / "Your list should too."
2. Smart List — 5s — Organized grocery list with sections and items
3. Input — 4s — Voice input and photo OCR cards
4. Learning — 5s — "Learns your route. Trip after trip." with confidence badges
5. Outro — 3s — "Smart Grocery List — The route knows itself."

## Audio
- Audio role: Warm, professional bed — supportive, not driving
- Audio arc: Gentle entrance, clean support through middle, fade out at the end
- Music: `happy-beats-business-moves-vol-12-by-ende-dot-app.mp3`
- Music treatment: Start at 0s, volume 0.32. Gentle fade-out in last 1.5s.
- Audio-reactive treatment: subtle; use music RMS for glow on primary text
- Audio-coupled moments: voice card typing, section card reveals, final logo
- SFX posture: sparse — 3-4 well-placed cues. `interface/drop_*` for item reveals, `interface/click_*` for transitions
- Exact SFX choice: Hyperframes to choose based on implemented animation

## Hyperframes Instructions
Load the composition-building Hyperframes domain skills. /brag is its own workflow; do not enter the hyperframes entry-point intent interview.
