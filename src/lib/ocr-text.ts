function parseItemsFromJsonLikeText(rawText: string): string[] {
  const text = rawText.trim();
  if (!text) return [];

  const stripped = text
    .replace(/^```(?:json|js|javascript|text)?\s*|\s*```$/gi, "")
    .trim();

  const candidates: string[] = [stripped];
  const objectMatch = stripped.match(/\{[\s\S]*\}/);
  if (objectMatch && objectMatch[0] !== stripped) {
    candidates.push(objectMatch[0]);
  }
  const arrayMatch = stripped.match(/\[[\s\S]*\]/);
  if (arrayMatch && arrayMatch[0] !== stripped) {
    candidates.push(arrayMatch[0]);
  }

  for (const candidate of candidates) {
    const normalized = candidate
      .replace(/'/g, '"')
      .replace(/,\s*\}/g, "}")
      .replace(/,\s*\]/g, "]");

    try {
      const parsed = JSON.parse(normalized) as unknown;

      if (Array.isArray(parsed)) {
        const items = parsed.filter(
          (item): item is string =>
            typeof item === "string" && item.trim().length > 0,
        );
        if (items.length > 0) return items;
      }

      if (parsed && typeof parsed === "object") {
        const obj = parsed as Record<string, unknown>;
        const maybeItems = obj.items ?? obj.item ?? obj.list ?? obj.results;
        if (Array.isArray(maybeItems)) {
          const items = maybeItems.filter(
            (item): item is string =>
              typeof item === "string" && item.trim().length > 0,
          );
          if (items.length > 0) return items;
        }
      }
    } catch {
      // Try the next candidate.
    }
  }

  const itemsMatch = stripped.match(/["']items["']\s*:\s*\[([^\]]*)\]/i);
  if (itemsMatch) {
    const listContent = itemsMatch[1];
    const itemRegex = /["']([^"']+)["']/g;
    const items: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = itemRegex.exec(listContent)) !== null) {
      const item = match[1].trim();
      if (item.length > 0) items.push(item);
    }
    if (items.length > 0) return items;
  }

  return [];
}

export function normalizeOCRTextToLines(rawText: string): string[] {
  const parsedJsonItems = parseItemsFromJsonLikeText(rawText);
  if (parsedJsonItems.length > 0) {
    return parsedJsonItems;
  }

  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) =>
      line
        .replace(/^[-*•·\d.)\s]+/, "")
        .replace(/^"|"$/g, "")
        .replace(/^'|'$/g, "")
        .replace(/,$/, "")
        .trim(),
    )
    .filter((line) => line.length > 0)
    .filter((line) => !/^(items?|list|results?)\s*:\s*$/i.test(line))
    .filter((line) => !/^[\[\]}]+$/.test(line));

  return lines;
}
