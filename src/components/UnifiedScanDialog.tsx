import { useEffect, useRef, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Camera, Check, Scan, X } from '@phosphor-icons/react'
import { Html5Qrcode } from 'html5-qrcode'
import { toast } from 'sonner'
import { learnBarcode, lookupBarcodeWithLearning, isValidBarcode } from '@/lib/barcode-database'
import { extractGroceryItems, getOcrProvider, getOcrProviderLabel, isOcrProviderConfigured } from '@/lib/ocr-provider'
import { setOpenCodeApiKey } from '@/lib/ocr-opencode'
import { setOpenRouterApiKey } from '@/lib/ocr-openrouter'
import type { ExtractedItem } from '@/lib/ocr-shared'
import { OCRErrorDialog } from '@/components/OCRErrorDialog'
import { OCRScanAnimation } from '@/components/OCRScanAnimation'
import type { LearnedBrand } from '@/lib/types'

interface UnifiedScanDialogProps {
  open: boolean
  onClose: () => void
  onProductScanned: (productName: string) => void
  onItemsExtracted: (items: Array<{ name: string; quantity: number }>) => void
  learnedBrands?: LearnedBrand[]
}

const SCANNER_ELEMENT_ID = 'unified-scan-reader'

const wait = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms))

const itemsToText = (items: ExtractedItem[]) =>
  items.map(({ item, quantity }) => (quantity > 1 ? `${quantity} x ${item}` : item)).join('\n')

const QUANTITY_PATTERNS = [
  { re: /^(\d+)\s*x\s+(.+)$/i, quantityFirst: true },
  { re: /^(.+)\s*x\s*(\d+)$/i, quantityFirst: false },
  { re: /^(\d+)\s+(.+)$/, quantityFirst: true },
]

export function parseQuantityFromText(text: string): { name: string; quantity: number } {
  for (const { re, quantityFirst } of QUANTITY_PATTERNS) {
    const match = text.match(re)
    if (match) {
      const [name, quantity] = quantityFirst ? [match[2], match[1]] : [match[1], match[2]]
      return { name: name.trim(), quantity: parseInt(quantity, 10) }
    }
  }

  return { name: text.trim(), quantity: 1 }
}

export function UnifiedScanDialog({ open, onClose, onProductScanned, onItemsExtracted, learnedBrands }: UnifiedScanDialogProps) {
  const [isScanning, setIsScanning] = useState(false)
  const [isLookingUp, setIsLookingUp] = useState(false)
  const [isProcessingOCR, setIsProcessingOCR] = useState(false)
  const [step, setStep] = useState<'scan' | 'review'>('scan')
  const [extractedText, setExtractedText] = useState('')
  const [extractedItems, setExtractedItems] = useState<ExtractedItem[]>([])
  const [lastDetectedBarcode, setLastDetectedBarcode] = useState('')
  const [lastDetectedProduct, setLastDetectedProduct] = useState('')
  const [pendingUnknownBarcode, setPendingUnknownBarcode] = useState('')
  const [manualProductName, setManualProductName] = useState('')

  const [showErrorDialog, setShowErrorDialog] = useState(false)
  const [errorType, setErrorType] = useState<'no_items' | 'llm_error' | 'general'>('general')
  const [errorMessage, setErrorMessage] = useState<string>()
  const [capturedPreviewImage, setCapturedPreviewImage] = useState('')
  const [showApiKeyDialog, setShowApiKeyDialog] = useState(false)
  const [apiKeyInput, setApiKeyInput] = useState('')

  const scannerRef = useRef<Html5Qrcode | null>(null)
  const isScannerRunning = useRef(false)
  const scannerStartRequestId = useRef(0)
  const openRef = useRef(open)
  const lastScannedCode = useRef('')
  const lastScannedTime = useRef(0)
  const isProcessingBarcode = useRef(false)
  const stepRef = useRef<'scan' | 'review'>('scan')
  const isProcessingOCRRef = useRef(false)
  const pendingUnknownBarcodeRef = useRef('')

  useEffect(() => {
    openRef.current = open
  }, [open])

  const resetState = () => {
    setStep('scan')
    setExtractedText('')
    setExtractedItems([])
    setLastDetectedBarcode('')
    setLastDetectedProduct('')
    setPendingUnknownBarcode('')
    setManualProductName('')
    setIsLookingUp(false)
    setIsProcessingOCR(false)
    setCapturedPreviewImage('')
    setShowApiKeyDialog(false)
    setApiKeyInput('')
    lastScannedCode.current = ''
    lastScannedTime.current = 0
    isProcessingBarcode.current = false
    stepRef.current = 'scan'
    isProcessingOCRRef.current = false
    pendingUnknownBarcodeRef.current = ''
  }

  const stopScanning = async () => {
    // Invalidate any in-flight start requests to avoid late camera activation.
    scannerStartRequestId.current += 1

    if (!scannerRef.current || !isScannerRunning.current) return

    try {
      await scannerRef.current.stop()
      scannerRef.current.clear()
    } catch (error) {
      console.error('Error stopping scanner:', error)
    } finally {
      isScannerRunning.current = false
      scannerRef.current = null
      setIsScanning(false)
    }
  }

  const lookupKnownProductName = (barcode: string): string | null => {
    const productName = lookupBarcodeWithLearning(barcode)
    if (!productName) return null
    return productName.trim()
  }

  const handleDetectedBarcode = async (barcode: string) => {
    if (isProcessingBarcode.current) return

    isProcessingBarcode.current = true
    setIsLookingUp(true)

    try {
      if (!isValidBarcode(barcode)) return

      const productName = lookupKnownProductName(barcode)

      if (!productName) {
        await stopScanning()
        pendingUnknownBarcodeRef.current = barcode
        setPendingUnknownBarcode(barcode)
        setManualProductName('')
        return
      }

      setLastDetectedBarcode(barcode)
      setLastDetectedProduct(productName)

      onProductScanned(productName)
    } catch (error) {
      console.error('Barcode lookup failed:', error)
      toast.error('Could not process barcode')
    } finally {
      setIsLookingUp(false)
      isProcessingBarcode.current = false
    }
  }

  const handleSaveUnknownBarcode = async () => {
    const productName = manualProductName.trim()
    if (!pendingUnknownBarcode) return

    if (!productName) {
      toast.error('Please enter a product name')
      return
    }

    learnBarcode(pendingUnknownBarcode, productName)
    setLastDetectedBarcode(pendingUnknownBarcode)
    setLastDetectedProduct(productName)
    onProductScanned(productName)

    pendingUnknownBarcodeRef.current = ''
    setPendingUnknownBarcode('')
    setManualProductName('')
    await startScanning()
  }

  const handleSkipUnknownBarcode = async () => {
    pendingUnknownBarcodeRef.current = ''
    setPendingUnknownBarcode('')
    setManualProductName('')
    await startScanning()
  }

  const startScanning = async () => {
    if (!open || step !== 'scan' || isScannerRunning.current) return

    const requestId = ++scannerStartRequestId.current

    // The dialog content is portaled and can mount a tick after open.
    let scannerElement: HTMLElement | null = null
    for (let attempt = 0; attempt < 8; attempt++) {
      scannerElement = document.getElementById(SCANNER_ELEMENT_ID)
      if (scannerElement) break
      await wait(100)
    }

    if (!scannerElement) {
      toast.error('Camera failed to initialize. Tap Start Camera to retry.')
      return
    }

    try {
      const html5QrCode = new Html5Qrcode(SCANNER_ELEMENT_ID)
      scannerRef.current = html5QrCode

      await html5QrCode.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 250, height: 150 },
          aspectRatio: 1.777778,
        },
        async (decodedText: string) => {
          if (!isScannerRunning.current || isProcessingOCRRef.current || stepRef.current !== 'scan' || Boolean(pendingUnknownBarcodeRef.current)) return

          const now = Date.now()
          if (decodedText === lastScannedCode.current && now - lastScannedTime.current < 3000) {
            return
          }

          lastScannedCode.current = decodedText
          lastScannedTime.current = now
          await handleDetectedBarcode(decodedText)
        },
        undefined,
      )

      // If dialog state changed while startup was in-flight, release camera immediately.
      if (
        requestId !== scannerStartRequestId.current ||
        !openRef.current ||
        stepRef.current !== 'scan'
      ) {
        try {
          await html5QrCode.stop()
        } catch {
          // Scanner may already be stopped.
        }
        html5QrCode.clear()
        if (scannerRef.current === html5QrCode) {
          scannerRef.current = null
        }
        return
      }

      isScannerRunning.current = true
      setIsScanning(true)
    } catch (error) {
      console.error('Camera error:', error)
      toast.error('Camera access denied or unavailable')
      scannerRef.current = null
      isScannerRunning.current = false
      setIsScanning(false)
    }
  }

  const enhanceImageForOCR = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const imageData = ctx.getImageData(0, 0, width, height)
    const data = imageData.data

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]

      const gray = 0.299 * r + 0.587 * g + 0.114 * b
      const contrast = 1.3
      const brightness = 15

      let enhanced = contrast * (gray - 128) + 128 + brightness
      enhanced = Math.max(0, Math.min(255, enhanced))

      data[i] = enhanced
      data[i + 1] = enhanced
      data[i + 2] = enhanced
      data[i + 3] = 255
    }

    ctx.putImageData(imageData, 0, 0)
  }

  const captureCurrentFrame = (): string => {
    const container = document.getElementById(SCANNER_ELEMENT_ID)
    const video = container?.querySelector('video') as HTMLVideoElement | null

    if (!video || !video.videoWidth || !video.videoHeight) {
      throw new Error('Camera preview is not ready yet. Try again in a moment.')
    }

    const maxDimension = 1280
    let targetWidth = video.videoWidth
    let targetHeight = video.videoHeight

    if (targetWidth > maxDimension || targetHeight > maxDimension) {
      const scale = Math.min(maxDimension / targetWidth, maxDimension / targetHeight)
      targetWidth = Math.round(targetWidth * scale)
      targetHeight = Math.round(targetHeight * scale)
    }

    const canvas = document.createElement('canvas')
    canvas.width = targetWidth
    canvas.height = targetHeight

    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) {
      throw new Error('Failed to create image processing context')
    }

    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, targetWidth, targetHeight)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'

    ctx.drawImage(video, 0, 0, targetWidth, targetHeight)
    enhanceImageForOCR(ctx, targetWidth, targetHeight)

    let quality = 0.8
    let dataUrl = canvas.toDataURL('image/jpeg', quality)
    const maxSize = 320000

    while (dataUrl.length > maxSize && quality > 0.45) {
      quality -= 0.05
      dataUrl = canvas.toDataURL('image/jpeg', quality)
    }

    return dataUrl
  }

  const handleCaptureForOCR = async () => {
    if (isProcessingOCR) return

    if (!isOcrProviderConfigured()) {
      setShowApiKeyDialog(true)
      return
    }

    setIsProcessingOCR(true)

    try {
      const capturedImage = captureCurrentFrame()
      setCapturedPreviewImage(capturedImage)
      await stopScanning()

      const items = await extractGroceryItems(capturedImage)

      if (items.length === 0) {
        setErrorType('no_items')
        setErrorMessage('No grocery items were detected. Try framing the list more clearly and capture again.')
        setShowErrorDialog(true)
        await startScanning()
        return
      }

      setExtractedItems(items)
      setExtractedText(itemsToText(items))
      setStep('review')
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error'
      console.error('OCR capture failed:', error)

      setErrorType('llm_error')
      setErrorMessage(msg)
      setShowErrorDialog(true)
      await startScanning()
    } finally {
      setIsProcessingOCR(false)
    }
  }

  const handleSaveApiKey = () => {
    const key = apiKeyInput.trim()
    if (!key) {
      toast.error('Please enter an API key')
      return
    }
    if (getOcrProvider() === 'opencode') {
      setOpenCodeApiKey(key)
    } else {
      setOpenRouterApiKey(key)
    }
    setApiKeyInput('')
    setShowApiKeyDialog(false)
    toast.success('API key saved')
  }

  const handleConfirmItems = async () => {
    // Unedited text still matches the OCR result, so use it verbatim — re-parsing
    // it would turn names like "7 Up" into 7 units of "Up".
    const parsedItems = extractedText === itemsToText(extractedItems)
      ? extractedItems.map(({ item, quantity }) => ({ name: item, quantity }))
      : extractedText
          .split(/\r?\n/)
          .map(line => line.trim().replace(/^[-*•·]\s*|^\d+[.)]\s*/, '').trim())
          .filter(line => line.length > 0)
          .map(parseQuantityFromText)

    if (parsedItems.length === 0) {
      toast.error('No items to add')
      return
    }

    const consolidated = parsedItems.reduce((acc, item) => {
      const existing = acc.find(i => i.name.toLowerCase() === item.name.toLowerCase())
      if (existing) {
        existing.quantity += item.quantity
      } else {
        acc.push({ ...item })
      }
      return acc
    }, [] as Array<{ name: string; quantity: number }>)

    onItemsExtracted(consolidated)

    await handleClose()
  }

  const handleBackToCamera = async () => {
    setExtractedText('')
    setExtractedItems([])
    setStep('scan')
    await startScanning()
  }

  const handleClose = async () => {
    await stopScanning()
    resetState()
    onClose()
  }

  useEffect(() => {
    if (!open || step !== 'scan') return

    const timer = window.setTimeout(() => {
      void startScanning()
    }, 120)

    return () => {
      window.clearTimeout(timer)
    }
  }, [open, step])

  useEffect(() => {
    stepRef.current = step
  }, [step])

  useEffect(() => {
    isProcessingOCRRef.current = isProcessingOCR
  }, [isProcessingOCR])

  useEffect(() => {
    pendingUnknownBarcodeRef.current = pendingUnknownBarcode
  }, [pendingUnknownBarcode])

  useEffect(() => {
    if (open) return
    void stopScanning()
    resetState()
  }, [open])

  useEffect(() => {
    return () => {
      void stopScanning()
    }
  }, [])

  return (
    <>
      <OCRErrorDialog
        open={showErrorDialog}
        onClose={() => setShowErrorDialog(false)}
        errorType={errorType}
        errorMessage={errorMessage}
      />

      <Dialog
        open={showApiKeyDialog}
        onOpenChange={setShowApiKeyDialog}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add {getOcrProviderLabel()} API Key</DialogTitle>
            <DialogDescription>
              {getOcrProvider() === 'opencode'
                ? 'Paste your OpenCode API key. If your relay already holds the key, you can skip this and scan.'
                : 'To use OCR, add your OpenRouter API key. Get one free at openrouter.ai'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              type="password"
              placeholder={getOcrProvider() === 'opencode' ? 'OpenCode API key' : 'sk-or-...'}
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleSaveApiKey()
                }
              }}
            />
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setShowApiKeyDialog(false)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveApiKey}
                className="flex-1"
              >
                Save Key
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            void handleClose()
          }
        }}
      >
        <DialogContent className="inset-0 flex h-dvh max-h-dvh w-screen max-w-none flex-col translate-x-0 translate-y-0 rounded-none border-0 px-3 py-4 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden sm:top-[50%] sm:left-[50%] sm:right-auto sm:bottom-auto sm:h-auto sm:max-h-[90dvh] sm:w-full sm:max-w-xl sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-lg sm:border sm:px-6 sm:py-6">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Scan className="h-5 w-5" weight="bold" />
              Scan With Camera
            </DialogTitle>
            <DialogDescription>
              Point your camera at a barcode for instant scan, or capture the full frame to run OCR on a written list.
            </DialogDescription>
          </DialogHeader>

          {step === 'scan' ? (
            <div className="flex min-h-0 flex-1 flex-col gap-3 sm:gap-4">
              <div className="relative flex w-full flex-1 min-h-0 rounded-lg overflow-hidden border-2 border-primary bg-muted sm:flex-none sm:min-h-[280px]">
                <div
                  id={SCANNER_ELEMENT_ID}
                  className="h-full w-full [&>div]:h-full [&>div]:w-full [&_video]:h-full [&_video]:w-full [&_video]:object-cover sm:[&_video]:object-contain"
                />

                {isProcessingOCR && (
                  <div className="absolute inset-0 z-30 flex items-center justify-center">
                    {capturedPreviewImage && (
                      <img
                        src={capturedPreviewImage}
                        alt="Captured frame"
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                    )}
                    <div className="absolute inset-0 bg-background/50" />
                    <OCRScanAnimation className="absolute inset-0 z-10" />
                    <span className="relative z-10 text-lg font-bold tracking-wide text-foreground bg-background/80 px-4 py-1.5 rounded-full">
                      Analyzing
                    </span>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <Badge variant={isScanning ? 'default' : 'secondary'}>
                  {isScanning ? 'Live camera active' : 'Camera not active'}
                </Badge>
                {isLookingUp && (
                  <span className="text-xs text-muted-foreground">Identifying barcode...</span>
                )}
              </div>

              {lastDetectedProduct && (
                <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-1">
                  <p className="text-xs text-muted-foreground">Last barcode</p>
                  <p className="text-sm font-medium">{lastDetectedProduct}</p>
                  {lastDetectedBarcode && <p className="text-xs font-mono text-muted-foreground">{lastDetectedBarcode}</p>}
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-2">
                <Button
                  onClick={() => void handleCaptureForOCR()}
                  className="w-full sm:flex-1"
                  disabled={!isScanning || isProcessingOCR || Boolean(pendingUnknownBarcode)}
                >
                  <Camera className="h-4 w-4 mr-2" />
                  {isProcessingOCR ? 'Processing...' : 'Capture Photo for OCR'}
                </Button>
                <Button
                  variant="outline"
                  className="w-full sm:w-auto"
                  onClick={() => {
                    if (isScanning) {
                      void stopScanning()
                    } else {
                      void startScanning()
                    }
                  }}
                  disabled={isProcessingOCR}
                >
                  {isScanning ? 'Stop Camera' : 'Start Camera'}
                </Button>
              </div>

              {pendingUnknownBarcode && (
                <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-3">
                  <p className="text-sm font-medium">Unknown barcode</p>
                  <p className="text-xs font-mono text-muted-foreground">{pendingUnknownBarcode}</p>
                  <Input
                    value={manualProductName}
                    onChange={(e) => setManualProductName(e.target.value)}
                    placeholder="What product is this?"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        void handleSaveUnknownBarcode()
                      }
                    }}
                  />
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Button onClick={() => void handleSaveUnknownBarcode()} className="w-full sm:flex-1">
                      Save & Add
                    </Button>
                    <Button variant="outline" onClick={() => void handleSkipUnknownBarcode()} className="w-full sm:flex-1">
                      Skip
                    </Button>
                  </div>
                </div>
              )}

            </div>
          ) : (
            <div className="flex flex-col gap-4 py-2">
              <Textarea
                value={extractedText}
                onChange={e => setExtractedText(e.target.value)}
                placeholder="One item per line"
                className="min-h-48 font-medium"
              />

              <div className="flex flex-col sm:flex-row gap-2">
                <Button variant="outline" onClick={() => void handleBackToCamera()} className="w-full sm:flex-1">
                  Back to Camera
                </Button>
                <Button onClick={() => void handleConfirmItems()} className="w-full sm:flex-1">
                  <Check className="h-4 w-4 mr-2" />
                  Add Items
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
