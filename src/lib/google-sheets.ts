/**
 * Google Sheets API Client
 * Handles authentication and API calls to Google Sheets
 */

// Global type declarations for Google Identity Services
declare global {
  interface Window {
    google: {
      accounts: {
        oauth2: {
          initTokenClient: (config: any) => any;
          revoke: (token: string, callback: () => void) => void;
        };
      };
    };
  }
}

const SCOPES = 'https://www.googleapis.com/auth/spreadsheets';
const DISCOVERY_DOC = 'https://sheets.googleapis.com/$discovery/rest?version=v4';

// Storage keys for persisting token across redirect
// Use localStorage so the token (and sign-in state) persists across browser restarts,
// not just within a single tab session.
const TOKEN_STORAGE_KEY = 'google_sheets_access_token';
const TOKEN_EXPIRY_KEY = 'google_sheets_token_expiry';
const OAUTH_STATE_KEY = 'google_sheets_oauth_state';

function getStorage(): Storage {
  return localStorage;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
  error?: string;
}

let tokenClient: any = null;
let accessToken: string | null = null;
let tokenExpiry: number = 0;
let storedClientId: string | null = null; // Store clientId for redirect

// Store resolver for popup mode (unused in redirect but kept for compatibility)
let tokenResolver: ((token: string) => void) | null = null;
let tokenRejecter: ((error: Error) => void) | null = null;

/**
 * Generate a random state parameter for OAuth security
 */
function generateState(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Build the Google OAuth 2.0 authorization URL for manual redirect
 */
function buildOAuthUrl(clientId: string, options?: { forceConsent?: boolean }): string {
  const state = generateState();
  getStorage().setItem(OAUTH_STATE_KEY, state);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: window.location.origin,
    response_type: 'token', // Implicit flow - token in URL fragment
    scope: SCOPES,
    state,
    include_granted_scopes: 'true',
    access_type: 'online',
    prompt: options?.forceConsent ? 'consent' : '',
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/**
 * Initialize Google Identity Services (GIS) - for token refresh only
 * We use manual redirect for initial auth, GIS for silent refresh
 */
export function initGoogleSheetsAuth(clientId: string): Promise<void> {
  storedClientId = clientId; // Store for later redirect
  return new Promise((resolve, reject) => {
    // Wait for GIS library to load
    const checkGIS = () => {
      if (window.google?.accounts?.oauth2) {
        // Try to restore token from storage (after redirect)
        const storedToken = getStorage().getItem(TOKEN_STORAGE_KEY);
        const storedExpiry = getStorage().getItem(TOKEN_EXPIRY_KEY);
        if (storedToken && storedExpiry) {
          const expiry = parseInt(storedExpiry, 10);
          if (Date.now() < expiry - 60000) {
            accessToken = storedToken;
            tokenExpiry = expiry;
            console.log('[GoogleSheets] Restored token from localStorage');
          }
        }

        // Initialize GIS token client once, with the callback GIS actually uses
        // to deliver token responses. Per GIS docs, requestAccessToken()
        // overrides can tweak prompt/scope/etc, but the response callback lives
        // on initTokenClient itself.
        tokenClient = window.google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: SCOPES,
          callback: (response: TokenResponse) => {
            console.log('[GoogleSheets] GIS token callback:', response);
            if (response.access_token) {
              accessToken = response.access_token;
              tokenExpiry = Date.now() + response.expires_in * 1000;
              getStorage().setItem(TOKEN_STORAGE_KEY, accessToken);
              getStorage().setItem(TOKEN_EXPIRY_KEY, String(tokenExpiry));
              if (tokenResolver) {
                tokenResolver(accessToken);
                tokenResolver = null;
                tokenRejecter = null;
              }
              return;
            }

            const message = response.error || 'Failed to get Google access token';
            if (tokenRejecter) {
              tokenRejecter(new Error(message));
              tokenResolver = null;
              tokenRejecter = null;
            }
          },
          error_callback: () => {
            if (tokenRejecter) {
              tokenRejecter(new Error('Google token request failed'));
              tokenResolver = null;
              tokenRejecter = null;
            }
          },
        });
        console.log('[GoogleSheets] GIS token client initialized for silent refresh');
        resolve();
      } else {
        setTimeout(checkGIS, 100);
      }
    };
    checkGIS();
  });
}

/**
 * Get valid access token
 * - If cached and valid: return it
 * - If not signed in: redirect to Google OAuth (manual redirect)
 * - If expired: use GIS silent refresh (prompt: '')
 */
export function getAccessToken(options?: { forceConsent?: boolean }): Promise<string> {
  if (!tokenClient) {
    throw new Error('Google Sheets auth not initialized. Call initGoogleSheetsAuth first.');
  }

  // Return cached token if still valid (with 60s buffer)
  if (accessToken && Date.now() < tokenExpiry - 60000) {
    console.log('[GoogleSheets] Using cached token');
    return Promise.resolve(accessToken);
  }

  // If we have an expired token, try silent refresh first (GIS prompt: '')
  if (accessToken) {
    console.log('[GoogleSheets] Token expired, attempting silent refresh...');
    return new Promise<string>((resolve, reject) => {
      tokenResolver = resolve;
      tokenRejecter = reject;

      tokenClient!.requestAccessToken({
        prompt: '', // Silent refresh - no UI
      });
    }).catch((err) => {
      console.log('[GoogleSheets] Silent refresh failed, will redirect:', err.message);
      // Fall through to manual redirect below - will throw below
      return Promise.reject(err);
    });
  }

  // No valid token - do MANUAL REDIRECT to Google OAuth
  console.log('[GoogleSheets] No valid token, redirecting to Google OAuth...');
  if (!storedClientId) {
    throw new Error('Client ID not initialized. Call initGoogleSheetsAuth first.');
  }
  // This will redirect the page
  redirectToGoogleOAuth(storedClientId);
  throw new Error('Redirecting to OAuth');
}

/**
 * Sign out / revoke token
 */
export function signOut(): void {
  if (accessToken) {
    window.google.accounts.oauth2.revoke(accessToken, () => {
      accessToken = null;
      tokenExpiry = 0;
      getStorage().removeItem(TOKEN_STORAGE_KEY);
      getStorage().removeItem(TOKEN_EXPIRY_KEY);
      getStorage().removeItem(OAUTH_STATE_KEY);
    });
  }
}

/**
 * Check if user is signed in
 */
export function isSignedIn(): boolean {
  return !!accessToken && Date.now() < tokenExpiry;
}

/**
 * Manually redirect to Google OAuth consent screen
 * More reliable than GIS redirect mode
 */
export function redirectToGoogleOAuth(clientId: string): void {
  // Sheet config already stored in sessionStorage by connect()

  const redirectUri = window.location.origin;
  const scope = encodeURIComponent('https://www.googleapis.com/auth/spreadsheets');
  // Sheet id/name are transient per-connect-attempt values, not the token - sessionStorage is fine here.
  const sheetId = sessionStorage.getItem('google_sheets_sheet_id') || '';
  const sheetName = sessionStorage.getItem('google_sheets_sheet_name') || 'GroceryList';
  const state = encodeURIComponent(JSON.stringify({ sheetId, sheetName }));

  const oauthUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&response_type=token` +  // Implicit flow - returns token in URL fragment
    `&scope=${scope}` +
    `&prompt=consent` +  // Force consent screen
    `&state=${state}`;

  console.log('[GoogleSheets] Redirecting to Google OAuth:', oauthUrl);
  window.location.href = oauthUrl;
}

/**
 * Handle OAuth redirect return - extract token from URL fragment
 * Call this on app initialization
 */
export function handleOAuthRedirect(): Promise<string | null> {
  return new Promise((resolve) => {
    console.log('[GoogleSheets] handleOAuthRedirect called, location.hash:', window.location.hash);
    console.log('[GoogleSheets] location.href:', window.location.href);

    // Check if we're returning from OAuth (token in URL fragment)
    const hash = window.location.hash;
    if (hash && hash.includes('access_token=')) {
      console.log('[GoogleSheets] OAuth redirect detected, extracting token');

      // Parse fragment: #access_token=xxx&expires_in=3600&token_type=Bearer&scope=...
      const params = new URLSearchParams(hash.substring(1));
      const tokenFromUrl = params.get('access_token');
      const expiresIn = parseInt(params.get('expires_in') || '3600', 10);
      const tokenType = params.get('token_type');
      const scope = params.get('scope');

      console.log('[GoogleSheets] Parsed token params:', { accessToken: !!tokenFromUrl, expiresIn, tokenType, scope });

      if (tokenFromUrl) {
        // Store token
        const expiry = Date.now() + expiresIn * 1000;
        getStorage().setItem(TOKEN_STORAGE_KEY, tokenFromUrl);
        getStorage().setItem(TOKEN_EXPIRY_KEY, String(expiry));

        // Also set in-memory
        accessToken = tokenFromUrl;
        tokenExpiry = expiry;

        // Clean URL (remove hash)
        window.history.replaceState({}, document.title, window.location.pathname + window.location.search);

        console.log('[GoogleSheets] Token obtained from redirect, expires in', expiresIn, 'seconds');
        resolve(tokenFromUrl);
        return;
      }
    }

    // No token in fragment - check localStorage
    const storedToken = getStorage().getItem(TOKEN_STORAGE_KEY);
    const storedExpiry = getStorage().getItem(TOKEN_EXPIRY_KEY);
    console.log('[GoogleSheets] Checking localStorage:', { storedToken: !!storedToken, storedExpiry });
    if (storedToken && storedExpiry) {
      const expiry = parseInt(storedExpiry, 10);
      if (Date.now() < expiry - 60000) {
        accessToken = storedToken;
        tokenExpiry = expiry;
        console.log('[GoogleSheets] Token restored from localStorage');
        resolve(storedToken);
        return;
      }
    }

    console.log('[GoogleSheets] No valid token found');
    resolve(null);
  });
}

/**
 * Make authenticated request to Google Sheets API with retry logic for quota errors
 */
async function sheetsRequest<T>(
  method: string,
  url: string,
  body?: any,
  retryCount = 0
): Promise<T> {
  const token = await getAccessToken();

  const response = await fetch(url, {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Unknown error' }));
    const errorMessage = error.error?.message || response.statusText;

    // Check if it's a quota/rate limit error
    const isQuotaError = response.status === 429 ||
                         errorMessage.includes('quota') ||
                         errorMessage.includes('rate limit') ||
                         errorMessage.includes('Quota exceeded');

    if (isQuotaError && retryCount < 3) {
      const delay = Math.min(1000 * Math.pow(2, retryCount), 30000); // Exponential backoff, max 30s
      console.log(`[GoogleSheets] Quota error (${response.status}), retrying in ${delay}ms (attempt ${retryCount + 1}/3)`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return sheetsRequest(method, url, body, retryCount + 1);
    }

    throw new Error(`Google Sheets API error: ${errorMessage}`);
  }

  return response.json();
}

/**
 * Read values from a sheet range
 */
export async function readSheet(sheetId: string, range: string): Promise<any[][]> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}?valueRenderOption=UNFORMATTED_VALUE`;
  const response = await sheetsRequest<{ values?: any[][] }>('GET', url);
  return response.values || [];
}

/**
 * Write values to a sheet range (overwrites)
 */
export async function writeSheet(
  sheetId: string,
  range: string,
  values: any[][]
): Promise<{ updatedRows: number; updatedColumns: number; updatedCells: number }> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;
  return sheetsRequest('PUT', url, { values });
}

/**
 * Append values to a sheet (adds new rows)
 */
export async function appendSheet(
  sheetId: string,
  range: string,
  values: any[][]
): Promise<{ updates: { updatedRows: number } }> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  return sheetsRequest('POST', url, { values });
}

/**
 * Batch update multiple ranges efficiently
 */
export async function batchUpdateSheet(
  sheetId: string,
  requests: any[]
): Promise<any> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}:batchUpdate`;
  return sheetsRequest('POST', url, { requests });
}

/**
 * Clear a sheet range
 */
export async function clearSheet(sheetId: string, range: string): Promise<void> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}:clear`;
  await sheetsRequest('POST', url, {});
}

/**
 * Get sheet metadata (names, IDs)
 */
export async function getSheetMetadata(sheetId: string): Promise<any> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets(properties(sheetId,title,gridProperties(rowCount,columnCount)))`;
  return sheetsRequest('GET', url);
}

/**
 * Create a new sheet in the spreadsheet
 */
export async function createSheet(sheetId: string, title: string, headerRow?: any[]): Promise<number> {
  const requests: any[] = [{
    addSheet: {
      properties: { title },
    },
  }];

  if (headerRow) {
    requests.push({
      updateCells: {
        start: { sheetId: 0, rowIndex: 0, columnIndex: 0 },
        rows: [{ values: headerRow.map(v => ({ userEnteredValue: { stringValue: String(v) } })) }],
        fields: 'userEnteredValue',
      },
    });
  }

  const response = await batchUpdateSheet(sheetId, requests);
  return response.replies[0].addSheet.properties.sheetId;
}

/**
 * Convert GroceryItem to Google Sheets row format
 */
export function itemToRow(item: GroceryItem, userEmail: string): any[] {
  // Use item's updatedAt if available, otherwise compute from checkedAt/addedAt
  const updatedAt = item.updatedAt ?? (item.checkedAt ?? item.addedAt);
  return [
    item.id,
    item.name,
    item.checked ? 'TRUE' : 'FALSE',
    item.checkedAt || '',
    item.addedAt,
    item.category || '',
    item.quantity || '',
    updatedAt, // updatedAt
    item.updatedBy || userEmail, // updatedBy
    item.isTombstone === true ? 'TRUE' : 'FALSE', // isTombstone
  ];
}

/**
 * Convert Google Sheets row to GroceryItem
 *
 * Only id and name are required. Google Sheets omits trailing empty cells from
 * a read, so a row a user typed by hand (e.g. just id + name, per the setup
 * doc's own manual-entry instructions) legitimately arrives shorter than the
 * full column set - it must survive being read back, not be dropped and then
 * erased by the next full-sheet rewrite. Every other missing/short/garbage
 * cell is defaulted sensibly rather than rejected: an unknown timestamp must
 * end up undefined/0 (oldest-losing, see getItemUpdatedAt in sync-engine.ts)
 * rather than silently becoming a fresh Date.now() stamp or a NaN that breaks
 * merge comparisons and lets the remote row win by accident.
 */
export function rowToItem(row: any[]): GroceryItem | null {
  if (!row) return null;

  const [id, name, checked, checkedAt, addedAt, category, quantity, updatedAt, updatedBy, isTombstone] = row;

  if (!id || !name) return null;

  const parseFiniteOrUndefined = (value: unknown): number | undefined => {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  };

  return {
    id: String(id),
    name: String(name),
    checked: String(checked).toUpperCase() === 'TRUE',
    checkedAt: parseFiniteOrUndefined(checkedAt),
    // An unknown/blank/non-numeric addedAt must never look freshly stamped -
    // 0 (oldest possible), not Date.now() (which would make an unknowable row
    // beat a real local edit's timestamp on every single sync).
    addedAt: Number(addedAt) || 0,
    category: category ? String(category) : undefined,
    quantity: parseFiniteOrUndefined(quantity),
    updatedAt: parseFiniteOrUndefined(updatedAt),
    updatedBy: updatedBy ? String(updatedBy) : undefined,
    isTombstone: String(isTombstone).toUpperCase() === 'TRUE',
  };
}

/**
 * Get the header row for the grocery list sheet
 */
export function getHeaderRow(): any[] {
  return [
    'id',
    'name',
    'checked',
    'checkedAt',
    'addedAt',
    'category',
    'quantity',
    'updatedAt',
    'updatedBy',
    'isTombstone',
  ];
}

/**
 * Convert Google Sheets rows to GroceryItem array
 */
export function rowsToItems(rows: any[][]): any[] {
  return rows
    .map(rowToItem)
    .filter((item): item is any => item !== null);
}

/**
 * Get all grocery items from the sheet
 */
export async function getAllGroceryItems(config: { sheetId: string; sheetName: string; syncEnabled: boolean }): Promise<any[]> {
  const rows = await readSheet(config.sheetId, `${config.sheetName}!A2:J`);
  return rowsToItems(rows);
}

/**
 * Sync items to Google Sheets (full sync - replaces all)
 * Clears the full data range first so a shrinking list doesn't leave stale
 * trailing rows behind (which would otherwise be read back on the next sync
 * and resurrect deleted/stale items).
 */
export async function syncItemsToSheets(
  config: { sheetId: string; sheetName: string; syncEnabled: boolean },
  items: any[],
  userEmail: string
): Promise<void> {
  const rows = [getHeaderRow(), ...items.map(item => itemToRow(item, userEmail))];
  await clearSheet(config.sheetId, `${config.sheetName}!A2:J`);
  await writeSheet(config.sheetId, `${config.sheetName}!A1:J${rows.length}`, rows);
}

/**
 * Ensure the grocery list sheet exists with proper headers
 */
export async function ensureGroceryListSheet(config: { sheetId: string; sheetName: string; syncEnabled: boolean }): Promise<void> {
  try {
    const metadata = await getSheetMetadata(config.sheetId);
    const sheet = metadata.sheets?.find((s: any) => s.properties.title === config.sheetName);

    if (!sheet) {
      // Create the sheet with headers
      await createSheet(config.sheetId, config.sheetName, getHeaderRow());
    } else {
      // Verify headers
      const headers = await readSheet(config.sheetId, `${config.sheetName}!A1:J1`);
      const expectedHeaders = getHeaderRow();

      if (headers.length === 0 || !headers[0].every((h: string, i: number) => h === expectedHeaders[i])) {
        // Headers don't match, rewrite them
        await writeSheet(config.sheetId, `${config.sheetName}!A1:J1`, [expectedHeaders]);
      }
    }
  } catch (error) {
    console.error('Failed to ensure grocery list sheet:', error);
    throw error;
  }
}

// Type imports (for JSDoc)
interface GroceryItem {
  id: string;
  name: string;
  checked: boolean;
  checkedAt?: number;
  addedAt: number;
  category?: string;
  quantity?: number;
  updatedAt?: number;
  updatedBy?: string;
  isTombstone?: boolean;
}