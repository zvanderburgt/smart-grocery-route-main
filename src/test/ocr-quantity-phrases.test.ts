import { describe, expect, it } from 'vitest'
import { extractAmountFromName, normaliseQuantity, parseItemsFromResponse, readQuantity } from '@/lib/ocr-shared'

describe('readQuantity', () => {
  it('reads numbers and numeric strings', () => {
    expect(readQuantity(3)).toBe(3)
    expect(readQuantity('4')).toBe(4)
    expect(readQuantity('2x')).toBe(2)
    expect(readQuantity('x2')).toBe(2)
  })

  it('reads number words', () => {
    expect(readQuantity('two')).toBe(2)
    expect(readQuantity('a dozen')).toBe(12)
    expect(readQuantity('half dozen')).toBe(6)
    expect(readQuantity('2 dozen')).toBe(24)
  })

  it('reports nothing for text it does not understand', () => {
    expect(readQuantity('plenty')).toBeNull()
    expect(readQuantity('')).toBeNull()
    expect(readQuantity(undefined)).toBeNull()
  })
})

describe('extractAmountFromName', () => {
  it('pulls a bracketed unit out of the name (the Gemini/LongCat case)', () => {
    expect(extractAmountFromName('Eggs (dozen)')).toEqual({ name: 'Eggs', amount: 12, fromDozen: true })
    expect(extractAmountFromName('Eggs [12]')).toEqual({ name: 'Eggs', amount: 12, fromDozen: false })
    expect(extractAmountFromName('Milk (x2)')).toEqual({ name: 'Milk', amount: 2, fromDozen: false })
  })

  it('handles a leading amount', () => {
    expect(extractAmountFromName('1 dozen eggs')).toMatchObject({ name: 'eggs', amount: 12 })
    expect(extractAmountFromName('2x milk')).toMatchObject({ name: 'milk', amount: 2 })
  })

  it('handles a trailing amount', () => {
    expect(extractAmountFromName('Bananas 3')).toMatchObject({ name: 'Bananas', amount: 3 })
    expect(extractAmountFromName('milk x2')).toMatchObject({ name: 'milk', amount: 2 })
    expect(extractAmountFromName('eggs - a dozen')).toMatchObject({ name: 'eggs', amount: 12 })
  })

  it('leaves words that only look like amounts alone', () => {
    expect(extractAmountFromName('2% milk')).toEqual({ name: '2% milk', amount: null, fromDozen: false })
    expect(extractAmountFromName('7 Up')).toEqual({ name: '7 Up', amount: null, fromDozen: false })
    expect(extractAmountFromName('Chips (bbq)')).toEqual({ name: 'Chips (bbq)', amount: null, fromDozen: false })
  })
})

describe('normaliseQuantity', () => {
  it('lets the quantity field win when it is meaningful', () => {
    expect(normaliseQuantity(4, 12, true)).toBe(4)
  })

  it('falls back to the name amount when the field is empty or 1', () => {
    expect(normaliseQuantity(1, 12, true)).toBe(12)
    expect(normaliseQuantity(undefined, 6, true)).toBe(6)
  })

  it('multiplies a count by a dozen written in both places', () => {
    // "2 dozen eggs" answered as {name: '2 dozen eggs', quantity: 2}
    expect(normaliseQuantity(2, 24, true)).toBe(24)
  })

  it('never returns less than one or a runaway number', () => {
    expect(normaliseQuantity(0, null)).toBe(1)
    expect(normaliseQuantity(-3, null)).toBe(1)
    expect(normaliseQuantity(1e9, null)).toBe(999)
  })
})

describe('parseItemsFromResponse quantity phrases', () => {
  it('imports "Eggs (dozen)" as twelve eggs, not one', () => {
    const items = parseItemsFromResponse('[{"item": "Eggs (dozen)", "quantity": 1}, {"item": "milk", "quantity": 2}]')
    expect(items).toEqual([
      { item: 'Eggs', quantity: 12 },
      { item: 'milk', quantity: 2 },
    ])
  })

  it('imports "1 dozen" in the quantity field', () => {
    const items = parseItemsFromResponse('[{"item": "eggs", "quantity": "1 dozen"}]')
    expect(items).toEqual([{ item: 'eggs', quantity: 12 }])
  })

  it('keeps names intact when the model already did the maths', () => {
    const items = parseItemsFromResponse('[{"item": "eggs", "quantity": 12}, {"item": "Bread"}]')
    expect(items).toEqual([
      { item: 'eggs', quantity: 12 },
      { item: 'Bread', quantity: 1 },
    ])
  })

  it('applies the same rules to the plain-text fallback', () => {
    const items = parseItemsFromResponse('Eggs (dozen)\nBananas 3\nBread')
    expect(items).toEqual([
      { item: 'Eggs', quantity: 12 },
      { item: 'Bananas', quantity: 3 },
      { item: 'Bread', quantity: 1 },
    ])
  })
})
