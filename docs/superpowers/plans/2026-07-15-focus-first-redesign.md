# Focus-First Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce top-of-screen clutter and demote secondary list actions without removing any existing capability.

**Architecture:** Keep the existing React/Tailwind structure and adjust only the current control surfaces. Implement progressive disclosure with existing Radix-based primitives so the redesign stays consistent with the codebase.

**Tech Stack:** React 19, TypeScript, Tailwind CSS 4, Radix UI, Vitest, Testing Library.

## Global Constraints

- Preserve the existing design system direction in `DESIGN.md`.
- Keep the change focused on hierarchy and interaction, not on unrelated styling.
- Use existing UI primitives before adding new patterns.
- Add regression tests for any new interaction contract before production edits.

---

### Task 1: Lock the focus-first interaction contract with tests

**Files:**
- Create: `src/test/focus-first-ui.test.tsx`

**Interfaces:**
- Produces: regression coverage for header readiness summary, tools sheet disclosure, and item overflow actions.

- [ ] Write failing tests for the new focus-first behavior.
- [ ] Run the focused test file and confirm failure on current UI.

### Task 2: Simplify the header and composer hierarchy

**Files:**
- Modify: `src/components/AppHeader.tsx`
- Modify: `src/components/ItemInputBar.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: current add, voice, recipe, scan, bulk add, clear, and reorganize handlers.
- Produces: a single status summary and a consolidated tools surface.

- [ ] Replace the icon cluster with one readable status badge.
- [ ] Replace the current overflow menu and second action row with a single tools sheet.
- [ ] Keep all existing actions reachable from the new tools surface.

### Task 3: Demote secondary item actions

**Files:**
- Modify: `src/components/GroceryItemComponent.tsx`

**Interfaces:**
- Consumes: existing rename and delete handlers.
- Produces: overflow-triggered secondary actions.

- [ ] Move rename and delete into an item overflow menu.
- [ ] Keep check and quantity controls visually primary.

### Task 4: Verify the redesign slice

**Files:**
- Test: `src/test/focus-first-ui.test.tsx`

**Interfaces:**
- Consumes: the updated components.
- Produces: fresh verification evidence for the redesigned behavior.

- [ ] Run the focused regression test file until it passes.
- [ ] Run a narrow error check on the edited files.