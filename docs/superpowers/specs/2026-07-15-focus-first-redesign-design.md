# Focus-First Redesign

## Goal

Reduce cognitive load in the first screen of the shopping flow without removing core capabilities.

## Scope

This pass focuses on the top of the app and the highest-frequency list interactions:

- Replace the status icon cluster with one readable readiness summary.
- Remove the always-visible second action row under the composer.
- Move secondary tools and list actions into a single utilities sheet.
- Move per-item rename and delete actions into overflow, keeping check and quantity controls primary.

## UX Direction

The first screen should read in this order:

1. App identity and current readiness.
2. The one thing the user should do next: add or speak an item.
3. The shopping list itself.

Everything else remains available, but not visually co-equal.

## Interaction Rules

- Header status must be expressed as a short label, not a row of unlabeled indicators.
- Scan, recipe, bulk add, and destructive list actions belong in a utilities surface.
- Rename and delete are secondary item actions and should not appear until requested.
- Progress stays visible, but compact.

## Copy

- Ready state: "Ready in store"
- Setup state: "Preparing tools"
- Offline state: "Offline mode"
- Utilities trigger: "Open tools"
- Item overflow trigger: "Item actions"

## Non-Goals

- No algorithm or list organization changes.
- No full visual rebrand.
- No new navigation model.