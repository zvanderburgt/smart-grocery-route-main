// A section auto-collapses once every item in it is checked off, and that
// collapsed flag is persisted per section id. The flag outlives the items: after
// the list is cleared and a new item lands in the same section, the section
// would stay shut and the new item would look like it never got added.
//
// These helpers decide when an appearing item should re-open its section. They
// are pure so the behaviour can be tested without mounting the app.

import type { Section } from './types';

/**
 * Sections containing at least one item id that was not on screen before.
 * Items that merely change checked state or get removed are not "new".
 */
export function findSectionsWithNewItems(
  sections: Section[],
  previouslySeenItemIds: ReadonlySet<string>
): Section[] {
  return sections.filter((section) =>
    section.items.some((item) => !previouslySeenItemIds.has(item.id))
  );
}

/**
 * Clears the collapsed flag for the given sections. Returns null when none of
 * them were collapsed, so callers can skip a pointless state write.
 */
export function expandSections(
  collapsedSections: Record<string, boolean> | null | undefined,
  sectionIds: string[]
): Record<string, boolean> | null {
  const current = collapsedSections ?? {};
  const next = { ...current };
  let changed = false;

  for (const sectionId of sectionIds) {
    if (next[sectionId]) {
      next[sectionId] = false;
      changed = true;
    }
  }

  return changed ? next : null;
}
