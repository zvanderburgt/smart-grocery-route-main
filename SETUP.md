# Breadcrumb - Setup Guide

This document explains how to get the **Breadcrumb** app running locally and configured for Google Sheets sync between devices.

---

## 🚀 Quick Start (Local Development)

### Prerequisites

- **Node.js** v18+ (recommended: v20+)
- **npm** v9+ (comes with Node.js)
- A **Google account** (for Google Sheets sync feature)

### Installation

```bash
# Navigate to project directory
cd /Users/zack/Projects/breadcrumb-main

# Install dependencies (already done if node_modules exists)
npm install

# Start development server
npm run dev
```

The app will be available at **http://localhost:5173**

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server on port 5173 |
| `npm run dev:5000` | Start dev server on port 5000 |
| `npm run dev:5173` | Start dev server on port 5173 (explicit host) |
| `npm run build` | Build for production (runs TypeScript check + Vite build) |
| `npm run preview` | Preview production build locally |
| `npm run lint` | Run ESLint |
| `npm run test` | Run unit tests with Vitest |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run generate-icons` | Generate PWA icons |
| `npm run kill` | Kill process on port 5000 |

---

## ☁️ Google Sheets Sync Setup (Required for Multi-Device Sync)

The app uses Google Sheets as a sync backend to share grocery lists between devices (e.g., you and your wife's phones). This is optional but recommended.

### 1. Google Cloud Console Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. **Enable Google Sheets API**:
   - Navigate to **APIs & Services** → **Library**
   - Search for "Google Sheets API" → Click **Enable**
4. **Create OAuth 2.0 Client ID**:
   - Go to **APIs & Services** → **Credentials**
   - Click **+ Create Credentials** → **OAuth client ID**
   - Application type: **Web application**
   - Name: "Breadcrumb"
   - **Authorized JavaScript origins**:
     - `http://localhost:5173` (for local dev)
     - Add your production domain (e.g., `https://your-app.netlify.app`)
   - **Authorized redirect URIs**:
     - `http://localhost:5173`
     - Add your production domain
   - Click **Create** and copy the **Client ID**

### 2. Configure Environment Variable

The project already has a `.env` file with a Client ID:

```bash
# .env (already exists in project root)
VITE_GOOGLE_CLIENT_ID=600675453918-ohm8ocf92huis1lg91t9r1puen9olh8f.apps.googleusercontent.com
```

> **Note**: The `VITE_` prefix is required for Vite to expose the variable to the client. If you create your own OAuth credentials, replace the value above.

### 3. Create & Configure Google Sheet

1. Go to [Google Sheets](https://sheets.google.com)
2. Create a **new blank spreadsheet**
3. Name it "Shared Grocery List" (or any name you prefer)
4. **Set up column headers** in Row 1 (columns A–I):

   | A | B | C | D | E | F | G | H | I |
   |---|---|---|---|---|---|---|---|---|
   | id | name | checked | checkedAt | addedAt | category | quantity | updatedAt | updatedBy |

   You can copy-paste this tab-separated row:
   ```
   id	name	checked	checkedAt	addedAt	category	quantity	updatedAt	updatedBy
   ```

5. **Share the sheet** with both Google accounts:
   - Click **Share** (top-right)
   - Add both email addresses
   - Set permission to **Editor** (not Viewer or Commenter)
   - Click **Send**

6. **Copy the Sheet ID** from the URL:
   ```
   https://docs.google.com/spreadsheets/d/{SHEET_ID_HERE}/edit
   ```
   The Sheet ID is the 44-character string between `/d/` and `/edit`

### 4. Connect in the App

1. Open the app (http://localhost:5173)
2. Click the **gear icon ⚙️** (Settings) in the header
3. Scroll to **"Google Sheets Sync"** section
4. Paste the **Sheet ID** in the input field
5. Click **Connect** button
6. Sign in with your Google account
7. Grant permission: "See and edit your Google Sheets"
8. Click **Sync Now** to perform initial sync
9. Wait for "Synced" status (green badge)

---

## 📱 PWA Features

The app is a **Progressive Web App** with:

- ✅ **Offline support** – Works without internet (localStorage primary)
- ✅ **Installable** – "Add to Home Screen" on mobile
- ✅ **Auto-update** – Service worker handles updates
- ✅ **Background sync** – Syncs when app reopens

### To Install on Mobile:
1. Open http://localhost:5173 (or your deployed URL) on phone
2. iOS: Safari → Share → "Add to Home Screen"
3. Android: Chrome menu → "Install app" or "Add to Home Screen"

---

## 🏗️ Project Structure

```
breadcrumb-main/
├── src/
│   ├── App.tsx              # Main app component
│   ├── main.tsx             # Entry point
│   ├── components/          # React components
│   │   ├── ui/              # Shadcn UI components
│   │   ├── *.tsx            # Feature components
│   ├── hooks/               # Custom React hooks
│   │   ├── use-google-sheets-sync.ts
│   │   ├── use-grocery-items.ts
│   │   ├── use-local-storage.ts
│   │   ├── use-pwa-state.ts
│   │   ├── use-sections.ts
│   │   ├── use-voice-commands.ts
│   │   └── use-voice-input.ts
│   ├── lib/                 # Core logic
│   │   ├── learning-algorithm.ts   # Smart list organization
│   │   ├── brand-learning.ts       # Brand recognition
│   │   ├── category-mapper.ts      # Item categorization
│   │   ├── google-sheets.ts        # Google Sheets API
│   │   ├── sync-engine.ts          # Sync logic
│   │   ├── types.ts                # TypeScript types
│   │   └── utils.ts                # Utility functions
│   ├── test/                # Unit tests
│   └── styles/              # CSS styles
├── public/                  # Static assets
├── dist/                    # Production build output
├── .env                     # Environment variables (VITE_GOOGLE_CLIENT_ID)
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tailwind.config.js
├── PRD.md                   # Product Requirements
├── DESIGN.md                # Design specifications
├── GOOGLE_SHEETS_SETUP.md   # Detailed Google Sheets setup
└── SETUP.md                 # This file
```

---

## 🧪 Running Tests

```bash
# Run all tests once
npm run test

# Run tests in watch mode (re-runs on file changes)
npm run test:watch

# Run with coverage report
npm run test:coverage
```

---

## 📦 Production Build

```bash
# Build for production
npm run build

# Preview production build locally
npm run preview
```

The production build outputs to the `dist/` directory, ready for static hosting (Netlify, Vercel, GitHub Pages, etc.).

---

## 🚀 Deployment

### Netlify / Vercel / Static Hosting

1. Connect your repository to the hosting platform
2. Add environment variable: `VITE_GOOGLE_CLIENT_ID` (your OAuth Client ID)
3. Add your production domain to **OAuth authorized origins** in Google Cloud Console
4. Deploy – the build command is `npm run build`, output directory is `dist`

### Important Notes for Production

- The app is a **static PWA** – no backend server needed
- Google OAuth only works on HTTPS (or localhost)
- Add your production domain to authorized origins in Google Cloud Console
- The service worker (`sw.js`) is auto-generated by `vite-plugin-pwa`

---

## 🔧 Troubleshooting

| Issue | Solution |
|-------|----------|
| **Port 5173 in use** | Run `npm run kill` or change port in `vite.config.ts` |
| **"Google Client ID not configured"** | Verify `.env` has `VITE_GOOGLE_CLIENT_ID` and restart dev server |
| **"Please enter a Google Sheet ID first"** | Paste Sheet ID in Settings before clicking Connect |
| **"Connection failed" / "Sync failed"** | Check browser console; verify Sheet shared as Editor; verify Sheets API enabled |
| **"Invalid Sheet ID"** | Ensure you copied the 44-char ID from URL correctly |
| **Changes not syncing** | Click **Sync Now** manually; check both devices online; verify Editor access |
| **Items duplicated** | Clear learning data (Settings → Data Management) and re-sync |

### Debug Tools

- **Diagnostics Panel**: Available in app Settings → Shows sync status, errors, localStorage data
- **Browser Console**: Check for detailed error messages
- **Google Cloud Console**: APIs → Sheets API → Metrics for quota usage

---

## 📚 Key Documentation Files

| File | Purpose |
|------|---------|
| `PRD.md` | Product Requirements Document – all features & specs |
| `DESIGN.md` | Design system – colors, fonts, components, animations |
| `GOOGLE_SHEETS_SETUP.md` | Detailed Google Sheets sync setup guide |
| `SECURITY.md` | Security considerations |
| `components.json` | Shadcn UI component config |

---

## 💡 How It Works (Architecture)

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

### Core Features

- **Smart List Organization** – Learns your store layout from check-off order
- **Photo OCR** – Scan handwritten/printed lists (uses Hugging Face transformers)
- **Barcode Scanning** – Add items by scanning product barcodes
- **Recipe Import** – Paste recipe text, extracts ingredients with quantities
- **Voice Input** – Add items hands-free via Web Speech API
- **Smart Suggestions** – Suggests items frequently bought together
- **Statistics & Trip History** – View learning progress and patterns
- **Google Sheets Sync** – Share lists between devices in real-time

---

## 🔐 Security Notes

- **OAuth tokens** stored in memory only (not localStorage)
- **Sheet ID** stored in localStorage (not sensitive)
- **No server** – fully client-side, no backend to secure
- **Scope limited** to `spreadsheets` only
- **Two-user model** – only shared accounts can access the sheet

---

## 📝 License

MIT License – see `LICENSE` file for details.

---

## 🆘 Need Help?

1. Check browser DevTools console for errors
2. Verify all setup steps in `GOOGLE_SHEETS_SETUP.md`
3. Check Google Cloud Console → APIs → Sheets API → Metrics
4. The app uses minimal API calls (batch reads/writes, 30s polling)

*Last updated: 2026-07-30*