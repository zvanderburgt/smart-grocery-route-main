# OCR Test Images Documentation

## Overview
The OCR Dialog includes built-in test images for debugging and testing OCR functionality without needing to take actual photos. This feature is invaluable for:

- **Development**: Test OCR improvements without manual setup
- **Regression Testing**: Ensure OCR continues working after code changes
- **User Testing**: Allow users to see how OCR works before using their own images
- **Bug Reports**: Reproduce OCR issues consistently

## Latest Updates (v2)
- **Improved Image Quality**: Test images now generated at 1200x1600px (up from 800x1000px) for better OCR accuracy
- **Enhanced Fonts**: Larger, clearer fonts (60-72px) with better anti-aliasing
- **Better Prompts**: Comprehensive LLM prompt with grocery category hints and clearer instructions
- **Improved Error Handling**: Better feedback when OCR fails with actionable tips

## How to Use

1. Open the app and click the camera icon to open the OCR dialog
2. Below the "Take Photo" button, you'll see a "SAMPLE TEST IMAGES" section
3. Click any of the four test image buttons:
   - **Simple List**: Clean typed grocery list
   - **With Quantities**: Items with quantity formats (x3, 2x, etc.)
   - **Handwritten**: Simulated handwritten list with cursive
   - **Challenging**: Lower quality with noise and rotation

4. The test image loads directly into the crop view
5. Crop and extract items just like a real photo
6. Review the results to verify OCR accuracy

## Test Image Types

### Simple List
- **Purpose**: Verify basic OCR functionality
- **Contains**: Clean, typed items without quantities
- **Expected Result**: 10 basic grocery items
- **Items**: Milk, Bread, Eggs, Butter, Cheese, Apples, Bananas, Chicken, Rice, Pasta

### With Quantities
- **Purpose**: Test quantity parsing and various formats
- **Contains**: Multiple quantity formats (2 Milk, Bread x 3, 4 Eggs)
- **Expected Result**: 10 items with correctly parsed quantities
- **Formats Tested**: "2 Item", "Item x 3", "4 bags of Item", "3x Item"

### Handwritten
- **Purpose**: Test recognition of non-typed text
- **Contains**: Italic font simulating handwritten text with slight variations
- **Expected Result**: 10 grocery items despite handwritten appearance
- **Challenge Level**: Medium - rotated and varied letter spacing

### Challenging
- **Purpose**: Test OCR under poor conditions
- **Contains**: Lower opacity, rotation, noise, poor contrast
- **Expected Result**: Should still detect most items despite quality issues
- **Challenge Level**: High - simulates real-world poor lighting/quality

## Implementation Details

The test images are generated dynamically using HTML5 Canvas API:
- No external image files needed
- Consistent test data across all sessions
- Can be modified for different test scenarios
- Generated as base64 PNG data URLs

### Image Specifications
- **Resolution**: 800x1000 pixels
- **Format**: PNG (data URL)
- **Text Rendering**: System fonts (Arial, Comic Sans MS)
- **Effects**: Rotation, opacity, noise (for challenging image)

## Debugging Workflow

When OCR fails or produces unexpected results:

1. **Start with Simple List**: Verify basic OCR functionality works
2. **Try With Quantities**: Test if quantity parsing is working
3. **Test Handwritten**: Check if text variation affects results
4. **Use Challenging**: Reproduce difficult real-world scenarios

**Common Failure Patterns:**
- **Simple List fails** → Core OCR issue (prompt, API, or image processing)
- **With Quantities fails** → Quantity parsing logic issue
- **Handwritten fails** → Text variation handling issue
- **Challenging fails** → May be acceptable (very poor quality)
- **All tests fail** → Check console for errors, verify spark.llm is available

**Debugging Tips:**
1. Open browser console (F12) to see detailed logs
2. Check for "Image size: XXkB" - should be under 200KB
3. Look for "Extracted X items:" message with item list
4. If you see "No grocery items detected", the AI couldn't find list items in the image
5. Try cropping tighter around just the text
6. Ensure the test image loaded correctly (you should see it in crop view)

## Extending Test Images

To add more test images, modify the `generateTestImage` function in `OCRDialog.tsx`:

```typescript
case 'newType':
  ctx.font = '40px Arial'
  items = ['Item 1', 'Item 2', ...]
  // Add custom rendering logic
  break
```

Then add a button in the test images section:

```tsx
<Button
  variant="outline"
  size="sm"
  onClick={() => handleTestImage('newType')}
  className="h-auto py-3 flex flex-col items-start gap-1"
>
  <span className="text-xs font-bold">New Type</span>
  <span className="text-[10px] text-muted-foreground">Description</span>
</Button>
```

## Best Practices

- **Use test images first** before reporting OCR bugs
- **Compare results** across different test image types
- **Document** which test images fail when reporting issues
- **Test after changes** to OCR logic or prompts
- **Create new test types** for specific edge cases you encounter

## Known Limitations

- Test images are simpler than real photos
- Don't test camera hardware or lighting issues
- May not catch all edge cases from real handwriting
- Generated text is more uniform than real-world lists

## Future Improvements

Potential enhancements to the test system:
- Add more variety in test images
- Include images with checkboxes/bullets
- Test multi-column lists
- Add images with background patterns
- Include images with crossed-out items
- Test different languages/scripts
