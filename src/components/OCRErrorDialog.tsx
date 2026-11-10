import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Warning, X } from '@phosphor-icons/react'
import { ScrollArea } from '@/components/ui/scroll-area'

interface OCRErrorDialogProps {
  open: boolean
  onClose: () => void
  errorType: 'no_items' | 'llm_error' | 'general'
  errorMessage?: string
}

export function OCRErrorDialog({ open, onClose, errorType, errorMessage }: OCRErrorDialogProps) {
  const getErrorDetails = () => {
    switch (errorType) {
      case 'no_items':
        return {
          title: 'No Grocery Items Detected',
          description: 'The AI could not find any grocery items in the image you provided.',
          suggestions: [
            'Crop more tightly around the text - remove extra white space and background',
            'Ensure the text is clear and in focus',
            'Check that lighting is good - avoid shadows and glare',
            'Make sure the text is dark on a light background (or vice versa)',
            'Try one of the test images first to verify OCR is working',
            'If handwritten, ensure letters are clearly formed and separated',
            'Avoid excessive rotation - keep text upright',
            'Ensure the list contains actual grocery items, not other text'
          ],
          icon: '🔍'
        }
      
      case 'llm_error':
        return {
          title: 'AI Processing Error',
          description: errorMessage || 'An error occurred while processing the image with AI.',
          suggestions: [
            'Check your internet connection',
            'Try a smaller crop area',
            'Wait a moment and try again',
            'If the error persists, try a different image',
            'Test with a sample image to verify the system is working',
            'Report persistent errors if the sample images also fail'
          ],
          icon: '🔧'
        }
      
      default:
        return {
          title: 'OCR Processing Error',
          description: errorMessage || 'An unexpected error occurred while processing the image.',
          suggestions: [
            'Try taking a new photo',
            'Ensure the image is clear and well-lit',
            'Test with a sample image first',
            'Check your internet connection',
            'Try a smaller crop area',
            'If the problem persists, report the issue'
          ],
          icon: '❗'
        }
    }
  }

  const details = getErrorDetails()

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg max-h-[85dvh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="text-4xl">{details.icon}</div>
            <div className="flex-1">
              <DialogTitle className="text-lg">{details.title}</DialogTitle>
              <DialogDescription className="mt-1">
                {details.description}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 max-h-[400px] pr-4">
          <div className="space-y-4 py-4">
            <div>
              <h4 className="text-sm font-semibold mb-2 text-foreground">💡 Suggestions to fix:</h4>
              <ul className="space-y-2">
                {details.suggestions.map((suggestion, index) => (
                  <li key={index} className="flex gap-2 text-sm text-muted-foreground">
                    <span className="text-accent font-bold shrink-0">•</span>
                    <span>{suggestion}</span>
                  </li>
                ))}
              </ul>
            </div>

            {errorMessage && errorType !== 'llm_error' && (
              <div className="mt-4 p-3 bg-muted rounded-lg">
                <h4 className="text-xs font-semibold mb-1 text-muted-foreground">Technical Details:</h4>
                <p className="text-xs font-mono text-muted-foreground break-all">{errorMessage}</p>
              </div>
            )}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button onClick={onClose} className="w-full" size="lg">
            <X className="h-4 w-4 mr-2" />
            Close &amp; Try Again
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
