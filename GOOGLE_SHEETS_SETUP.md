# Breadcrumb - Google Sheets Sync Setup Guide

This document explains how to set up and use the Google Sheets sync feature for shared grocery lists between you and your wife.

---

## Prerequisites

### 1. Google Cloud Console Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable the **Google Sheets API**:
   - Navigate to **APIs & Services** → **Library**
   - Search for "Google Sheets API" → Click **Enable**
4. Create OAuth 2.0 Client ID:
   - Go to **APIs & Services** → **Credentials**
   - Click **+ Create Credentials** → **OAuth client ID**
   - Application type: **Web application**
   - Name: "Breadcrumb"
   - Authorized JavaScript origins: Add your domain (e.g., `https://your-app.netlify.app`, `http://localhost:5173` for local dev)
   - Authorized redirect URIs: Add `https://your-app.netlify.app`, `http://localhost:5173`
   - Click **Create** and save the **Client ID**

### 2. Environment Configuration

Create a `.env` file in the project root:

```bash
# .env
VITE_GOOGLE_CLIENT_ID=your-client-id-here.apps.googleusercontent.com
```

**Note**: The `VITE_` prefix is required for Vite to expose the variable to the client.

---

## Google Sheet Setup

### 1. Create the Shared Spreadsheet

1. Go to [Google Sheets](https://sheets.google.com)
2. Create a **new blank spreadsheet**
3. Name it "Shared Grocery List" (or whatever you prefer)

### 2. Set Up Column Headers

In **Row 1**, add these exact headers in columns A through I:

| A | B | C | D | E | F | G | H | I |
|---|---|---|---|---|---|---|---|---|
| id | name | checked | checkedAt | addedAt | category | quantity | updatedAt | updatedBy |

You can copy-paste this row:
```
id	name	checked	checkedAt	addedAt	category	quantity	updatedAt	updatedBy
```

### 3. Share with Both Accounts

1. Click **Share** (top-right)
2. Add both Google accounts (yours and your wife's)
3. Set permission to **Editor** (not Viewer or Commenter)
4. Click **Send**

### 4. Copy the Sheet ID

From the URL, copy the long string between `/d/` and `/edit`:
```
https://docs.google.com/spreadsheets/d/{THIS_IS_THE_SHEET_ID}/edit
```

---

## App Configuration

### 1. Enter Sheet ID in App

1. Open the app
2. Click the **gear icon** (Settings) in the header
3. Scroll to **"Google Sheets Sync"** section
3. Paste the Sheet ID in the input field
4. Click **Save** (or just click Connect)

### 2. Connect Google Account

1. Click **Connect** button
2. Sign in with your Google account
3. Grant permission to "See and edit your Google Sheets"
4. You should see "Connected" status with your email

### 3. Initial Sync

1. Click **Sync Now** button
2. Wait for "Synced" status (green badge)
3. The app will now auto-sync every 30 seconds when open

---

## How It Works

### Sync Behavior

| Scenario | Behavior |
|----------|----------|
| **You add item** | Appears on wife's device within 30s (or click Sync Now) |
| **Wife checks off item** | Shows as checked on your device |
| **Both edit same item** | Last-write-wins (most recent change wins) |
| **Offline** | Changes stored locally, sync when back online |
| **Reopen app** | Auto-syncs on load |

### Data Stored in Google Sheets

Each row represents a grocery item:
- **id**: Unique identifier (e.g., `item-1700000000-abc123`)
- **name**: Item name (e.g., "Milk")
- **checked**: TRUE/FALSE
- **checkedAt**: Timestamp when checked (Unix ms)
- **addedAt**: Timestamp when added (Unix ms)
- **category**: Store section (e.g., "dairy", "produce")
- **quantity**: Number (optional)
- **updatedAt**: Last modification timestamp
- **updatedBy**: Email of user who last modified

### Status Indicators

In the app header, you'll see a badge:
- 🟢 **Synced** - Up to date
- 🟡 **Syncing...** - Sync in progress
- 🔴 **Error** - Check Diagnostics panel for details
- ⚪ **Offline** - Not connected

---

## Troubleshooting

### "Google Client ID not configured"
- Add `VITE_GOOGLE_CLIENT_ID` to `.env` file
- Restart dev server: `npm run dev`

### "Please enter a Google Sheet ID first"
- Paste the Sheet ID in Settings before clicking Connect

### "Connection failed" / "Sync failed"
- Check browser console for detailed error
- Verify Sheet is shared with **Editor** access
- Verify Google Sheets API is enabled in Cloud Console
- Check OAuth authorized origins match your domain

### "Invalid Sheet ID"
- Ensure you copied the correct ID from URL
- Format: `1aBcD...` (44 characters, letters/numbers)

### Changes not appearing on other device
- Click **Sync Now** manually
- Check both devices are online
- Verify both Google accounts have Editor access

### Items duplicated after sync
- This shouldn't happen with last-write-wins
- If it does: Clear learning data (Settings → Data Management) and re-sync

---

## Local Development

```bash
# Install dependencies
npm install

# Start dev server (runs on http://localhost:5173)
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

**Important**: Add `http://localhost:5173` to your OAuth authorized origins in Google Cloud Console for local testing.

---

## Deployment Notes

### Netlify/Vercel/Static Hosting

1. Add `VITE_GOOGLE_CLIENT_ID` as environment variable in hosting platform
2. Add your production domain to OAuth authorized origins
3. Deploy normally - this is a static PWA

### PWA Features

- Works offline (localStorage primary)
- Installable on mobile (Add to Home Screen)
- Background sync when app reopens
- Service worker caches assets

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     React App (PWA)                         │
├─────────────────────────────────────────────────────────────┤
│  useGoogleSheetsSync Hook                                   │
│  ├─ localStorage (primary, instant)                        │
│  ├─ Google Sheets API (sync backend)                       │
│  │   ├─ OAuth2 (GIS) - user auth                           │
│  │   ├─ Read/Write sheets.googleapis.com                   │
│  │   └─ Batch updates for efficiency                       │
│  └─ Sync Engine (last-write-wins merge)                    │
└─────────────────────────────────────────────────────────────┘
```

---

## Security Notes

- **OAuth tokens** stored in memory only (not localStorage)
- **Sheet ID** stored in localStorage (not sensitive)
- **No server** - fully client-side, no backend to secure
- **Scope limited** to `spreadsheets` only
- **Two-user model** - only shared accounts can access

---

## Future Enhancements (Not Implemented)

- [ ] Real-time sync via WebSockets (requires backend)
- [ ] Conflict resolution UI (show both versions)
- [ ] Multi-sheet support (different stores)
- [ ] Sync sections, favorites, learned brands
- [ ] QR code sharing for easy setup
- [ ] Family sharing (>2 users)

---

## Support

If you encounter issues:
1. Check browser DevTools console for errors
2. Verify all setup steps above
3. Check Google Cloud Console → APIs → Sheets API → Metrics for quota usage
4. The app uses minimal API calls (batch reads/writes, 30s polling)

---

*Last updated: 2026-07-28*