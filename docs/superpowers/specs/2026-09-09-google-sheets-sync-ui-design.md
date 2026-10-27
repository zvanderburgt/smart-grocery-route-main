# Google Sheets Sync UI Design

Date: 2026-09-09
Status: Draft approved in chat

## Goal
Make Google Sheets sync feel like a first-class part of the app instead of a diagnostics side feature, while keeping it inside Settings. Remove the busy spinning header animation and replace it with calmer, clearer status feedback.

## Current Problems

### 1. Split mental model
Sync status lives in the app header, but all meaningful controls live deeper inside the Settings/Diagnostics sheet. This makes sync feel separate from the rest of the product and forces users to reconcile two disconnected surfaces.

### 2. Wrong container tone
The current settings surface is framed as diagnostics and utilities. Google Sheets sync is a core collaboration feature, so placing it low in that panel weakens its importance.

### 3. Overactive motion
The spinning sync icon in the header pulls too much attention for a background state. It conflicts with the product’s calm, dependable tone.

### 4. Secondary content dominates
Setup instructions are long and visually heavy relative to the primary actions: status, account, connect/disconnect, sheet ID, and sync now.

## Decision
Keep Google Sheets sync inside Settings, but promote it to the first major section and make the header sync badge act as a quiet entry point into that section.

## Proposed UX

### Header
- Keep a compact sync badge in `src/components/AppHeader.tsx`.
- Remove spinning icon motion for `syncing` and `connecting` states.
- Use text + color + icon changes only.
- Keep statuses concise:
  - `Synced`
  - `Syncing…`
  - `Error`
  - `Offline`
- Keep the badge visually secondary to the main grocery workflow.
- Clicking/tapping the sync badge should open Settings and bring the user directly to the Google Sheets section.

### Settings sheet
- Keep Google Sheets inside `src/components/DiagnosticsPanel.tsx`, but move it above OCR settings and diagnostics content.
- Reframe it as a primary settings section rather than a deep utility subsection.
- The Google Sheets block should appear near the top, directly after quick actions or at the very top if that reads cleaner during implementation.
- The section should feel like one coherent card with:
  - current status
  - connected account
  - sheet ID input
  - primary action button(s)
  - lightweight setup help

### Google Sheets settings content
Within `src/components/GoogleSheetsSettings.tsx`:
- Keep the existing capabilities; do not add new sync features.
- Reduce visual fragmentation where possible.
- Preserve these core actions:
  - connect
  - disconnect
  - sync now
  - save sheet ID
- Keep setup instructions collapsed by default and visually secondary.
- Keep error and conflict states explicit.
- Keep last sync and pending writes visible, but not louder than the primary action area.

## Information hierarchy
Priority order should be:
1. Sync status
2. Connect/disconnect state
3. Sheet ID / destination
4. Sync now action
5. Last sync / pending writes
6. Setup help
7. Diagnostics-level detail

This hierarchy should apply across both the header and settings sheet.

## Interaction details

### Header badge behavior
- Tapping the sync badge opens the existing settings sheet.
- The sheet should land with the Google Sheets section visible without requiring manual scrolling.
- No separate sync modal or new route is needed.

### Motion
- Remove `animate-spin` from the header sync state.
- Keep any motion minimal and purposeful.
- If feedback is needed during sync, prefer static icon swap, label change, or subtle badge tone shift over continuous animation.

### Toast behavior
- Keep success/error toasts for actions already present.
- Avoid extra celebratory or repetitive sync messaging.

## Component changes

### `src/components/AppHeader.tsx`
- Make the sync badge clickable.
- Add a dedicated callback for opening Settings to the sync section, or reuse the existing settings callback with a small targeting flag.
- Replace spinning sync visuals with calm static status visuals.

### `src/components/DiagnosticsPanel.tsx`
- Move the Google Sheets section higher in the sheet.
- Support opening with focus/scroll intent for the sync section.
- Keep the rest of settings intact unless a tiny cleanup falls out naturally.

### `src/components/GoogleSheetsSettings.tsx`
- Tighten the layout so it reads as one integrated control group.
- Keep the setup guide collapsed.
- Preserve current error, conflict, and disconnect-confirmation behaviors.

### `src/App.tsx`
- Add the smallest state needed to tell Settings when it should open to sync.
- Avoid introducing a new navigation pattern.

## Error handling
- If sync is disconnected, the UI should clearly show that state without looking broken.
- If syncing fails, keep the current explicit error messaging.
- If the header shortcut cannot scroll/focus for any reason, it should still open Settings reliably.

## Accessibility
- The clickable sync badge must be keyboard accessible and have an explicit label.
- Status text must not rely on color alone.
- Reduced-motion users should not lose any information.
- The settings sheet should preserve logical reading order after reordering sections.

## Testing
Add or update a small UI test covering:
- header sync badge opens settings
- Google Sheets section is present near the top / targeted state is applied
- syncing status no longer uses spinning animation in the header

Manual check:
- disconnected
- connecting
- syncing
- synced
- error
- conflict

## Out of scope
- No new sync architecture
- No auto-sync behavior changes
- No new sync tab or separate sync screen
- No redesign of unrelated settings sections
- No new onboarding flow beyond keeping the current setup instructions available

## Implementation notes
- Reuse existing components and status logic where possible.
- Prefer moving and simplifying over inventing new UI wrappers.
- Smallest acceptable diff: promote the existing section, make header badge actionable, remove spin.
