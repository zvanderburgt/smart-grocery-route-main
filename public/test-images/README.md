# OCR Test Images

This directory contains documentation and expected results for the built-in OCR test images.

## Overview

The OCR Dialog includes **dynamically generated test images** that developers and users can use to test OCR functionality without taking actual photos. These images are generated using HTML5 Canvas at high resolution (1200x1600px) with large, clear fonts for optimal OCR accuracy.

## 🆕 Latest Updates (v2)
- **Higher Resolution**: Test images now 1200x1600px (up from 800x1000px)
- **Larger Fonts**: 60-72px fonts for better AI recognition
- **Improved Prompts**: Enhanced LLM prompt with grocery category hints
- **Better Error Handling**: More helpful error messages with debugging tips

## Test Images Available

### 1. Simple List
**Purpose**: Basic OCR functionality test
- Clean typed grocery list
- 10 items with no quantities
- High contrast black text on white background
- Expected 100% accuracy

**Expected Items**: Milk, Bread, Eggs, Butter, Cheese, Apples, Bananas, Chicken, Rice, Pasta

### 2. With Quantities
**Purpose**: Test quantity parsing
- Items with various quantity formats
- Tests "2 Item", "Item x 3", "4 bags of Item", "3x Item" formats
- 10 items with different quantity notations
- Expected 100% accuracy with correct quantity parsing

**Expected Items**: 2 Milk, Bread x 3, 4 Eggs, Apples x 5, 2 bags of Rice, 3x Pasta, 6 cans of Tomato Sauce, Butter, Cheese x 2, 4 Onions

### 3. Handwritten
**Purpose**: Test handwritten text recognition
- Simulated handwritten appearance using italic fonts
- Slight rotation and position variations
- 10 items with realistic variation
- Expected 90%+ accuracy

**Expected Items**: Milk, Bread, Eggs, Butter, Cheese, Apples, Chicken breast, Ground beef, Lettuce, Tomatoes

### 4. Challenging
**Purpose**: Test OCR robustness under poor conditions
- Reduced opacity (60-90%)
- Random rotation on each line
- Added noise/grain
- 9 items with difficult reading conditions
- Expected 60-90% accuracy (acceptable to miss some items)

**Expected Items**: Milk, Bread, Eggs, Butter, Cheese, Apples, Bananas, Chicken, Rice

## How to Access

1. Open the app
2. Click the camera icon to open OCR dialog
3. Look for "SAMPLE TEST IMAGES" section below the "Take Photo" button
4. Click any of the four test image buttons
5. Crop and extract just like a real photo

## Troubleshooting

### If Test Images Don't Work

**1. Check Browser Console (F12)**
Look for these messages:
- ✅ "Image size: XXkB" - should be under 200KB
- ✅ "Extracted X items:" followed by the item list
- ❌ "No grocery items detected" - AI couldn't find items in the image
- ❌ "Image too large" - crop area is too large
- ❌ "AI returned empty response" - LLM API issue

**2. Common Issues & Solutions**

| Issue | Possible Causes | Solutions |
|-------|----------------|-----------|
| "No items detected" | Image unclear, poor crop, API issue | Try tighter crop around center, check console for errors |
| "Image too large" | Crop area includes too much | Crop smaller area around just the text |
| "AI returned empty response" | Network issue, API unavailable | Check internet connection, try again |
| All tests fail | JavaScript error, API access | Check console for errors, refresh page |
| Test image blank | Canvas rendering issue | Try different browser, check console |

**3. Debugging Steps**
1. Open browser console (F12) before testing
2. Click a test image button
3. Verify the image appears in the crop view
4. Use default crop or crop tighter around center
5. Click "Extract Items" and watch console for messages
6. If items are detected, they'll appear in the review step

### For Bug Reports
When reporting OCR issues, include:
- ✅ Which test images work/fail
- ✅ Console logs (all messages)
- ✅ Screenshots of the crop area used
- ✅ Expected vs actual items extracted
- ✅ Browser and version

## Files in This Directory

- `README.md` - This file
- `TESTING_GUIDE.md` - Detailed testing documentation
- `simple-list-expected.txt` - Expected results for Simple List
- `quantities-list-expected.txt` - Expected results for With Quantities
- `handwritten-list-expected.txt` - Expected results for Handwritten
- `challenging-list-expected.txt` - Expected results for Challenging

## Implementation

Test images are generated in `src/components/OCRDialog.tsx` using the `generateTestImage()` function. They are created dynamically as base64 PNG data URLs.

### To Add New Test Images

1. Edit the `generateTestImage()` function
2. Add a new case for your test type
3. Define the items array and rendering logic
4. Add a button in the test images section
5. Create an expected results file here

## Best Practices

✅ **DO**:
- Use test images before reporting OCR bugs
- Test all four image types after OCR changes
- Document which tests pass/fail
- Create new test types for specific edge cases

❌ **DON'T**:
- Skip testing with these images before deployment
- Assume real photos work if test images work
- Report bugs without testing these first
- Modify test images without updating expected results

## Known Limitations

- Test images are simpler than real photos
- Don't test camera hardware issues
- Can't replicate all real-world variations
- Handwritten test is simulated, not real handwriting

## Future Improvements

Potential additions:
- Images with checkboxes/bullets
- Multi-column lists
- Different languages
- Lists with crossed-out items
- Images with background patterns
- More realistic handwriting simulation
