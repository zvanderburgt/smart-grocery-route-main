import { useCallback } from "react";
import { useLocalStorage } from "./use-local-storage";
import type { GroceryItem, StoreCategory, Section } from "@/lib/types";
import { STORE_CATEGORIES } from "@/lib/category-mapper";
import { toTitleCase } from "@/lib/utils";
import { GroceryLearningAlgorithm } from "@/lib/learning-algorithm";
import { toast } from "sonner";

interface UseSectionsReturn {
  sections: Section[];
  addSection: (name: string) => void;
  renameSection: (sectionId: string, newName: string) => void;
  reorderSections: (sectionIds: string[]) => void;
  collapseSection: (sectionId: string) => void;
  uncollapseSectionIfNeeded: (sectionId: string, sections: Section[]) => void;
  collapseSectionIfComplete: (
    sectionId: string,
    sectionItemIds: Set<string>,
    items: GroceryItem[],
  ) => void;
  getSectionsWithItems: (
    items: GroceryItem[],
    hints: Record<string, StoreCategory>,
  ) => Section[];
}

/**
 * Manages section/category organization: custom names, ordering, collapsed state,
 * and integration with learning algorithm for smart categorization.
 */
export function useSections(
  learningAlgorithm: GroceryLearningAlgorithm,
): UseSectionsReturn {
  const [customSectionNames, setCustomSectionNames] = useLocalStorage<
    Record<string, string>
  >("section-custom-names", {});
  const [sectionOrder, setSectionOrder] = useLocalStorage<string[]>(
    "section-order",
    [],
  );
  const [collapsedSections, setCollapsedSections] = useLocalStorage<
    Set<string>
  >("collapsed-sections", new Set());

  // Get safe defaults for all stored section state
  const safeSectionOrder = sectionOrder ?? [];
  const safeCustomNames = customSectionNames ?? {};
  const safeCollapsedSections = collapsedSections ?? new Set();

  // Get sections enriched with items (based on item categories)
  const getSectionsWithItems = useCallback(
    (items: GroceryItem[], hints: Record<string, StoreCategory>): Section[] => {
      const sectionMap = new Map<string, Section>();

      // Initialize all known sections
      const allSectionIds = Array.from(
        new Set([...safeSectionOrder, ...Object.keys(STORE_CATEGORIES)]),
      );

      allSectionIds.forEach((sectionId) => {
        sectionMap.set(sectionId, {
          id: sectionId,
          name:
            safeCustomNames[sectionId] ||
            STORE_CATEGORIES[sectionId as StoreCategory]?.name ||
            toTitleCase(sectionId),
          items: [],
          averagePosition: 0,
          confidence: 1,
          icon: STORE_CATEGORIES[sectionId as StoreCategory]?.icon,
          isLearned: false,
        });
      });

      // Assign items to sections (filter out tombstones)
      items.forEach((item) => {
        if (item.isTombstone) return; // Don't display deleted items
        const category = hints[item.name] || item.category || "other";
        const section = sectionMap.get(category);
        if (section) {
          section.items.push(item);
        }
      });

      // Sort sections by custom order
      return Array.from(sectionMap.values()).sort((a, b) => {
        const aIdx = safeSectionOrder.indexOf(a.id);
        const bIdx = safeSectionOrder.indexOf(b.id);
        if (aIdx === -1 && bIdx === -1) return 0;
        if (aIdx === -1) return 1;
        if (bIdx === -1) return -1;
        return aIdx - bIdx;
      });
    },
    [
      safeSectionOrder,
      safeCustomNames,
      safeCollapsedSections,
      learningAlgorithm,
    ],
  );

  // Add new section
  const addSection = useCallback(
    (name: string) => {
      if (!name.trim()) return;
      const sectionId = `section-${Date.now()}`;
      const titleCaseName = toTitleCase(name);

      setCustomSectionNames((current) => ({
        ...(current ?? {}),
        [sectionId]: titleCaseName,
      }));

      setSectionOrder((current) => [...(current ?? []), sectionId]);
      toast.success(`Section "${titleCaseName}" created`);
    },
    [setCustomSectionNames, setSectionOrder],
  );

  // Rename section
  const renameSection = useCallback(
    (sectionId: string, newName: string) => {
      if (!newName.trim()) return;
      const titleCaseName = toTitleCase(newName);

      setCustomSectionNames((current) => ({
        ...(current ?? {}),
        [sectionId]: titleCaseName,
      }));

      toast.success("Section renamed");
    },
    [setCustomSectionNames],
  );

  // Reorder sections
  const reorderSections = useCallback(
    (sectionIds: string[]) => {
      setSectionOrder(sectionIds);
    },
    [setSectionOrder],
  );

  // Collapse a section
  const collapseSection = useCallback(
    (sectionId: string) => {
      setCollapsedSections((current) => {
        const next = new Set(current ?? []);
        next.add(sectionId);
        return next;
      });
    },
    [setCollapsedSections],
  );

  // Uncollapse section if all items checked
  const uncollapseSectionIfNeeded = useCallback(
    (sectionId: string, sections: Section[]) => {
      const section = sections.find((s) => s.id === sectionId);
      if (
        section &&
        section.items.length > 0 &&
        section.items.some((item) => !item.checked)
      ) {
        setCollapsedSections((current) => {
          const next = new Set(current ?? []);
          next.delete(sectionId);
          return next;
        });
      }
    },
    [setCollapsedSections],
  );

  // Collapse section if all items checked
  const collapseSectionIfComplete = useCallback(
    (sectionId: string, sectionItemIds: Set<string>, items: GroceryItem[]) => {
      const allItemsInSectionChecked = Array.from(sectionItemIds).every(
        (id) => items.find((item) => item.id === id)?.checked,
      );

      if (allItemsInSectionChecked) {
        collapseSection(sectionId);
      }
    },
    [collapseSection],
  );

  return {
    sections: getSectionsWithItems([], {}),
    addSection,
    renameSection,
    reorderSections,
    collapseSection,
    uncollapseSectionIfNeeded,
    collapseSectionIfComplete,
    getSectionsWithItems,
  };
}
