---
name: Breadcrumb
description: Adaptive grocery planning UI that learns in-store routes with calm, dependable guidance.
colors:
  primary-green: "oklch(0.55 0.19 145)"
  primary-green-dark: "oklch(0.60 0.19 145)"
  accent-citrus: "oklch(0.65 0.21 35)"
  accent-citrus-dark: "oklch(0.70 0.21 35)"
  neutral-surface: "oklch(0.98 0.01 145)"
  neutral-surface-dark: "oklch(0.15 0.01 145)"
  neutral-surface-elevated: "oklch(0.96 0.01 145)"
  neutral-surface-elevated-dark: "oklch(0.18 0.01 145)"
  neutral-ink: "oklch(0.25 0.02 145)"
  neutral-ink-dark: "oklch(0.95 0.005 145)"
  neutral-muted: "oklch(0.5 0.01 145)"
  border-soft: "oklch(0.88 0.01 145)"
  border-soft-dark: "oklch(0.28 0.01 145)"
  ring-primary: "oklch(0.55 0.19 145)"
  danger: "oklch(0.55 0.22 25)"
typography:
  display:
    fontFamily: "Space Grotesk, system-ui, -apple-system, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Space Grotesk, system-ui, -apple-system, sans-serif"
    fontSize: "1rem"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.005em"
  title:
    fontFamily: "Space Grotesk, system-ui, -apple-system, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "0.06em"
  body:
    fontFamily: "Space Grotesk, system-ui, -apple-system, sans-serif"
    fontSize: "1rem"
    fontWeight: 500
    lineHeight: 1.45
    letterSpacing: "0.005em"
  label:
    fontFamily: "Space Grotesk, system-ui, -apple-system, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "0.04em"
rounded:
  sm: "0.375rem"
  md: "0.625rem"
  lg: "0.75rem"
  xl: "1rem"
  full: "9999px"
spacing:
  xs: "0.25rem"
  sm: "0.5rem"
  md: "0.75rem"
  lg: "1rem"
  xl: "1.5rem"
  xxl: "2rem"
components:
  button-primary:
    backgroundColor: "{colors.primary-green}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "0.5rem 1rem"
    height: "2.25rem"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.neutral-ink}"
    rounded: "{rounded.md}"
    padding: "0.5rem 0.75rem"
    height: "2.25rem"
  button-destructive:
    backgroundColor: "{colors.danger}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "0.5rem 1rem"
    height: "2.25rem"
  input-default:
    backgroundColor: "transparent"
    textColor: "{colors.neutral-ink}"
    rounded: "{rounded.md}"
    padding: "0.25rem 0.75rem"
    height: "2.25rem"
  card-default:
    backgroundColor: "{colors.neutral-surface-elevated}"
    textColor: "{colors.neutral-ink}"
    rounded: "{rounded.lg}"
    padding: "0.75rem"
  badge-smart:
    backgroundColor: "{colors.primary-green}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "0.125rem 0.5rem"
---

# Design System: Breadcrumb

## 1. Overview

**Creative North Star: "The Aisle Intelligence Companion"**

This interface is designed as a calm operational layer for real grocery trips, not as entertainment and not as analytics theater. The system prioritizes immediate readability, one-handed interaction, and confidence cues that make machine learning feel useful instead of mysterious.

Visual density stays practical: clear top-level hierarchy, compact but touch-safe controls, and fast state feedback for list progression. Intelligence appears as gentle reinforcement (confidence badges, smart suggestions, route-aware grouping) while the main task of adding and checking off items always stays dominant.

The system explicitly rejects PRODUCT.md anti-references by design: playful gamified shopping app language, ad-heavy coupon-app aesthetics, and enterprise dashboard visual language are prohibited.

**Key Characteristics:**
- High legibility in varied store lighting and distracted use contexts.
- Restrained color strategy with one primary action hue and one signal accent.
- State-driven motion and micro-feedback, never decorative choreography.
- Familiar control vocabulary (input, button, card, badge, dialog) with consistent shape and focus treatment.
- Mobile-first spacing and sticky interaction zones for in-motion use.

## 2. Colors

The palette is produce-forward and operational: cool mint-toned neutrals for surfaces, green for primary progression, and citrus orange for attention moments.

### Primary
- **Fresh Produce Green** (oklch(0.55 0.19 145)): Primary action fill, progress emphasis, and selected positive states.
- **Fresh Produce Green (Dark Theme)** (oklch(0.60 0.19 145)): Brightened dark-surface equivalent to keep primary actions readable without neon drift.

### Secondary
- **Citrus Signal** (oklch(0.65 0.21 35)): Secondary emphasis used for suggestion highlights and controlled attention within productive flows.

### Tertiary
- **Citrus Signal (Dark Theme)** (oklch(0.70 0.21 35)): High-clarity accent on dark surfaces.

### Neutral
- **Cool Mint Field** (oklch(0.98 0.01 145)): Default page background.
- **Cool Mint Field (Dark Theme)** (oklch(0.15 0.01 145)): Default dark background.
- **Cool Mint Card** (oklch(0.96 0.01 145)): Container and card surfaces.
- **Cool Mint Card (Dark Theme)** (oklch(0.18 0.01 145)): Elevated dark-surface containers.
- **Route Ink** (oklch(0.25 0.02 145)): Primary text and icon color.
- **Route Ink (Dark Theme)** (oklch(0.95 0.005 145)): Primary dark-mode text and icon color.
- **Quiet Label** (oklch(0.5 0.01 145)): Supporting metadata and secondary labels.
- **Soft Divider** (oklch(0.88 0.01 145)): Borders and subtle structure.
- **Soft Divider (Dark Theme)** (oklch(0.28 0.01 145)): Dark-mode borders and field strokes.

**The Signal Scarcity Rule.** Primary and accent colors are reserved for action, state, and guidance. Decorative flooding is prohibited.

**The State Color Rule.** Error/destructive states use danger only. Warning and info states must not borrow primary progression green.

## 3. Typography

**Display Font:** Space Grotesk (with system sans fallbacks)
**Body Font:** Space Grotesk (with system sans fallbacks)
**Label/Mono Font:** Space Grotesk for labels; system monospace only where tabular diagnostics demand it.

**Character:** Geometric, readable, and efficient. The type system is tuned for quick scanning under time pressure, with compact hierarchy steps and clear weight contrast.

### Hierarchy
- **Display** (700, 1.5rem, 1.2): App title and highest-priority screen heading.
- **Headline** (700, 1rem, 1.25): Section-level labels where quick recognition matters.
- **Title** (600, 0.875rem, 1.3): Group headers, compact controls, and sortable labels.
- **Body** (500, 1rem, 1.45): Grocery items and primary readable content.
- **Label** (600, 0.75rem, letter spacing 0.04em): Status chips and compact metadata.

**The Scan-First Rule.** Body and action text must remain legible at glance distance on mobile; ornamental display behavior is forbidden.

## 4. Elevation

Depth is flat-by-default with state-only lift. The system communicates structure primarily through color separation and borders, then adds selective shadow and blur for overlays and sticky context.

### Shadow Vocabulary
- **Ambient Card Lift** (box-shadow: shadow-sm / shadow-xs): Lightweight separation on cards and controls.
- **Overlay Lift** (box-shadow: shadow-lg): Modal/dialog content only.
- **Sticky Atmosphere** (backdrop blur: backdrop-blur-sm): Header persistence cue without heavy layering.

**The Flat-by-Default Rule.** Surfaces stay flat at rest. Lift is reserved for interaction state or modal context.

## 5. Components

Components are tactile, dependable, and quick to parse. Shape language is rounded but controlled, with consistent focus ring treatment and predictable state transitions.

### Buttons
- **Shape:** Rounded medium corners (0.625rem default; compact variants 0.375rem).
- **Primary:** Fresh Produce Green fill with white label text, compact horizontal padding, and hover darkening.
- **Hover / Focus:** 10% darken on hover; 3px ring-based focus with semantic ring color.
- **Destructive:** Danger fill with white label text for remove/clear/irreversible actions only.
- **Secondary / Ghost / Outline:** Secondary uses muted surface fill; ghost is transparent with accent-hover background; outline preserves border-first affordance.

### Chips
- **Style:** Compact rounded badges with high contrast labels and optional icon prefix.
- **State:** Smart/learned indicators use accent-tinted containers with explicit text contrast.

### Cards / Containers
- **Corner Style:** Large rounded (0.75rem to 1rem).
- **Background:** Neutral elevated surfaces with subtle alpha overlays for grouped intelligence states.
- **Shadow Strategy:** Small shadow at rest; no deep shadows on standard cards.
- **Border:** Soft neutral borders (single-pixel equivalents).
- **Internal Padding:** Tight, mobile-friendly rhythm (0.75rem base).

### Inputs / Fields
- **Style:** Transparent or low-contrast filled background with clear border and medium radius.
- **Focus:** Ring + border shift as the primary affordance; never color-only focus.
- **Error / Disabled:** Destructive border/ring for error; reduced opacity plus pointer lock for disabled.

### Dialog / Overlay
- **Style:** Dimmed backdrop with centered elevated panel and compact header/content spacing.
- **Motion:** Fast fade + scale transitions (200ms class of duration), never cinematic transitions.
- **Dismissal:** Explicit close action remains visible in the top-right corner.

### Navigation
- **Style:** Sticky top header with compact icon-button controls and status indicators.
- **States:** Active progress and availability are expressed with icon color and concise labels, not dashboard-like metric blocks.
- **Mobile treatment:** Sticky input and compact menu affordances preserve one-handed operation.

### Signature Component
- **Smart Suggestions Row:** Gradient-tinted suggestion container with confidence badge and immediate one-tap add action; designed as assistive nudge, not intrusive takeover.

**The Complete State Matrix Rule.** Buttons, inputs, badges, cards, and overlays must always define default, hover, focus-visible, active, disabled, and error behavior before shipping.

## 6. Do's and Don'ts

### Do:
- **Do** keep action color assignment strict: green for primary progression, citrus for signal-level emphasis.
- **Do** preserve the compact control rhythm (2.25rem to 3.5rem control heights) for one-handed scanning and tapping.
- **Do** use explicit interaction states across every control: default, hover, focus, active, disabled, and error.
- **Do** surface route-learning intelligence as supportive context, never as the main visual payload.
- **Do** maintain strong text contrast on tinted surfaces and status badges.
- **Do** keep destructive actions visually distinct from progression actions at every breakpoint.

### Don't:
- **Don't** introduce a playful gamified shopping app tone in visuals, copy cadence, or motion behavior.
- **Don't** adopt ad-heavy coupon-app aesthetics (attention-fragmenting banners, aggressive promotional color bursts, noisy CTA stacks).
- **Don't** drift into enterprise dashboard visual language (dense metric tiles, analytic-heavy framing, command-center styling).
- **Don't** use decorative motion that does not communicate state or workflow progression.
- **Don't** apply heavy color or full-saturation accents to inactive states.
- **Don't** use primary progression green for warning, destructive, or neutral inactive states.
