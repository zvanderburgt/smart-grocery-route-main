// Shared pieces of the OCR pipeline, provider-agnostic: the prompt that asks a
// vision model for a JSON item list, and the parser that tolerates the sloppy
// output models actually return. Both OpenRouter and OpenCode use these, so a
// change to extraction rules never has to be made twice.

export const GROCERY_PROMPT = `Extract all grocery/shopping items from this list image. 

Return ONLY a JSON array of objects with this exact format:
[{"item": "item name", "quantity": 1}]

Rules:
- Include quantities if shown (e.g., "2 milk" becomes {"item": "milk", "quantity": 2})
- Convert written amounts to numbers: "1 dozen" is quantity: 12, "half dozen" is 6 - never leave the unit inside the item name
- If no quantity is shown, use quantity: 1
- Clean up the item names (remove bullets, checkboxes, prices)
- Skip titles, headers, and non-item text
- If you can't identify any items, return an empty array: []
- Do NOT include markdown, code fences, or explanations - only the JSON array`;

export interface ExtractedItem {
  item: string;
  quantity: number;
}


/** Quantity ceiling: models occasionally answer with a runaway number. */
const MAX_QUANTITY = 999;

const NUMBER_WORDS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  single: 1,
  two: 2,
  pair: 2,
  couple: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
};

/** 12 for "dozen", 6 for "half dozen", 36 for "3 dozen". */
function dozenValue(token: string): number {
  if (token === 'half') return 6;
  if (token === 'a' || token === 'an') return 12;
  return Math.round(parseFloat(token) * 12);
}

/**
 * Turns a model's quantity field into a number.
 *
 * Models answer with numbers, numeric strings, words ("two") and phrases ("1
 * dozen"). Returning null means "the field said nothing useful", which lets the
 * caller fall back to an amount written inside the item name.
 */
export function readQuantity(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;

  const text = value.trim().toLowerCase();
  if (!text) return null;

  const dozen = text.match(/^(\d+(?:\.\d+)?|a|an|half)\s+dozen$/);
  if (dozen) return dozenValue(dozen[1]);
  if (/^(a\s+)?dozen$/.test(text)) return 12;

  if (NUMBER_WORDS[text] !== undefined) return NUMBER_WORDS[text];

  // "2", "2x", "x2", "2 x"
  const numeric = text.match(/^x?\s*(\d+(?:\.\d+)?)\s*x?$/);
  if (numeric) return parseFloat(numeric[1]);

  return null;
}

/**
 * Pulls an amount written into the item name and strips it out.
 *
 * This is the case that actually broke OCR in testing: Gemini and LongCat
 * answered {"item": "Eggs (dozen)", "quantity": 1}, which the app imported as
 * one egg. "1 dozen" in the quantity field was handled by the fast models, but
 * the unit landing in the name was not handled anywhere.
 */
export function extractAmountFromName(rawName: string): { name: string; amount: number | null; fromDozen: boolean } {
  let name = rawName.trim();
  let amount: number | null = null;
  let fromDozen = false;

  const apply = (value: number | null, isDozen: boolean) => {
    if (value === null) return;
    amount = value;
    fromDozen = fromDozen || isDozen;
  };

  // trailing bracketed amount: "Eggs (dozen)", "Eggs [12]", "Milk (x2)"
  const bracket = name.match(/[\[(]([^\])]+)[\])]\s*$/);
  if (bracket) {
    const inner = bracket[1].trim();
    const parsed = readQuantity(inner);
    if (parsed !== null) {
      apply(parsed, /dozen/i.test(inner));
      name = name.slice(0, bracket.index).trim();
    }
  }

  // leading amount: "1 dozen eggs", "dozen eggs", "2x milk", "3 apples"
  const leading = name.match(/^(\d+(?:\.\d+)?|a|an|half)\s+dozen\s+(.+)$/i);
  if (leading) {
    apply(dozenValue(leading[1].toLowerCase()), true);
    name = leading[2].trim();
  } else {
    const leadingX = name.match(/^(\d+(?:\.\d+)?)\s*[x×]\s+(.+)$/i);
    if (leadingX) {
      apply(parseFloat(leadingX[1]), false);
      name = leadingX[2].trim();
    }
  }

  // trailing "x2" / "×2"
  const trailingX = name.match(/\s*[x×]\s*(\d+(?:\.\d+)?)\s*$/i);
  if (trailingX) {
    apply(parseFloat(trailingX[1]), false);
    name = name.slice(0, trailingX.index).trim();
  }

  // trailing bare count: "Bananas 3", "eggs - 12" (never "2%" or "7up")
  const trailingCount = name.match(/\s+(?:[-–:]\s*)?(\d+)\s*$/);
  if (trailingCount) {
    apply(parseInt(trailingCount[1], 10), false);
    name = name.slice(0, trailingCount.index).trim();
  }

  // trailing "a dozen" left over from "eggs - a dozen"
  const trailingDozen = name.match(/\s+(?:[-–:]\s*)?(a\s+|an\s+|half\s+|\d+\s+)?dozen\b\s*$/i);
  if (trailingDozen) {
    const token = (trailingDozen[1] || '').trim().toLowerCase();
    apply(token ? dozenValue(token.replace(/\s+$/, '')) : 12, true);
    name = name.slice(0, trailingDozen.index).trim();
  }

  name = name.replace(/\s+/g, ' ').replace(/^[-–:,\s]+|[-–:,\s]+$/g, '').trim();

  return { name, amount, fromDozen };
}

/**
 * Final quantity: the field wins when it says something meaningful, otherwise an
 * amount inside the name is used. "2 dozen" in the name multiplies a field
 * quantity, because that is literally what the text says.
 */
export function normaliseQuantity(fieldQuantity: unknown, nameAmount: number | null, fromDozen = false): number {
  const field = readQuantity(fieldQuantity);
  let quantity = field ?? 1;

  if (nameAmount !== null) {
    if (quantity <= 1) {
      quantity = nameAmount;
    } else if (fromDozen && nameAmount > 12) {
      quantity *= 12;
    }
  }

  if (!Number.isFinite(quantity) || quantity < 1) quantity = 1;
  return Math.min(Math.round(quantity), MAX_QUANTITY);
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

        if (itemName && typeof itemName === 'string') {
          // Amounts can arrive in the quantity field, in the name, or both.
          const { name, amount, fromDozen } = extractAmountFromName(itemName);
          const rawQuantity = item.quantity ?? item.qty ?? item.count;
          const quantity = normaliseQuantity(rawQuantity, amount, fromDozen);

          if (name) items.push({ item: name, quantity });
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

    return lines
      .slice(0, 20) // Limit to 20 items as safety measure
      .map((line) => {
        const { name, amount, fromDozen } = extractAmountFromName(line);
        return { item: name || line, quantity: normaliseQuantity(undefined, amount, fromDozen) };
      });
  }
}
