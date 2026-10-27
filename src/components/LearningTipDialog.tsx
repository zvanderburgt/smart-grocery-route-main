import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Lightbulb, CheckCircle, ArrowsClockwise, Sparkle, Microphone } from '@phosphor-icons/react'

interface LearningTipDialogProps {
  open: boolean
  onClose: () => void
}

export function LearningTipDialog({ open, onClose }: LearningTipDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-2">
            <Lightbulb weight="fill" className="h-6 w-6 text-accent" />
            <DialogTitle>How It Works</DialogTitle>
          </div>
          <DialogDescription className="sr-only">
            Learn how route learning and voice controls work while you shop.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="learning" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="learning">Learning</TabsTrigger>
            <TabsTrigger value="voice">Voice Commands</TabsTrigger>
          </TabsList>

          <TabsContent value="learning" className="space-y-4">
            <div className="space-y-4 text-left">
              <p className="text-base text-foreground">
                This app learns your store layout by tracking the order you check off items during your shopping trips.
              </p>
              
              <div className="space-y-3">
                <div className="flex gap-3">
                  <CheckCircle weight="fill" className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                  <div>
                    <p className="font-semibold text-foreground">While Shopping</p>
                    <p className="text-sm text-muted-foreground">
                      Check off items <strong>in the order you pick them up</strong> in the store
                    </p>
                  </div>
                </div>
                
                <div className="flex gap-3">
                  <ArrowsClockwise weight="bold" className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                  <div>
                    <p className="font-semibold text-foreground">After Shopping</p>
                    <p className="text-sm text-muted-foreground">
                      Clear completed items to save this trip's pattern
                    </p>
                  </div>
                </div>
                
                <div className="flex gap-3">
                  <Lightbulb weight="fill" className="h-5 w-5 text-accent mt-0.5 shrink-0" />
                  <div>
                    <p className="font-semibold text-foreground">After 2 Trips</p>
                    <p className="text-sm text-muted-foreground">
                      Lists will organize by store sections (produce, dairy, etc.)
                    </p>
                  </div>
                </div>
                
                <div className="flex gap-3">
                  <Sparkle weight="fill" className="h-5 w-5 text-accent mt-0.5 shrink-0" />
                  <div>
                    <p className="font-semibold text-foreground">After 3+ Trips</p>
                    <p className="text-sm text-muted-foreground">
                      Smart sections appear with AI-generated names based on your shopping patterns
                    </p>
                  </div>
                </div>
              </div>

              <p className="text-sm text-muted-foreground italic">
                The more you use it, the smarter it gets!
              </p>
            </div>
          </TabsContent>

          <TabsContent value="voice" className="space-y-4">
            <div className="space-y-4 text-left">
              <p className="text-base text-foreground">
                Use the microphone button for hands-free control while shopping.
              </p>
              
              <div className="space-y-3">
                <div className="flex gap-3">
                  <Microphone weight="fill" className="h-5 w-5 text-accent mt-0.5 shrink-0" />
                  <div>
                    <p className="font-semibold text-foreground">Add Items</p>
                    <p className="text-sm text-muted-foreground">
                      "Milk" • "3 apples" • "Rice x 2"
                    </p>
                  </div>
                </div>
                
                <div className="flex gap-3">
                  <CheckCircle weight="fill" className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                  <div>
                    <p className="font-semibold text-foreground">Check Items</p>
                    <p className="text-sm text-muted-foreground">
                      "Check milk" • "Mark apples as done"
                    </p>
                  </div>
                </div>
                
                <div className="flex gap-3">
                  <CheckCircle className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <p className="font-semibold text-foreground">Uncheck Items</p>
                    <p className="text-sm text-muted-foreground">
                      "Uncheck milk" • "Unmark apples"
                    </p>
                  </div>
                </div>
                
                <div className="flex gap-3">
                  <ArrowsClockwise weight="bold" className="h-5 w-5 text-accent mt-0.5 shrink-0" />
                  <div>
                    <p className="font-semibold text-foreground">Adjust Quantities</p>
                    <p className="text-sm text-muted-foreground">
                      "Increase milk by 2" • "Set apples to 5" • "Decrease bread by 1"
                    </p>
                  </div>
                </div>
                
                <div className="flex gap-3">
                  <Sparkle weight="fill" className="h-5 w-5 text-accent mt-0.5 shrink-0" />
                  <div>
                    <p className="font-semibold text-foreground">Navigate Sections</p>
                    <p className="text-sm text-muted-foreground">
                      "Show produce" • "Show all"
                    </p>
                  </div>
                </div>
                
                <div className="flex gap-3">
                  <ArrowsClockwise weight="bold" className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                  <div>
                    <p className="font-semibold text-foreground">List Actions</p>
                    <p className="text-sm text-muted-foreground">
                      "Clear completed" • "Show stats" • "Show favorites"
                    </p>
                  </div>
                </div>
              </div>

              <p className="text-sm text-muted-foreground italic">
                Tap the microphone button to start, then speak naturally!
              </p>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button onClick={onClose} className="w-full">
            Got it!
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
