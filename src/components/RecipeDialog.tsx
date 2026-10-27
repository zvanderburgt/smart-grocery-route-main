import { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Checkbox } from '@/components/ui/checkbox'
import { Plus, Minus, Sparkle, Link, Heart } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { SavedRecipe } from '@/lib/types'
import { extractRecipe } from '@/lib/recipe-extractor'

interface RecipeDialogProps {
  open: boolean
  onClose: () => void
  onRecipeParsed: (ingredients: Array<{ name: string; quantity: number; unit?: string }>, saveOptions?: { save: boolean; name: string; url?: string; servings: number }) => void
}

export function RecipeDialog({ open, onClose, onRecipeParsed }: RecipeDialogProps) {
  const [activeTab, setActiveTab] = useState<'text' | 'url'>('url')
  const [recipeText, setRecipeText] = useState('')
  const [recipeUrl, setRecipeUrl] = useState('')
  const [recipeName, setRecipeName] = useState('')
  const [servings, setServings] = useState(4)
  const [isProcessing, setIsProcessing] = useState(false)
  const [saveAsFavorite, setSaveAsFavorite] = useState(false)

  const fetchRecipeFromUrl = async () => {
    if (!navigator.onLine) {
      toast.error('Recipe URL import requires an internet connection')
      return
    }

    if (!recipeUrl.trim()) {
      toast.error('Please enter a recipe URL')
      return
    }

    let url: URL
    try {
      url = new URL(recipeUrl.trim())
    } catch {
      toast.error('Invalid URL format')
      return
    }

    setIsProcessing(true)

    try {
      // Step 1: Fetch the recipe page
      const response = await fetch(url.toString(), {
        method: 'GET',
        mode: 'cors'
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch recipe: ${response.status} ${response.statusText}`)
      }

      const html = await response.text()
      
      // Step 2: Try local extraction (schema.org + regex) - PHASE 1: On-device processing
      const localResult = extractRecipe(html)
      
      if (localResult && localResult.ingredients.length > 0) {
        // Successfully extracted locally!
        toast.success(`Extracted ${localResult.ingredients.length} ingredients locally`)
        
        const title = localResult.title || 'Recipe'
        const saveOptions = saveAsFavorite ? {
          save: true,
          name: recipeName || title,
          url: recipeUrl,
          servings: localResult.servings
        } : undefined

        onRecipeParsed(localResult.ingredients, saveOptions)
        
        setRecipeUrl('')
        setRecipeName('')
        setSaveAsFavorite(false)
        onClose()
        return
      }

      // Step 3: Fallback to cloud LLM only if local extraction failed
      if (!navigator.onLine) {
        toast.error('Cloud recipe parsing is unavailable while offline')
        setIsProcessing(false)
        return
      }

      toast.info('Local extraction didn\'t find enough data, trying cloud AI...')
      
      const parsePrompt = window.spark.llmPrompt`You are a recipe parser. Extract all ingredients from this recipe webpage HTML.

HTML Content:
${html.substring(0, 50000)}

Instructions:
1. Look for JSON-LD schema markup (application/ld+json) which often contains structured recipe data
2. Look for common recipe HTML structures with classes like "ingredient", "recipe-ingredient", etc.
3. Extract the recipe title, servings, and ingredients with quantities and units

Return a JSON object with:
{
  "title": "Recipe Title",
  "servings": number,
  "ingredients": [
    {"name": "ingredient", "quantity": number, "unit": "unit"},
    ...
  ]
}`

      const result = await window.spark.llm(parsePrompt, 'gpt-4o', true)
      const parsed = JSON.parse(result)

      if (!parsed.ingredients || parsed.ingredients.length === 0) {
        toast.error('No ingredients found in recipe')
        setIsProcessing(false)
        return
      }

      const title = parsed.title || 'Recipe'
      const saveOptions = saveAsFavorite ? {
        save: true,
        name: recipeName || title,
        url: recipeUrl,
        servings: parsed.servings || servings
      } : undefined

      onRecipeParsed(parsed.ingredients, saveOptions)
      toast.success(`Added ${parsed.ingredients.length} ingredients from ${title}`)
      
      setRecipeUrl('')
      setRecipeName('')
      setSaveAsFavorite(false)
      onClose()
    } catch (error) {
      console.error('Recipe URL fetch error:', error)
      if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
        toast.error('Unable to fetch recipe. The website may block direct access. Try copying the recipe text instead.')
      } else if (error instanceof SyntaxError) {
        toast.error('Invalid recipe format found')
      } else {
        toast.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
    } finally {
      setIsProcessing(false)
    }
  }

  const handleParseText = async () => {
    if (!navigator.onLine) {
      toast.error('Recipe text parsing requires an internet connection')
      return
    }

    if (!recipeText.trim()) {
      toast.error('Please enter a recipe')
      return
    }

    setIsProcessing(true)

    try {
      const prompt = window.spark.llmPrompt`You are a recipe parser. Extract all ingredients from this recipe text and convert them to a structured format.

Recipe text:
${recipeText}

Number of servings: ${servings}

Extract each ingredient with its quantity and unit. Normalize quantities to be numeric values. For example:
- "2 cups flour" → name: "flour", quantity: 2, unit: "cups"
- "1 lb chicken breast" → name: "chicken breast", quantity: 1, unit: "lb"
- "salt to taste" → name: "salt", quantity: 1, unit: "pinch"
- "3-4 cloves garlic" → name: "garlic", quantity: 3.5, unit: "cloves"

Return ONLY a JSON object with a single property "ingredients" that contains an array of ingredient objects. Format:
{
  "ingredients": [
    {"name": "ingredient name", "quantity": numeric_value, "unit": "unit_string"},
    ...more ingredients
  ]
}`

      const response = await window.spark.llm(prompt, 'gpt-4o', true)
      const parsed = JSON.parse(response)

      if (!parsed.ingredients || parsed.ingredients.length === 0) {
        toast.error('No ingredients found in recipe')
        setIsProcessing(false)
        return
      }

      const saveOptions = saveAsFavorite ? {
        save: true,
        name: recipeName || 'Custom Recipe',
        servings: servings
      } : undefined

      onRecipeParsed(parsed.ingredients, saveOptions)
      toast.success(`Added ${parsed.ingredients.length} ingredients from recipe`)
      
      setRecipeText('')
      setRecipeName('')
      setServings(4)
      setSaveAsFavorite(false)
      onClose()
    } catch (error) {
      console.error('Recipe parsing error:', error)
      toast.error('Failed to parse recipe. Please try again.')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleSubmit = () => {
    if (activeTab === 'url') {
      fetchRecipeFromUrl()
    } else {
      handleParseText()
    }
  }

  const adjustServings = (delta: number) => {
    setServings(Math.max(1, servings + delta))
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90dvh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkle weight="fill" className="h-5 w-5 text-accent" />
            Add Recipe
          </DialogTitle>
          <DialogDescription>
            Import a recipe from a URL or paste the text to automatically extract ingredients.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'text' | 'url')} className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="url" className="gap-2">
              <Link className="h-4 w-4" />
              Recipe URL
            </TabsTrigger>
            <TabsTrigger value="text" className="gap-2">
              <Sparkle className="h-4 w-4" />
              Paste Text
            </TabsTrigger>
          </TabsList>

          <TabsContent value="url" className="flex-1 overflow-y-auto space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="recipe-url">Recipe URL</Label>
              <Input
                id="recipe-url"
                type="url"
                value={recipeUrl}
                onChange={(e) => setRecipeUrl(e.target.value)}
                placeholder="https://example.com/recipe"
                className="text-base"
              />
              <p className="text-xs text-muted-foreground">
                Enter a URL from popular recipe sites like AllRecipes, Food Network, NYT Cooking, etc.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="servings-url">Number of Servings</Label>
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-9 w-9"
                  onClick={() => adjustServings(-1)}
                  disabled={servings <= 1}
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <Input
                  id="servings-url"
                  type="number"
                  value={servings}
                  onChange={(e) => setServings(Math.max(1, parseInt(e.target.value) || 1))}
                  className="text-center w-20 h-9"
                  min="1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-9 w-9"
                  onClick={() => adjustServings(1)}
                >
                  <Plus className="h-4 w-4" />
                </Button>
                <span className="text-sm text-muted-foreground">servings</span>
              </div>
            </div>

            <div className="space-y-3 pt-2 border-t border-border">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="save-favorite-url"
                  checked={saveAsFavorite}
                  onCheckedChange={(checked) => setSaveAsFavorite(checked === true)}
                />
                <Label 
                  htmlFor="save-favorite-url" 
                  className="text-sm font-medium cursor-pointer flex items-center gap-1.5"
                >
                  <Heart weight={saveAsFavorite ? "fill" : "regular"} className="h-4 w-4 text-accent" />
                  Save as favorite
                </Label>
              </div>
              
              {saveAsFavorite && (
                <div className="space-y-2 pl-6">
                  <Label htmlFor="recipe-name-url" className="text-xs">Recipe Name (optional)</Label>
                  <Input
                    id="recipe-name-url"
                    value={recipeName}
                    onChange={(e) => setRecipeName(e.target.value)}
                    placeholder="Will be auto-detected from URL"
                    className="h-9 text-sm"
                  />
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="text" className="flex-1 overflow-y-auto space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="recipe-text">Recipe or Ingredient List</Label>
              <Textarea
                id="recipe-text"
                value={recipeText}
                onChange={(e) => setRecipeText(e.target.value)}
                placeholder="Paste recipe here... Example:&#10;&#10;Ingredients:&#10;2 cups all-purpose flour&#10;1 tsp baking powder&#10;1/2 cup butter&#10;3 eggs&#10;1 cup sugar&#10;1 tsp vanilla extract"
                className="min-h-[300px] font-mono text-sm resize-none"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="servings-text">Number of Servings</Label>
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-9 w-9"
                  onClick={() => adjustServings(-1)}
                  disabled={servings <= 1}
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <Input
                  id="servings-text"
                  type="number"
                  value={servings}
                  onChange={(e) => setServings(Math.max(1, parseInt(e.target.value) || 1))}
                  className="text-center w-20 h-9"
                  min="1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-9 w-9"
                  onClick={() => adjustServings(1)}
                >
                  <Plus className="h-4 w-4" />
                </Button>
                <span className="text-sm text-muted-foreground">servings</span>
              </div>
            </div>

            <div className="space-y-3 pt-2 border-t border-border">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="save-favorite-text"
                  checked={saveAsFavorite}
                  onCheckedChange={(checked) => setSaveAsFavorite(checked === true)}
                />
                <Label 
                  htmlFor="save-favorite-text" 
                  className="text-sm font-medium cursor-pointer flex items-center gap-1.5"
                >
                  <Heart weight={saveAsFavorite ? "fill" : "regular"} className="h-4 w-4 text-accent" />
                  Save as favorite
                </Label>
              </div>
              
              {saveAsFavorite && (
                <div className="space-y-2 pl-6">
                  <Label htmlFor="recipe-name-text" className="text-xs">Recipe Name</Label>
                  <Input
                    id="recipe-name-text"
                    value={recipeName}
                    onChange={(e) => setRecipeName(e.target.value)}
                    placeholder="e.g., Mom's Chocolate Chip Cookies"
                    className="h-9 text-sm"
                  />
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} disabled={isProcessing}>
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={(activeTab === 'url' ? !recipeUrl.trim() : !recipeText.trim()) || isProcessing} 
            className="gap-2"
          >
            {isProcessing ? (
              <>
                <Sparkle weight="fill" className="h-4 w-4 animate-pulse" />
                Processing...
              </>
            ) : (
              <>
                <Sparkle weight="fill" className="h-4 w-4" />
                Add to List
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
