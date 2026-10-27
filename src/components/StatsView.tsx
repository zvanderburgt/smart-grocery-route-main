import { useState, useMemo } from 'react'
import { useLocalStorage } from '@/hooks/use-local-storage'
import type { ItemRelationship, ShoppingTrip } from '@/lib/types'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { 
  ArrowLeft, 
  ShoppingCart, 
  TrendUp, 
  Clock, 
  Package,
  Calendar,
  ChartBar,
  Lightbulb,
  Fire
} from '@phosphor-icons/react'
import { motion } from 'framer-motion'
import { format, formatDistanceToNow } from 'date-fns'

interface StatsViewProps {
  onBack: () => void
}

export function StatsView({ onBack }: StatsViewProps) {
  const [relationships] = useLocalStorage<ItemRelationship[]>('item-relationships', [])
  const [trips] = useLocalStorage<ShoppingTrip[]>('shopping-trips', [])
  const [selectedTrip, setSelectedTrip] = useState<string | null>(null)

  const safeRelationships = relationships ?? []
  const safeTrips = trips ?? []

  const stats = useMemo(() => {
    const totalTrips = safeTrips.length
    const totalItems = new Set(
      safeTrips.flatMap(trip => trip.items.map(item => item.name))
    ).size
    const totalRelationships = safeRelationships.length

    const averageItemsPerTrip = totalTrips > 0
      ? Math.round(safeTrips.reduce((sum, trip) => sum + trip.items.length, 0) / totalTrips)
      : 0

    const mostFrequentItems = getMostFrequentItems(safeTrips)
    const strongestRelationships = getStrongestRelationships(safeRelationships)
    const recentActivity = getRecentActivity(safeTrips)

    return {
      totalTrips,
      totalItems,
      totalRelationships,
      averageItemsPerTrip,
      mostFrequentItems,
      strongestRelationships,
      recentActivity
    }
  }, [safeRelationships, safeTrips])

  const selectedTripData = useMemo(() => {
    if (!selectedTrip) return null
    return safeTrips.find(trip => trip.id === selectedTrip)
  }, [selectedTrip, safeTrips])

  if (safeTrips.length === 0) {
    return (
      <div className="min-h-screen bg-background">
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border">
          <div className="max-w-4xl mx-auto px-4 py-4">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={onBack}
                className="h-9 w-9"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <h1 className="text-2xl font-bold tracking-tight">Learning Statistics</h1>
            </div>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 py-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-16 space-y-4"
          >
            <div className="text-6xl">📊</div>
            <h2 className="text-xl font-semibold text-foreground">No Data Yet</h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              Complete at least one shopping trip by checking off items to start building your learning statistics.
            </p>
            <div className="pt-4">
              <Button onClick={onBack} variant="outline">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to List
              </Button>
            </div>
          </motion.div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background pb-8">
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={onBack}
              className="h-9 w-9"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1">
              <h1 className="text-2xl font-bold tracking-tight">Learning Statistics</h1>
              <p className="text-sm text-muted-foreground">Your shopping patterns and insights</p>
            </div>
            <Badge variant="secondary" className="gap-1.5">
              <Lightbulb weight="fill" className="h-3.5 w-3.5 text-accent" />
              <span className="text-xs font-semibold">{stats.totalTrips} Trips</span>
            </Badge>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6">
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="trips">Trip History</TabsTrigger>
            <TabsTrigger value="patterns">Patterns</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Total Trips</CardTitle>
                    <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold tracking-tight">{stats.totalTrips}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Unique Items</CardTitle>
                    <Package className="h-4 w-4 text-muted-foreground" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold tracking-tight">{stats.totalItems}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Avg Items/Trip</CardTitle>
                    <ChartBar className="h-4 w-4 text-muted-foreground" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold tracking-tight">{stats.averageItemsPerTrip}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Relationships</CardTitle>
                    <TrendUp className="h-4 w-4 text-muted-foreground" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold tracking-tight">{stats.totalRelationships}</div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Fire className="h-5 w-5 text-accent" weight="fill" />
                  Most Frequent Items
                </CardTitle>
                <CardDescription>Items you buy most often</CardDescription>
              </CardHeader>
              <CardContent>
                {stats.mostFrequentItems.length > 0 ? (
                  <div className="space-y-3">
                    {stats.mostFrequentItems.slice(0, 8).map((item, index) => (
                      <div key={item.name} className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="flex items-center justify-center w-6 h-6 rounded-full bg-accent/10 text-accent text-xs font-bold">
                            {index + 1}
                          </div>
                          <span className="font-medium capitalize">{item.name}</span>
                        </div>
                        <Badge variant="secondary">{item.count} trips</Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No data available yet</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-primary" />
                  Recent Activity
                </CardTitle>
                <CardDescription>Your last 5 shopping trips</CardDescription>
              </CardHeader>
              <CardContent>
                {stats.recentActivity.length > 0 ? (
                  <div className="space-y-3">
                    {stats.recentActivity.map((activity) => (
                      <div key={activity.id} className="flex items-start justify-between py-2">
                        <div className="space-y-1">
                          <div className="font-medium">{format(activity.date, 'MMM d, yyyy')}</div>
                          <div className="text-sm text-muted-foreground">
                            {activity.itemCount} items • {formatDistanceToNow(activity.date, { addSuffix: true })}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedTrip(activity.id)
                            const tabsList = document.querySelector('[value="trips"]') as HTMLElement
                            tabsList?.click()
                          }}
                        >
                          View
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No activity yet</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="trips" className="space-y-4">
            {selectedTripData ? (
              <Card>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <CardTitle>Trip Details</CardTitle>
                      <CardDescription>
                        {format(selectedTripData.date, 'EEEE, MMMM d, yyyy • h:mm a')}
                      </CardDescription>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedTrip(null)}
                    >
                      View All
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center gap-4 text-sm">
                      <div className="flex items-center gap-2">
                        <Package className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{selectedTripData.items.length} items</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">
                          {formatDistanceToNow(selectedTripData.date, { addSuffix: true })}
                        </span>
                      </div>
                    </div>
                    <Separator />
                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                        Items in order collected
                      </h4>
                      <ScrollArea className="h-[400px]">
                        <div className="space-y-2 pr-4">
                          {selectedTripData.items.map((item, index) => (
                            <div
                              key={`${item.name}-${index}`}
                              className="flex items-center gap-3 py-2 px-3 rounded-lg bg-muted/50"
                            >
                              <div className="flex items-center justify-center w-7 h-7 rounded-full bg-primary/10 text-primary text-xs font-bold">
                                {index + 1}
                              </div>
                              <span className="font-medium capitalize flex-1">{item.name}</span>
                              <span className="text-xs text-muted-foreground">
                                {format(item.checkedAt, 'h:mm a')}
                              </span>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="h-5 w-5" />
                    All Shopping Trips
                  </CardTitle>
                  <CardDescription>Complete history of your shopping trips</CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[600px]">
                    <div className="space-y-3 pr-4">
                      {[...safeTrips].reverse().map((trip) => (
                        <motion.div
                          key={trip.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="p-4 rounded-lg border border-border hover:border-primary/50 transition-colors cursor-pointer"
                          onClick={() => setSelectedTrip(trip.id)}
                        >
                          <div className="flex items-start justify-between mb-2">
                            <div className="space-y-1">
                              <div className="font-semibold">{format(trip.date, 'MMM d, yyyy')}</div>
                              <div className="text-sm text-muted-foreground">
                                {format(trip.date, 'h:mm a')}
                              </div>
                            </div>
                            <Badge variant="outline">{trip.items.length} items</Badge>
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {formatDistanceToNow(trip.date, { addSuffix: true })}
                          </div>
                          <div className="mt-3 flex flex-wrap gap-1">
                            {trip.items.slice(0, 5).map((item, idx) => (
                              <Badge key={idx} variant="secondary" className="text-xs capitalize">
                                {item.name}
                              </Badge>
                            ))}
                            {trip.items.length > 5 && (
                              <Badge variant="secondary" className="text-xs">
                                +{trip.items.length - 5} more
                              </Badge>
                            )}
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="patterns" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendUp className="h-5 w-5 text-primary" />
                  Strongest Item Relationships
                </CardTitle>
                <CardDescription>
                  Items frequently picked up together
                </CardDescription>
              </CardHeader>
              <CardContent>
                {stats.strongestRelationships.length > 0 ? (
                  <div className="space-y-3">
                    {stats.strongestRelationships.map((rel, index) => (
                      <div
                        key={`${rel.item1}-${rel.item2}`}
                        className="p-3 rounded-lg bg-muted/50 space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold">
                              {index + 1}
                            </div>
                            <div className="font-medium capitalize">
                              {rel.item1} + {rel.item2}
                            </div>
                          </div>
                          <Badge variant="secondary">
                            {Math.round(rel.strength * 100)}% confidence
                          </Badge>
                        </div>
                        <div className="w-full bg-secondary rounded-full h-2">
                          <div
                            className="bg-primary h-2 rounded-full transition-all"
                            style={{ width: `${rel.strength * 100}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Complete more trips to discover patterns
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>How Relationships Work</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm text-muted-foreground">
                <p>
                  The app learns which items are located near each other by tracking the order you check them off during your shopping trips.
                </p>
                <div className="space-y-2">
                  <div className="flex items-start gap-2">
                    <div className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold mt-0.5">
                      1
                    </div>
                    <div>
                      <div className="font-semibold text-foreground">Check off items as you shop</div>
                      <div>Items checked within 2 minutes are considered "near each other"</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold mt-0.5">
                      2
                    </div>
                    <div>
                      <div className="font-semibold text-foreground">Relationships strengthen over time</div>
                      <div>The more trips you complete, the more confident the groupings become</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold mt-0.5">
                      3
                    </div>
                    <div>
                      <div className="font-semibold text-foreground">Your list auto-organizes</div>
                      <div>Future lists group related items together in your store's layout order</div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}

function getMostFrequentItems(trips: ShoppingTrip[]) {
  const itemCounts = new Map<string, number>()

  trips.forEach(trip => {
    trip.items.forEach(item => {
      itemCounts.set(item.name, (itemCounts.get(item.name) || 0) + 1)
    })
  })

  return Array.from(itemCounts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
}

function getStrongestRelationships(relationships: ItemRelationship[]) {
  return [...relationships]
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 10)
}

function getRecentActivity(trips: ShoppingTrip[]) {
  return [...trips]
    .sort((a, b) => b.date - a.date)
    .slice(0, 5)
    .map(trip => ({
      id: trip.id,
      date: trip.date,
      itemCount: trip.items.length
    }))
}
