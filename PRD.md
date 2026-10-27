# Product Requirements Document: Breadcrumb

A Progressive Web App that learns your grocery store layout over time by tracking the order you check off items, automatically organizing future lists to match your shopping path and grouping nearby items together.

**Experience Qualities**:
1. **Adaptive** - The app learns and improves with each shopping trip, becoming more personalized to your specific store layout
2. **Efficient** - Reduces shopping time by eliminating backtracking and grouping items by store section
3. **Effortless** - Simple list creation via typing or photo OCR, with automatic intelligent organization

**Complexity Level**: Light Application (multiple features with basic state)
This is a focused productivity tool with list management, OCR input, and an intelligent learning algorithm that tracks patterns. While it has sophisticated features, the core interaction model remains straightforward.

## Essential Features

### Manual List Entry
- **Functionality**: Add items to grocery list by typing item names or using voice input
- **Purpose**: Quick list building for routine shopping trips with hands-free option
- **Trigger**: User taps "Add Item" button, focuses on input field, or taps microphone button
- **Progression**: Focus input → Type item name or speak item name → Press enter/add → Item appears in list → Ready for next entry
- **Success criteria**: Items appear instantly, input clears for next entry, keyboard shortcuts work smoothly, voice recognition is accurate and responsive

### Voice Input
- **Functionality**: Add items to grocery list using voice commands
- **Purpose**: Hands-free item entry while cooking, carrying groceries, or multitasking
- **Trigger**: User taps microphone button
- **Progression**: Tap microphone → Permission granted → Speak item name → Voice recognition converts to text → Item automatically added → Microphone stops listening
- **Success criteria**: Accurate voice recognition, clear visual feedback during listening, graceful error handling for permission denied or no speech detected, automatically handles quantity patterns (e.g., "3 apples")

### Photo OCR Input
- **Functionality**: Capture photo of handwritten/printed list and extract items using AI vision, with built-in test images for debugging
- **Purpose**: Convert existing lists without manual typing
- **Trigger**: User taps camera icon button (labeled "Scan list (OCR)")
- **Progression**: Tap camera → Choose to take photo OR use sample test image → Crop image around text → AI processes image → Extracted items appear with confirmation dialog → User reviews/edits → Items added to list
- **Success criteria**: 90%+ accuracy on clear photos, graceful handling of unclear images, user can edit extracted items before adding, test images work for debugging and demonstrations
- **Test Images**: Four built-in sample images (Simple List, With Quantities, Handwritten, Challenging) for testing OCR without taking photos

### Barcode Scanning
- **Functionality**: Scan product barcodes to quickly add items by product
- **Purpose**: Fast item entry by scanning actual products at home or in-store, especially for branded items
- **Trigger**: User taps barcode icon button
- **Progression**: Tap barcode button → Dialog opens → User starts camera or enters barcode manually → Camera scans barcode → AI identifies product name → User can edit product name → Item added to list
- **Success criteria**: Accurate barcode detection (UPC, EAN, and other common formats), fallback to manual barcode entry, clear camera viewfinder with scanning indicator, graceful handling of unrecognized barcodes, product names are intelligently identified

### Recipe Integration
- **Functionality**: Paste recipe text and automatically extract ingredients with quantities
- **Purpose**: Generate shopping lists from recipes without manual entry
- **Trigger**: User taps recipe (sparkle) icon button
- **Progression**: Tap recipe button → Dialog opens → User pastes recipe text → User sets serving count → AI extracts ingredients with quantities and units → Ingredients added to list with proper quantities
- **Success criteria**: Accurately extracts ingredients from various recipe formats, handles quantity conversions, supports adjusting servings, combines duplicate ingredients intelligently

### Smart Item Suggestions
- **Functionality**: Automatically suggest items frequently purchased together with current list items
- **Purpose**: Remind users of commonly forgotten items based on purchase patterns
- **Trigger**: Displayed when list has items and sufficient relationship data exists (3+ learned relationships)
- **Progression**: Items added to list → Algorithm analyzes historical shopping pairs → Identifies items often bought together with current list → Top 5 suggestions displayed with confidence scores → User can quickly add suggested items with one tap or dismiss suggestions
- **Success criteria**: Suggestions are relevant and contextual, confidence scores reflect actual purchase patterns, easy to add or dismiss suggestions, reduces forgotten items

### Smart List Organization
- **Functionality**: Automatically group and sort items based on learned shopping patterns
- **Purpose**: Optimize shopping path to minimize backtracking
- **Trigger**: Runs automatically when list is created or items are added
- **Progression**: Items added → Algorithm analyzes historical check-off patterns → Items grouped by proximity → Groups ordered by typical shopping path → Visual sections displayed
- **Success criteria**: Groups become more accurate over time, items within same section appear together, order matches actual store layout after 3-5 shopping trips

### Learning Algorithm
- **Functionality**: Track the order items are checked off and store proximity relationships
- **Purpose**: Build knowledge graph of item locations in user's store
- **Trigger**: Each time user checks off an item
- **Progression**: Item checked → Timestamp recorded → Proximity to previously checked items calculated → Relationship strength updated → Pattern stored for future list organization
- **Success criteria**: Detectable improvement in list accuracy after each trip, handles variations in shopping order, adapts to store layout changes

### Check-off Progress
- **Functionality**: Mark items as collected during shopping
- **Purpose**: Track progress and feed learning algorithm
- **Trigger**: User taps item in list
- **Progression**: Tap item → Visual check animation → Item marked complete → Progress indicator updates → Next item highlighted → Check-off order recorded
- **Success criteria**: Immediate visual feedback, clear distinction between checked/unchecked, can undo mistakes

### Statistics and Trip History
- **Functionality**: View comprehensive learning statistics, trip history, and pattern insights
- **Purpose**: Give users visibility into what the app has learned and build trust in the algorithm
- **Trigger**: User taps statistics icon in header
- **Progression**: Tap stats → Full screen stats view opens → Three tabs: Overview (summary metrics, most frequent items, recent activity), Trip History (complete list of all trips with detailed item order), Patterns (strongest item relationships with confidence scores)
- **Success criteria**: Clear visualization of learning progress, ability to drill down into individual trip details, easy return to main list, helps users understand how the algorithm works

## Edge Case Handling

- **No Historical Data**: First-time users see alphabetically sorted lists with a hint that the app will learn their store layout over time
- **Incomplete Trips**: If user exits mid-shopping, partially completed lists still contribute partial pattern data to the learning algorithm
- **Multiple Stores**: Future consideration - for now assumes single primary store; patterns may blur if user shops at different stores
- **Item Name Variations**: "milk" vs "whole milk" vs "2% milk" - fuzzy matching attempts to group similar items, user can manually merge duplicates
- **Poor OCR Results**: If confidence is low, show warning and suggest manual review before adding items
- **Barcode Scanning Issues**: If barcode cannot be read, prompt user to try again with better lighting or enter barcode manually
- **Unrecognized Barcodes**: If product cannot be identified from barcode, use barcode number as product name and allow user to edit
- **Camera Permission Denied**: Clear error message for both OCR and barcode scanning if user denies camera access
- **Poor Lighting for Barcode**: Scanning indicator provides feedback if barcode detection is struggling
- **Recipe Parsing Errors**: If AI cannot parse recipe, show helpful error message and suggest reformatting the input
- **Duplicate Ingredients**: When adding from recipe, if item already exists in list, intelligently combine quantities
- **Unit Conversions**: Recipe parser extracts units (cups, tbsp, oz, etc.) and stores them with quantities for reference
- **Voice Recognition Unsupported**: If browser doesn't support Web Speech API, microphone button is hidden
- **Voice Permission Denied**: Clear error message if user denies microphone access, with instructions to enable in browser settings
- **No Speech Detected**: Friendly error message if silence detected, prompt to try again
- **Background Noise**: Voice recognition may struggle in noisy environments; suggest trying again in quieter setting
- **Very Long Lists**: Use virtual scrolling and collapsible groups for 50+ items
- **Backtracking Shopping Style**: Algorithm adapts to user's actual patterns, even if they shop inefficiently initially
- **Insufficient Suggestion Data**: Smart suggestions only appear when enough relationship data exists (3+ learned relationships); new users won't see suggestions initially
- **Irrelevant Suggestions**: Users can dismiss the entire suggestions card; it remembers dismissal state and can be re-enabled
- **Duplicate Suggestions**: Algorithm filters out items already on the list before suggesting

## Design Direction

The app should feel like a smart shopping companion - reliable, unobtrusive, and quietly intelligent. The design should evoke trust and efficiency with a clean, focused interface that doesn't distract during the hectic grocery shopping experience. Colors should be fresh and grocery-related, typography clear and scannable at a glance, and interactions should feel natural even with one hand while pushing a cart.

## Color Selection

Fresh, grocery-inspired palette with strong contrast for glanceability in bright store lighting. The app automatically adapts to light or dark mode based on system preference.

**Light Mode**:
- **Primary Color**: `oklch(0.55 0.19 145)` - Fresh vegetable green that evokes produce department freshness and healthy choices, used for primary actions and progress indicators
- **Secondary Colors**: 
  - Background: `oklch(0.98 0.01 145)` - Very light mint tint, barely perceptible but warmer than pure white
  - Card/Section: `oklch(0.96 0.01 145)` - Slightly deeper than background for layering
- **Accent Color**: `oklch(0.65 0.21 35)` - Warm golden-orange (like citrus) for camera button and important CTAs, draws attention without being aggressive

**Dark Mode** (automatically applied via system preference):
- **Primary Color**: `oklch(0.60 0.19 145)` - Slightly brighter green for visibility on dark backgrounds
- **Secondary Colors**:
  - Background: `oklch(0.15 0.01 145)` - Deep charcoal with subtle green tint
  - Card/Section: `oklch(0.18 0.01 145)` - Slightly lighter for layering
- **Accent Color**: `oklch(0.70 0.21 35)` - Brighter warm orange for dark mode visibility

**Foreground/Background Pairings**:
  - Light Mode Primary Green (`oklch(0.55 0.19 145)`): White text `oklch(1 0 0)` - Ratio 6.7:1 ✓
  - Light Mode Accent Orange (`oklch(0.65 0.21 35)`): White text `oklch(1 0 0)` - Ratio 5.2:1 ✓
  - Light Mode Background (`oklch(0.98 0.01 145)`): Dark text `oklch(0.25 0.02 145)` - Ratio 13.8:1 ✓
  - Dark Mode Background (`oklch(0.15 0.01 145)`): Light text `oklch(0.95 0.005 145)` - Ratio 13.5:1 ✓

## Font Selection

The typeface should be highly legible at various sizes and weights, optimized for scanning lists quickly, with a friendly but not playful character.

**Primary Font**: Space Grotesk - A geometric sans-serif with excellent readability and a modern, organized feel that suggests systematic intelligence

- **Typographic Hierarchy**:
  - H1 (App Title): Space Grotesk Bold / 24px / Normal letter spacing
  - H2 (Section Headers): Space Grotesk SemiBold / 18px / 0.01em letter spacing / uppercase
  - Body (List Items): Space Grotesk Medium / 16px / 0.005em letter spacing / Normal line height
  - Small (Metadata): Space Grotesk Regular / 13px / 0.01em letter spacing / Muted color
  - Button Text: Space Grotesk SemiBold / 15px / 0.02em letter spacing

## Animations

Animations should reinforce the learning aspect and provide satisfying feedback for check-off actions. Keep most motion subtle to avoid distraction during shopping.

- **Check-off gesture**: Smooth scale + fade transition (200ms) with a subtle bounce when item is checked
- **Smart reordering**: When app reorganizes list, items smoothly animate to new positions (300ms ease-out) so user can track where items moved
- **Section expand/collapse**: Accordion-style with smooth height transition (250ms)
- **Photo capture**: Satisfying camera shutter animation, then items fade in one-by-one as OCR processes
- **Loading states**: Subtle pulse on list items being processed, not a full-screen spinner

## Component Selection

- **Components**:
  - **Input + Button**: Custom styled Shadcn Input with integrated Button for item entry, sticky at top of screen
  - **Card**: Shadcn Card for grouping items by learned sections, with subtle borders, also used for statistics display
  - **Checkbox**: Shadcn Checkbox for check-off interactions, large touch targets (min 44px)
  - **Dialog**: Shadcn Dialog for OCR review/confirmation and recipe input before adding items to list
  - **Textarea**: Shadcn Textarea for pasting recipe text with adequate size for full recipes
  - **Progress**: Shadcn Progress bar showing shopping completion percentage and relationship strength
  - **Separator**: Shadcn Separator between learned sections and in statistics views
  - **Badge**: Shadcn Badge for indicating section names, item counts, and learning status
  - **ScrollArea**: Shadcn ScrollArea for smooth scrolling of long lists and trip history
  - **Button**: Shadcn Button with variants for primary (add), secondary (camera, recipe), ghost (item actions, navigation)
  - **Toast**: Sonner toasts for feedback (item added, list saved, OCR complete, recipe parsed)
  - **Tabs**: Shadcn Tabs for organizing statistics into Overview, Trip History, and Patterns views

- **Customizations**:
  - **Item Component**: Custom component combining checkbox, text, and action buttons (delete, edit) with swipe-to-delete gesture
  - **Camera Interface**: Custom full-screen camera view using device camera API
  - **Learning Indicator**: Custom progress visualization showing algorithm confidence for each section grouping
  - **Smart Suggestions Card**: Custom component with gradient background, displaying up to 5 suggested items with confidence percentages and quick-add buttons

- **States**:
  - Items: Default (unchecked), Checked (strikethrough + fade), Editing (input mode)
  - Buttons: Default, Hover (subtle lift), Active (scale down), Disabled (reduced opacity)
  - Voice Button: Idle (outline), Listening (solid destructive color with pulse animation)
  - Input: Default, Focused, Disabled (during voice input with "Listening..." placeholder)
  - Sections: Expanded (default), Collapsed (hidden items with count badge)
  - List: Empty (helpful illustration + onboarding), Learning (subtle badge), Optimized (confidence indicator)

- **Icon Selection**:
  - Plus (add item and add suggestions)
  - Camera (photo OCR)
  - Sparkle (recipe input and suggestions indicator)
  - Microphone (voice input - regular weight when idle, filled when listening)
  - Check (completed items)
  - Trash (delete)
  - PencilSimple (edit)
  - ArrowsClockwise (reorder/refresh)
  - Lightbulb (learning indicator)
  - CaretDown/CaretUp (section collapse/expand)
  - ChartBar (statistics/analytics)
  - Calendar (trip history)
  - Fire (most frequent items)
  - Clock (recent activity)
  - TrendUp (patterns and relationships)
  - Package (item count indicators)
  - ShoppingCart (trip indicators)
  - ArrowLeft (navigation back)
  - X (dismiss suggestions card)

- **Spacing**:
  - Section padding: `p-4` (16px)
  - Item padding: `py-3 px-4` (12px vertical, 16px horizontal)
  - Section gap: `gap-2` (8px) between items in same section
  - Group gap: `gap-6` (24px) between different sections
  - Input height: `h-12` (48px) for comfortable typing
  - Bottom safe area: `pb-20` to ensure content isn't hidden by phone home indicators

- **Mobile**:
  - Single column layout throughout
  - Sticky header with add input always visible
  - Sticky floating action button for camera in bottom-right
  - Swipe gestures for item actions (swipe left to delete)
  - Large touch targets (44px minimum)
  - Bottom sheet for OCR review instead of centered dialog
  - Pull-to-refresh for manual list reordering
  - Collapsible sections save vertical space
