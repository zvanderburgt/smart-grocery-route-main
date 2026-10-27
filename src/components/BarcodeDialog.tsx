import { useState, useEffect, useRef } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Barcode, Camera, Plus, X, MagnifyingGlass, Check, Trash } from '@phosphor-icons/react'
import { Html5Qrcode } from 'html5-qrcode'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'
import { lookupBarcodeWithLearning, learnBarcode, isValidBarcode, getGenericProductDescription } from '@/lib/barcode-database'
import { recognizeBrand } from '@/lib/brand-recognition'

interface ScannedProduct {
  id: string
  barcode: string
  name: string
  timestamp: number
}

interface BarcodeDialogProps {
  open: boolean
  onClose: () => void
  onProductScanned: (productName: string) => void
}

export function BarcodeDialog({ open, onClose, onProductScanned }: BarcodeDialogProps) {
  const [isScanning, setIsScanning] = useState(false)
  const [scannedCode, setScannedCode] = useState<string>('')
  const [productName, setProductName] = useState<string>('')
  const [isLookingUp, setIsLookingUp] = useState(false)
  const [manualBarcode, setManualBarcode] = useState('')
  const [continuousMode, setContinuousMode] = useState(false)
  const [scannedProducts, setScannedProducts] = useState<ScannedProduct[]>([])
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const isScannerRunning = useRef(false)
  const scannerStartRequestId = useRef(0)
  const openRef = useRef(open)
  const lastScannedCode = useRef<string>('')
  const lastScannedTime = useRef<number>(0)

  useEffect(() => {
    openRef.current = open
  }, [open])

  const lookupProduct = async (barcode: string, addToContinuousList: boolean = false) => {
    setIsLookingUp(true)
    
    try {
      if (!isValidBarcode(barcode)) {
        toast.error('Invalid barcode format')
        setIsLookingUp(false)
        return
      }

      // Local barcode lookup (Phase 1: on-device)
      let productName = lookupBarcodeWithLearning(barcode)
      
      if (!productName) {
        // Try brand recognition as fallback
        const brandMatch = recognizeBrand(barcode)
        if (brandMatch) {
          productName = `${brandMatch.commonName || brandMatch.category} Product`
        } else {
          // Generic description from barcode format
          productName = getGenericProductDescription(barcode)
        }
      }

      const cleanName = productName.trim()
      
      if (addToContinuousList) {
        const newProduct: ScannedProduct = {
          id: `scan-${Date.now()}-${Math.random()}`,
          barcode,
          name: cleanName,
          timestamp: Date.now()
        }
        setScannedProducts(prev => [...prev, newProduct])
        toast.success(`Scanned: ${cleanName}`)
      } else {
        setProductName(cleanName)
        toast.success('Product identified locally!')
      }
    } catch (error) {
      console.error('Product lookup error:', error)
      const fallbackName = getGenericProductDescription(barcode)
      
      if (addToContinuousList) {
        const newProduct: ScannedProduct = {
          id: `scan-${Date.now()}-${Math.random()}`,
          barcode,
          name: fallbackName,
          timestamp: Date.now()
        }
        setScannedProducts(prev => [...prev, newProduct])
        toast.info('Using generic product description')
      } else {
        setProductName(fallbackName)
        toast.info('Using generic product description')
      }
    } finally {
      setIsLookingUp(false)
    }
  }

  const startScanning = async () => {
    const requestId = ++scannerStartRequestId.current

    try {
      const html5QrCode = new Html5Qrcode('barcode-reader')
      scannerRef.current = html5QrCode

      const config = {
        fps: 10,
        qrbox: { width: 250, height: 150 },
        aspectRatio: 1.777778,
        formatsToSupport: [
          0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13
        ]
      }

      await html5QrCode.start(
        { facingMode: 'environment' },
        config,
        async (decodedText) => {
          if (!isScannerRunning.current) return
          
          const now = Date.now()
          if (decodedText === lastScannedCode.current && now - lastScannedTime.current < 3000) {
            return
          }
          
          lastScannedCode.current = decodedText
          lastScannedTime.current = now
          
          if (continuousMode) {
            await lookupProduct(decodedText, true)
          } else {
            setScannedCode(decodedText)
            await stopScanning()
            await lookupProduct(decodedText, false)
          }
        },
        undefined
      )

      // If the dialog closed while camera startup was in-flight, release it immediately.
      if (requestId !== scannerStartRequestId.current || !openRef.current) {
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
      toast.success(continuousMode ? 'Continuous scanning active' : 'Camera started - point at barcode')
    } catch (error) {
      console.error('Camera error:', error)
      toast.error('Camera access denied or unavailable')
      setIsScanning(false)
    }
  }

  const stopScanning = async () => {
    // Invalidate any in-flight start requests to avoid late camera activation.
    scannerStartRequestId.current += 1

    if (scannerRef.current && isScannerRunning.current) {
      try {
        await scannerRef.current.stop()
        scannerRef.current.clear()
        isScannerRunning.current = false
        setIsScanning(false)
      } catch (error) {
        console.error('Error stopping scanner:', error)
      }
    }

    scannerRef.current = null
    isScannerRunning.current = false
    setIsScanning(false)
  }

  const handleManualLookup = async () => {
    if (!manualBarcode.trim()) {
      toast.error('Please enter a barcode')
      return
    }
    
    setScannedCode(manualBarcode)
    await lookupProduct(manualBarcode, false)
  }

  const handleAddProduct = () => {
    if (productName.trim()) {
      onProductScanned(productName)
      toast.success(`Added ${productName}`)
      handleReset()
    }
  }

  const handleAddAllProducts = () => {
    if (scannedProducts.length === 0) return
    
    scannedProducts.forEach(product => {
      onProductScanned(product.name)
    })
    
    toast.success(`Added ${scannedProducts.length} products to list`)
    setScannedProducts([])
    handleClose()
  }

  const handleRemoveScannedProduct = (id: string) => {
    setScannedProducts(prev => prev.filter(p => p.id !== id))
  }

  const handleEditScannedProduct = (id: string, newName: string) => {
    setScannedProducts(prev =>
      prev.map(p => {
        if (p.id === id) {
          // Learn the correction for future scans
          if (newName !== p.name) {
            learnBarcode(p.barcode, newName)
            toast.success('Product name learned for future scans')
          }
          return { ...p, name: newName }
        }
        return p
      })
    )
  }

  const handleReset = () => {
    setScannedCode('')
    setProductName('')
    setManualBarcode('')
  }

  const handleClose = async () => {
    await stopScanning()
    handleReset()
    setScannedProducts([])
    setContinuousMode(false)
    onClose()
  }

  useEffect(() => {
    if (!open) {
      void stopScanning()
      handleReset()
      setScannedProducts([])
    }
  }, [open])

  useEffect(() => {
    if (continuousMode && !isScanning && !scannedCode) {
      void startScanning()
    } else if (!continuousMode && isScanning && scannedProducts.length === 0) {
      void stopScanning()
    }
  }, [continuousMode])

  useEffect(() => {
    return () => {
      void stopScanning()
    }
  }, [])

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          void handleClose()
        }
      }}
    >
      <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Barcode className="h-5 w-5" weight="bold" />
            Scan Barcode
          </DialogTitle>
          <DialogDescription>
            Scan a product barcode or enter it manually to quickly add items
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center justify-between bg-muted/50 rounded-lg p-3">
            <div className="flex items-center gap-2">
              <Label htmlFor="continuous-mode" className="text-sm font-medium cursor-pointer">
                Continuous Scanning
              </Label>
              <Badge variant="secondary" className="text-xs">
                Multiple Items
              </Badge>
            </div>
            <Switch
              id="continuous-mode"
              checked={continuousMode}
              onCheckedChange={setContinuousMode}
              disabled={isScanning || scannedCode !== ''}
            />
          </div>

          {continuousMode && scannedProducts.length > 0 && (
            <div className="bg-card border border-border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">Scanned Products</span>
                <Badge variant="secondary">{scannedProducts.length} items</Badge>
              </div>
              
              <ScrollArea className="h-48">
                <div className="space-y-2 pr-4">
                  <AnimatePresence mode="popLayout">
                    {scannedProducts.map((product) => (
                      <motion.div
                        key={product.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        className="flex items-center gap-2 bg-muted/50 rounded-md p-2"
                      >
                        <Check className="h-4 w-4 text-primary flex-shrink-0" weight="bold" />
                        <Input
                          value={product.name}
                          onChange={(e) => handleEditScannedProduct(product.id, e.target.value)}
                          className="flex-1 h-8 text-sm"
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 flex-shrink-0"
                          onClick={() => handleRemoveScannedProduct(product.id)}
                        >
                          <Trash className="h-4 w-4" />
                        </Button>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </ScrollArea>

              <Button
                onClick={handleAddAllProducts}
                className="w-full"
                disabled={scannedProducts.length === 0}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add All {scannedProducts.length} Products
              </Button>
            </div>
          )}

          {!continuousMode && !scannedCode ? (
            <>
              {!isScanning ? (
                <div className="space-y-4">
                  <Button
                    onClick={startScanning}
                    className="w-full h-12"
                    size="lg"
                  >
                    <Camera className="h-5 w-5 mr-2" />
                    Start Camera
                  </Button>

                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t border-border" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-background px-2 text-muted-foreground">
                        Or enter manually
                      </span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Input
                      type="text"
                      placeholder="Enter barcode number..."
                      value={manualBarcode}
                      onChange={(e) => setManualBarcode(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleManualLookup()}
                      className="flex-1"
                    />
                    <Button
                      onClick={handleManualLookup}
                      disabled={!manualBarcode.trim() || isLookingUp}
                      variant="secondary"
                    >
                      <MagnifyingGlass className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div 
                    id="barcode-reader" 
                    className="w-full rounded-lg overflow-hidden border-2 border-primary"
                  />
                  
                  <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                    <div className="h-2 w-2 rounded-full bg-destructive animate-pulse" />
                    <span>Scanning for barcodes...</span>
                  </div>

                  <Button
                    onClick={stopScanning}
                    variant="outline"
                    className="w-full"
                  >
                    <X className="h-4 w-4 mr-2" />
                    Stop Scanning
                  </Button>
                </div>
              )}
            </>
          ) : continuousMode && !scannedCode ? (
            <div className="space-y-4">
              {!isScanning ? (
                <Button
                  onClick={startScanning}
                  className="w-full h-12"
                  size="lg"
                  disabled={isLookingUp}
                >
                  <Camera className="h-5 w-5 mr-2" />
                  Start Continuous Scanning
                </Button>
              ) : (
                <>
                  <div 
                    id="barcode-reader" 
                    className="w-full rounded-lg overflow-hidden border-2 border-primary"
                  />
                  
                  <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                    <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                    <span>
                      {isLookingUp ? 'Identifying product...' : 'Scanning continuously...'}
                    </span>
                  </div>

                  <Button
                    onClick={stopScanning}
                    variant="outline"
                    className="w-full"
                  >
                    <X className="h-4 w-4 mr-2" />
                    Stop Scanning
                  </Button>
                </>
              )}
            </div>
          ) : !continuousMode && scannedCode ? (
            <div className="space-y-4">
              <div className="bg-muted rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-muted-foreground">Barcode</span>
                  <Badge variant="secondary" className="font-mono text-xs">
                    {scannedCode}
                  </Badge>
                </div>

                {isLookingUp ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <div className="h-1 w-1 rounded-full bg-primary animate-pulse" />
                    <span>Looking up product...</span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Product Name</label>
                    <Input
                      type="text"
                      value={productName}
                      onChange={(e) => setProductName(e.target.value)}
                      placeholder="Edit product name..."
                      className="font-medium"
                    />
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={handleAddProduct}
                  disabled={!productName.trim() || isLookingUp}
                  className="flex-1"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add to List
                </Button>
                <Button
                  onClick={handleReset}
                  variant="outline"
                >
                  <Barcode className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : null}

          <div className="bg-muted/50 rounded-lg p-3 space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Tips:</p>
            <ul className="text-xs text-muted-foreground space-y-0.5 list-disc list-inside">
              <li>Point camera at barcode with good lighting</li>
              <li>Hold steady until barcode is detected</li>
              <li>Enable continuous mode to scan multiple items quickly</li>
              <li>Most common barcodes (UPC, EAN) are supported</li>
            </ul>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
