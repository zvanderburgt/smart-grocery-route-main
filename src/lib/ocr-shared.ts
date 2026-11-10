// Shared pieces of the OCR pipeline, provider-agnostic: the prompt that asks a
// vision model for a JSON item list, and the parser that tolerates the sloppy
// output models actually return. Both OpenRouter and OpenCode use these, so a
// change to extraction rules never has to be made twice.

export const GROCERY_PROMPT = `Extract all grocery/shopping items from this list image. 

Return ONLY a JSON array of objects with this exact format:
[{"item": "item name", "quantity": 1}]

Rules:
- Include quantities if shown (e.g., "2 milk" becomes {"item": "milk", "quantity": 2})
- If no quantity is shown, use quantity: 1
- Clean up the item names (remove bullets, checkboxes, prices)
- Skip titles, headers, and non-item text
- If you can't identify any items, return an empty array: []
- Do NOT include markdown, code fences, or explanations - only the JSON array`;

export interface ExtractedItem {
  item: string;
  quantity: number;
}

export function parseItemsFromResponse(content: string): ExtractedItem[] {
  try {
    // Try to extract JSON from the response
    let jsonStr = content.trim();

    // Remove markdown code fences if present
    jsonStr = jsonStr.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');

    // Try to find JSON array in the response
    const arrayMatch = jsonStr.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      jsonStr = arrayMatch[0];
    }

    const parsed = JSON.parse(jsonStr);

    if (!Array.isArray(parsed)) {
      console.warn('OCR response is not an array:', parsed);
      return [];
    }

    const items: ExtractedItem[] = [];

    for (const item of parsed) {
      if (typeof item === 'string' && item.trim()) {
        items.push({ item: item.trim(), quantity: 1 });
      } else if (typeof item === 'object' && item !== null) {
        const itemName = item.item || item.name || item.text;
        const quantity = Number(item.quantity || item.qty || item.count || 1) || 1;

        if (itemName && typeof itemName === 'string') {
          items.push({ item: itemName.trim(), quantity });
        }
      }
    }

    return items;
  } catch (parseError) {
    console.warn('Failed to parse OCR response:', content, parseError);

    // Fallback: try to extract items from plain text
    const lines = content
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line.length > 0 && !line.startsWith('{') && !line.startsWith('[') && !line.startsWith('```'));

    return lines.slice(0, 20).map(line => ({ item: line, quantity: 1 })); // Limit to 20 items as safety measure
  }
}
