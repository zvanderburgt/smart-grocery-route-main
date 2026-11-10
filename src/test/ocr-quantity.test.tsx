import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { UnifiedScanDialog, parseQuantityFromText } from '@/components/UnifiedScanDialog'
import { parseItemsFromResponse } from '@/lib/ocr-openrouter'

vi.mock('html5-qrcode', () => ({
  Html5Qrcode: class {
    start = vi.fn().mockResolvedValue(undefined)
    stop = vi.fn().mockResolvedValue(undefined)
    clear = vi.fn()
  },
}))

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() },
}))

// three.js needs a real WebGL context, which jsdom does not provide.
vi.mock('@/components/OCRScanAnimation', () => ({
  OCRScanAnimation: () => null,
}))

vi.mock('@/lib/ocr-openrouter', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ocr-openrouter')>()),
  hasOpenRouterApiKey: () => true,
  getAutoSelectModel: () => false,
  getSelectedOpenRouterModel: () => 'test-model',
  extractGroceryItemsWithOpenRouter: vi.fn().mockResolvedValue([{ item: '7 Up', quantity: 1 }]),
}))

// jsdom has no canvas backend, so captureCurrentFrame needs a stub context.
const stubCameraFrame = () => {
  const video = document.createElement('video')
  Object.defineProperty(video, 'videoWidth', { value: 640 })
  Object.defineProperty(video, 'videoHeight', { value: 480 })
  document.getElementById('unified-scan-reader')?.appendChild(video)

  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    fillRect: vi.fn(),
    drawImage: vi.fn(),
    getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    putImageData: vi.fn(),
  } as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,AAAA')
}

describe('OCR quantity round-trip', () => {
  it('keeps "7 Up" as one unit when the textarea is not edited', async () => {
    const user = userEvent.setup()
    const onItemsExtracted = vi.fn()

    render(
      <UnifiedScanDialog
        open={true}
        onClose={vi.fn()}
        onProductScanned={vi.fn()}
        onItemsExtracted={onItemsExtracted}
        learnedBrands={[]}
      />,
    )

    stubCameraFrame()

    const captureButton = screen.getByRole('button', { name: 'Capture Photo for OCR' })
    await waitFor(() => expect(captureButton).toBeEnabled())
    await user.click(captureButton)

    const textarea = await screen.findByPlaceholderText('One item per line')
    expect(textarea).toHaveValue('7 Up')

    await user.click(screen.getByRole('button', { name: 'Add Items' }))

    expect(onItemsExtracted).toHaveBeenCalledWith([{ name: '7 Up', quantity: 1 }])
  })

  it('parses the "2 x milk" display format back into name and quantity', () => {
    expect(parseQuantityFromText('2 x milk')).toEqual({ name: 'milk', quantity: 2 })
    expect(parseQuantityFromText('milk')).toEqual({ name: 'milk', quantity: 1 })
  })
})

describe('parseItemsFromResponse', () => {
  it('returns structured items for a JSON array response', () => {
    expect(parseItemsFromResponse('[{"item": "milk", "quantity": 2}, {"name": "7 Up", "qty": 1}]')).toEqual([
      { item: 'milk', quantity: 2 },
      { item: '7 Up', quantity: 1 },
    ])
  })

  it('returns structured items for a response wrapped in code fences', () => {
    const content = '```json\n[{"item": "eggs", "quantity": 12}]\n```'
    expect(parseItemsFromResponse(content)).toEqual([{ item: 'eggs', quantity: 12 }])
  })

  it('falls back to one item per line when the response is not JSON', () => {
    expect(parseItemsFromResponse('milk\nbread')).toEqual([
      { item: 'milk', quantity: 1 },
      { item: 'bread', quantity: 1 },
    ])
  })
})
