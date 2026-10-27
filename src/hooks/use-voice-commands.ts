import { useCallback } from "react";

export type VoiceCommand =
  | { type: "add_item"; text: string }
  | { type: "check_item"; itemName: string }
  | { type: "uncheck_item"; itemName: string }
  | { type: "increase_quantity"; itemName: string; amount: number }
  | { type: "decrease_quantity"; itemName: string; amount: number }
  | { type: "set_quantity"; itemName: string; amount: number }
  | { type: "clear_completed" }
  | { type: "clear_all" }
  | { type: "show_section"; section: string }
  | { type: "show_all" }
  | { type: "reorganize" }
  | { type: "show_stats" }
  | { type: "show_favorites" }
  | { type: "unknown"; text: string };

interface VoiceCommandsOptions {
  onCommand: (command: VoiceCommand) => void;
}

const COMMON_GROCERY_WORDS = new Set([
  "eggs",
  "egg",
  "milk",
  "sugar",
  "bread",
  "bacon",
  "cheese",
  "butter",
  "yogurt",
  "chicken",
  "beef",
  "pork",
  "rice",
  "pasta",
  "flour",
  "salt",
  "pepper",
  "oil",
  "onion",
  "onions",
  "garlic",
  "tomato",
  "tomatoes",
  "potato",
  "potatoes",
  "apple",
  "apples",
  "banana",
  "bananas",
  "orange",
  "oranges",
  "carrot",
  "carrots",
  "lettuce",
  "cereal",
  "coffee",
  "tea",
  "juice",
  "water",
  "beans",
  "corn",
  "spinach",
  "broccoli",
  "mushrooms",
]);

const DESCRIPTOR_WORDS = new Set([
  "fresh",
  "organic",
  "frozen",
  "lean",
  "whole",
  "ground",
  "green",
  "red",
  "yellow",
  "large",
  "small",
  "diced",
  "sliced",
  "chopped",
  "boneless",
  "skinless",
]);

const PHRASE_STOP_WORDS = new Set([
  "of",
  "with",
  "without",
  "for",
  "from",
  "into",
  "onto",
]);

const QUANTITY_WORDS = new Set([
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
]);

const UNIT_WORDS = new Set([
  "pack",
  "packs",
  "box",
  "boxes",
  "bag",
  "bags",
  "bottle",
  "bottles",
  "carton",
  "cartons",
  "can",
  "cans",
  "lb",
  "lbs",
  "oz",
]);

const PROTECTED_AND_PHRASES = new Set(["mac and cheese", "salt and pepper"]);

export function useVoiceCommands({ onCommand }: VoiceCommandsOptions) {
  const tokenize = useCallback((text: string): string[] => {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(Boolean);
  }, []);

  const isKnownCommandText = useCallback((text: string): boolean => {
    const lowerText = text.toLowerCase();
    return (
      lowerText.includes("clear") ||
      lowerText.includes("check") ||
      lowerText.includes("uncheck") ||
      lowerText.includes("mark") ||
      lowerText.includes("show") ||
      lowerText.includes("view") ||
      lowerText.includes("increase") ||
      lowerText.includes("decrease") ||
      lowerText.includes("reduce") ||
      lowerText.includes("remove") ||
      lowerText.includes("set") ||
      lowerText.includes("change") ||
      lowerText.includes("reorganize") ||
      lowerText.includes("stats") ||
      lowerText.includes("favorites")
    );
  }, []);

  const normalizeAddItemText = useCallback((text: string): string => {
    return text
      .trim()
      .replace(/^please\s+/i, "")
      .replace(
        /^(?:(?:i|we)\s+)?(?:need|want|would\s+like|add|get|grab|buy|pick\s+up|put|include|insert)(?:\s+(?:item|items))?(?:\s+(?:to|on|in)(?:\s+(?:my|the))?\s+list)?\s+/i,
        "",
      )
      .replace(/\s+please$/i, "")
      .trim();
  }, []);

  const splitBySpokenDelimiters = useCallback((text: string): string[] => {
    const trimmed = text.trim();
    if (!trimmed) return [];

    if (PROTECTED_AND_PHRASES.has(trimmed.toLowerCase())) {
      return [trimmed];
    }

    const normalized = trimmed
      .replace(/\s*&\s*/gi, ",")
      .replace(/\s+(?:and|plus|also)\s+/gi, ",");

    if (!normalized.includes(",")) {
      return [trimmed];
    }

    return normalized
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
  }, []);

  const isQuantityToken = useCallback((token: string): boolean => {
    return /^\d+$/.test(token) || QUANTITY_WORDS.has(token);
  }, []);

  const buildNoDelimiterItems = useCallback(
    (tokens: string[]): string[] => {
      const items: string[] = [];
      let i = 0;

      while (i < tokens.length) {
        const token = tokens[i];
        if (!token) {
          i += 1;
          continue;
        }

        if (isQuantityToken(token) && i + 1 < tokens.length) {
          if (UNIT_WORDS.has(tokens[i + 1]) && i + 2 < tokens.length) {
            items.push(`${token} ${tokens[i + 1]} ${tokens[i + 2]}`);
            i += 3;
            continue;
          }

          items.push(`${token} ${tokens[i + 1]}`);
          i += 2;
          continue;
        }

        // Check if current token is a descriptor followed by another word
        // Combine them into a single item (e.g., "frozen pizza", "organic milk")
        if (
          DESCRIPTOR_WORDS.has(token) &&
          i + 1 < tokens.length &&
          !DESCRIPTOR_WORDS.has(tokens[i + 1])
        ) {
          items.push(`${token} ${tokens[i + 1]}`);
          i += 2;
          continue;
        }

        items.push(token);
        i += 1;
      }

      return items;
    },
    [isQuantityToken],
  );

  const splitNoDelimiterItems = useCallback(
    (normalizedText: string): string[] => {
      const tokens = tokenize(normalizedText);
      if (tokens.length < 2 || tokens.length > 6) {
        return [];
      }

      if (tokens.some((token) => PHRASE_STOP_WORDS.has(token))) {
        return [];
      }

      const knownCount = tokens.filter((token) =>
        COMMON_GROCERY_WORDS.has(token),
      ).length;
      const descriptorCount = tokens.filter((token) =>
        DESCRIPTOR_WORDS.has(token),
      ).length;

      const confidenceScore = knownCount * 2 - descriptorCount;
      const splitThreshold = Math.max(3, tokens.length + 1);

      if (knownCount < 2 || confidenceScore < splitThreshold) {
        return [];
      }

      return buildNoDelimiterItems(tokens);
    },
    [buildNoDelimiterItems, tokenize],
  );

  const isCommaSeperatedItems = useCallback(
    (transcript: string): boolean => {
      // Check if this looks like comma-separated items for adding
      // Criteria: multiple commas or comma with item-like pattern
      const trimmedText = transcript.trim();
      const commaCount = (trimmedText.match(/,/g) || []).length;

      // If there are commas and it doesn't match command patterns, treat as multi-item list
      if (commaCount > 0) {
        // Exclude commands that legitimately have commas
        return !isKnownCommandText(trimmedText);
      }
      return false;
    },
    [isKnownCommandText],
  );

  const isAndSeparatedItems = useCallback(
    (transcript: string): boolean => {
      // Check if this looks like "and"-separated items (e.g., "corn and milk", "apples and oranges and bananas")
      // Heuristic: detect 2+ short phrases connected by "and"
      const trimmedText = transcript.trim();
      if (isKnownCommandText(trimmedText)) {
        return false;
      }

      const candidateParts = splitBySpokenDelimiters(trimmedText);
      if (candidateParts.length >= 2) {
        // Check if each part looks like a reasonable item name (no more than 4 words, no verbs typically used in commands)
        return candidateParts.every((part) => {
          const normalizedPart = normalizeAddItemText(part);
          const wordCount = normalizedPart.trim().split(/\s+/).length;
          return wordCount > 0 && wordCount <= 4;
        });
      }
      return false;
    },
    [isKnownCommandText, normalizeAddItemText, splitBySpokenDelimiters],
  );

  const parseCommand = useCallback(
    (transcript: string): VoiceCommand => {
      const text = transcript.toLowerCase().trim();

      if (
        text === "clear completed" ||
        text === "clear checked" ||
        text === "clear checked items" ||
        text === "clear completed items" ||
        text === "remove completed" ||
        text === "delete completed"
      ) {
        return { type: "clear_completed" };
      }

      if (
        text === "clear all" ||
        text === "clear everything" ||
        text === "clear list" ||
        text === "delete all" ||
        text === "delete everything"
      ) {
        return { type: "clear_all" };
      }

      if (
        text === "reorganize" ||
        text === "reorganize list" ||
        text === "reorder" ||
        text === "reorder list"
      ) {
        return { type: "reorganize" };
      }

      if (
        text === "show stats" ||
        text === "show statistics" ||
        text === "view stats" ||
        text === "view statistics"
      ) {
        return { type: "show_stats" };
      }

      if (
        text === "show favorites" ||
        text === "show favourite" ||
        text === "view favorites" ||
        text === "open favorites"
      ) {
        return { type: "show_favorites" };
      }

      if (
        text === "show all" ||
        text === "show everything" ||
        text === "view all"
      ) {
        return { type: "show_all" };
      }

      const checkPatterns = [
        /^check\s+(?:off\s+)?(.+)$/i,
        /^mark\s+(.+?)(?:\s+as)?\s+(?:complete|completed|done|checked)$/i,
        /^(.+)\s+is\s+(?:complete|completed|done)$/i,
      ];

      for (const pattern of checkPatterns) {
        const match = text.match(pattern);
        if (match && match[1]) {
          const itemName = match[1].trim();
          return { type: "check_item", itemName };
        }
      }

      const uncheckPatterns = [
        /^uncheck\s+(.+)$/i,
        /^mark\s+(.+?)(?:\s+as)?\s+(?:incomplete|unchecked|not\s+done)$/i,
        /^unmark\s+(.+)$/i,
        /^remove\s+check\s+from\s+(.+)$/i,
      ];

      for (const pattern of uncheckPatterns) {
        const match = text.match(pattern);
        if (match && match[1]) {
          const itemName = match[1].trim();
          return { type: "uncheck_item", itemName };
        }
      }

      const increasePatterns = [
        /^increase\s+(.+?)\s+by\s+(\d+)$/i,
        /^add\s+(\d+)\s+(?:more\s+)?(?:to\s+)?(.+)$/i,
        /^(?:make\s+)?(.+?)\s+(?:plus|add)\s+(\d+)$/i,
        /^bump\s+(?:up\s+)?(.+?)\s+by\s+(\d+)$/i,
      ];

      for (const pattern of increasePatterns) {
        const match = text.match(pattern);
        if (match) {
          let itemName: string;
          let amount: number;

          if (pattern.source.startsWith("^increase")) {
            itemName = match[1].trim();
            amount = parseInt(match[2], 10);
          } else if (pattern.source.startsWith("^add\\s+\\(\\\\d\\+\\)")) {
            amount = parseInt(match[1], 10);
            itemName = match[2].trim();
          } else {
            itemName = match[1].trim();
            amount = parseInt(match[2], 10);
          }

          if (amount > 0 && amount <= 100) {
            return { type: "increase_quantity", itemName, amount };
          }
        }
      }

      const decreasePatterns = [
        /^decrease\s+(.+?)\s+by\s+(\d+)$/i,
        /^reduce\s+(.+?)\s+by\s+(\d+)$/i,
        /^remove\s+(\d+)\s+(?:from\s+)?(.+)$/i,
        /^subtract\s+(\d+)\s+from\s+(.+)$/i,
        /^(.+?)\s+minus\s+(\d+)$/i,
      ];

      for (const pattern of decreasePatterns) {
        const match = text.match(pattern);
        if (match) {
          let itemName: string;
          let amount: number;

          if (
            pattern.source.startsWith("^decrease") ||
            pattern.source.startsWith("^reduce")
          ) {
            itemName = match[1].trim();
            amount = parseInt(match[2], 10);
          } else if (
            pattern.source.startsWith("^remove") ||
            pattern.source.startsWith("^subtract")
          ) {
            amount = parseInt(match[1], 10);
            itemName = match[2].trim();
          } else {
            itemName = match[1].trim();
            amount = parseInt(match[2], 10);
          }

          if (amount > 0 && amount <= 100) {
            return { type: "decrease_quantity", itemName, amount };
          }
        }
      }

      const setQuantityPatterns = [
        /^set\s+(.+?)\s+to\s+(\d+)$/i,
        /^change\s+(.+?)\s+to\s+(\d+)$/i,
        /^make\s+(.+?)\s+(\d+)$/i,
        /^(?:update\s+)?(.+?)\s+(?:quantity\s+)?(?:to\s+)?(\d+)$/i,
      ];

      for (const pattern of setQuantityPatterns) {
        const match = text.match(pattern);
        if (match && match[1] && match[2]) {
          const itemName = match[1].trim();
          const amount = parseInt(match[2], 10);

          if (amount > 0 && amount <= 100) {
            return { type: "set_quantity", itemName, amount };
          }
        }
      }

      const sectionPatterns = [
        { regex: /^show (?:me )?(?:the )?(.+?)(?:\s+section)?$/i, capture: 1 },
        { regex: /^view (?:the )?(.+?)(?:\s+section)?$/i, capture: 1 },
        { regex: /^go to (?:the )?(.+?)(?:\s+section)?$/i, capture: 1 },
        { regex: /^filter (?:by )?(.+)$/i, capture: 1 },
      ];

      for (const pattern of sectionPatterns) {
        const match = text.match(pattern.regex);
        if (match && match[pattern.capture]) {
          const section = match[pattern.capture].trim();
          return { type: "show_section", section };
        }
      }

      const normalizedItemText = normalizeAddItemText(transcript);
      return {
        type: "add_item",
        text: normalizedItemText || transcript.trim(),
      };
    },
    [normalizeAddItemText],
  );

  const handleTranscript = useCallback(
    (transcript: string) => {
      const normalizedText = normalizeAddItemText(transcript);

      if (
        isCommaSeperatedItems(transcript) ||
        isAndSeparatedItems(transcript)
      ) {
        const items = splitBySpokenDelimiters(transcript)
          .map((item) => normalizeAddItemText(item))
          .filter((item) => item.length > 0);

        items.forEach((item) => {
          onCommand({ type: "add_item", text: item });
        });
        return;
      }

      const pauseSplitItems = splitNoDelimiterItems(normalizedText);
      if (pauseSplitItems.length >= 2) {
        pauseSplitItems
          .map((item) => normalizeAddItemText(item))
          .filter((item) => item.length > 0)
          .forEach((item) => {
            onCommand({ type: "add_item", text: item });
          });
        return;
      }

      const command = parseCommand(transcript);
      if (normalizedText || transcript.trim()) {
        onCommand(command);
      }
    },
    [
      parseCommand,
      onCommand,
      isCommaSeperatedItems,
      isAndSeparatedItems,
      splitBySpokenDelimiters,
      splitNoDelimiterItems,
      normalizeAddItemText,
    ],
  );

  return {
    handleTranscript,
    parseCommand,
  };
}
