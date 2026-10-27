import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ShoppingCart, Brain, TrendUp } from '@phosphor-icons/react'

interface StatsCardProps {
  tripCount: number
  itemsLearned: number
}

export function StatsCard({ tripCount, itemsLearned }: StatsCardProps) {
  if (tripCount === 0) return null
  
  return (
    <Card className="p-4 bg-gradient-to-br from-primary/5 to-accent/5 border-primary/20">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Brain weight="fill" className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Learning Progress</p>
            <p className="text-xs text-muted-foreground">
              {tripCount} {tripCount === 1 ? 'trip' : 'trips'} completed
            </p>
          </div>
        </div>
        
        <div className="flex gap-2">
          {tripCount >= 2 && (
            <Badge variant="secondary" className="gap-1.5 bg-accent/20 text-accent-foreground">
              <TrendUp className="h-3 w-3" />
              <span className="text-xs font-semibold">Active</span>
            </Badge>
          )}
          {tripCount === 1 && (
            <Badge variant="secondary" className="gap-1.5">
              <ShoppingCart className="h-3 w-3" />
              <span className="text-xs">1 more trip</span>
            </Badge>
          )}
        </div>
      </div>
    </Card>
  )
}
