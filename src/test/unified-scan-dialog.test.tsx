import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

import { UnifiedScanDialog } from '@/components/UnifiedScanDialog'

vi.mock('html5-qrcode', () => ({
  Html5Qrcode: class {
    start = vi.fn().mockResolvedValue(undefined)
    stop = vi.fn().mockResolvedValue(undefined)
    clear = vi.fn()
  },
}))

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  },
}))

describe('UnifiedScanDialog', () => {
  const renderDialog = () => render(
    <UnifiedScanDialog
      open={true}
      onClose={vi.fn()}
      onProductScanned={vi.fn()}
      onItemsExtracted={vi.fn()}
      learnedBrands={[]}
    />,
  )

  it('keeps the scan step free of the tips section', () => {
    renderDialog()

    expect(screen.getByRole('button', { name: 'Capture Photo for OCR' })).toBeInTheDocument()
    expect(screen.queryByText('Tips:')).not.toBeInTheDocument()
    expect(screen.queryByText('Barcodes are scanned automatically from the live camera feed')).not.toBeInTheDocument()
  })

  it('uses a full-screen layout on mobile while letting the camera preview fill the remaining space', () => {
    renderDialog()

    const dialog = screen.getByRole('dialog')
    const scanner = document.getElementById('unified-scan-reader')
    const scannerWrapper = scanner?.parentElement

    expect(dialog.className).toContain('inset-0')
    expect(dialog.className).toContain('h-dvh')
    expect(dialog.className).toContain('flex')
    expect(scanner).not.toBeNull()
    expect(scanner?.className).toContain('[&_video]:object-cover')
    expect(scanner?.className).toContain('[&>div]:h-full')
    expect(scannerWrapper?.className).toContain('flex-1')
    expect(scannerWrapper?.className).toContain('sm:min-h-[280px]')
  })
})
