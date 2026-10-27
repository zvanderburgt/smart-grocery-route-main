import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Warning, X } from '@phosphor-icons/react'
import { ScrollArea } from '@/components/ui/scroll-area'

interface OCRErrorDialogProps {
  open: boolean
  onClose: () => void
  errorType: 'no_items' | 'image_too_large' | 'empty_response' | 'invalid_format' | 'llm_error' | 'model_load_error' | 'general'
  errorMessage?: string
  imageSizeKB?: number
}

export function OCRErrorDialog({ open, onClose, errorType, errorMessage, imageSizeKB }: OCRErrorDialogProps) {
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
      
      case 'image_too_large':
        return {
          title: 'Image Too Large',
          description: imageSizeKB 
            ? `The cropped image is ${imageSizeKB}KB, which exceeds the limit for AI processing.`
            : 'The image is too large for AI processing.',
          suggestions: [
            'Crop a much smaller area - focus only on the text',
            'Remove any margins, borders, or extra space around the list',
            'If the list is long, try processing it in sections',
            'Avoid including backgrounds, tables, or decorative elements',
            'Recommended: crop should be just the list text, nothing else',
            'Target image size: under 150KB after cropping'
          ],
          icon: '📏'
        }
      
      case 'empty_response':
        return {
          title: 'AI Returned Empty Response',
          description: 'The AI processed the image but did not return any result. This usually means the image was too large or unclear.',
          suggestions: [
            'Try a smaller crop area with only the text visible',
            'Ensure the cropped area contains clear, readable text',
            'Test with one of the sample images to verify the system is working',
            'If the list is long, split it into multiple smaller images',
            'Check that the image quality is sufficient',
            'Avoid images with very low resolution'
          ],
          icon: '❌'
        }
      
      case 'invalid_format':
        return {
          title: 'AI Response Format Error',
          description: 'The AI returned a response in an unexpected format. This can happen with very unclear images.',
          suggestions: [
            'Try a different crop area',
            'Ensure the image contains a clear list of items',
            'Test with a sample image first',
            'Check that the text is legible',
            'Avoid images with complex layouts or tables',
            'Use a simpler, cleaner source image'
          ],
          icon: '⚠️'
        }
      
      case 'model_load_error':
        return {
          title: 'AI Model Failed to Load',
          description: errorMessage || 'The on-device AI model could not be loaded. This may be due to a network issue or insufficient device memory.',
          suggestions: [
            'Check your internet connection — the model downloads on first use (~256MB)',
            'Ensure you have at least 1GB of free RAM',
            'Try refreshing the page and attempting again',
            'Chrome or Edge with WebGPU support will be faster than other browsers',
            'If the problem persists, try a different browser'
          ],
          icon: '🤖'
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
