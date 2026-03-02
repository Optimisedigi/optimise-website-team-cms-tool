import { google } from "googleapis";

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.SHEETS_REDIRECT_URI
  );
}

/**
 * Generate the Google OAuth consent URL for Sheets access.
 */
export function getSheetsOAuthUrl(): string {
  const oauth2Client = getOAuth2Client();
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
    state: "sheets",
  });
}

/**
 * Exchange an authorization code for tokens.
 */
export async function exchangeSheetsCode(code: string) {
  const oauth2Client = getOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);
  return {
    accessToken: tokens.access_token!,
    refreshToken: tokens.refresh_token!,
    expiry: tokens.expiry_date
      ? new Date(tokens.expiry_date).toISOString()
      : null,
  };
}

/**
 * Get an authenticated Sheets client using the stored refresh token.
 */
export async function getAuthenticatedSheetsClient(refreshToken: string) {
  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  const { credentials } = await oauth2Client.refreshAccessToken();
  oauth2Client.setCredentials(credentials);
  return google.sheets({ version: "v4", auth: oauth2Client });
}

/**
 * Get the connected user's email address.
 */
export async function getSheetsUserEmail(accessToken: string): Promise<string> {
  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({ access_token: accessToken });
  const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
  const { data } = await oauth2.userinfo.get();
  return data.email || "";
}

/**
 * Extract spreadsheet ID from a Google Sheets URL.
 */
export function extractSpreadsheetId(url: string): string | null {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

/**
 * Read the neg_kws_lists tab row 2 to discover available negative keyword lists.
 * Each column in row 2 has the list name; row 3 has the regex pattern.
 * Returns array of { name, column (A, B, C...), regex }.
 */
export async function readSheetLists(
  refreshToken: string,
  spreadsheetId: string
): Promise<{ name: string; column: string; regex: string }[]> {
  const sheets = await getAuthenticatedSheetsClient(refreshToken);
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "neg_kws_lists!A2:Z3",
  });

  const rows = res.data.values || [];
  const names = rows[0] || [];
  const regexes = rows[1] || [];
  const lists: { name: string; column: string; regex: string }[] = [];

  for (let i = 0; i < names.length; i++) {
    if (names[i]) {
      const colLetter = String.fromCharCode(65 + i);
      lists.push({
        name: names[i],
        column: colLetter,
        regex: regexes[i] || "",
      });
    }
  }

  return lists;
}

/**
 * Read existing keywords from a specific list column to avoid duplicates.
 */
export async function readExistingKeywords(
  refreshToken: string,
  spreadsheetId: string,
  column: string
): Promise<string[]> {
  const sheets = await getAuthenticatedSheetsClient(refreshToken);
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `neg_kws_lists!${column}4:${column}5000`,
  });

  const rows = res.data.values || [];
  return rows.map((r) => r[0]?.toString().toLowerCase().trim()).filter(Boolean);
}

/**
 * Append keywords to a specific list column in the sheet.
 * Finds the first empty row in that column and writes there.
 */
export async function appendToList(
  refreshToken: string,
  spreadsheetId: string,
  column: string,
  keywords: string[]
): Promise<number> {
  if (keywords.length === 0) return 0;

  const sheets = await getAuthenticatedSheetsClient(refreshToken);

  // Find the first empty row in this column (data starts at row 4)
  const existing = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `neg_kws_lists!${column}4:${column}5000`,
  });

  const existingRows = existing.data.values || [];
  const startRow = 4 + existingRows.length;

  // Write keywords as a vertical column
  const values = keywords.map((kw) => [kw]);
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `neg_kws_lists!${column}${startRow}:${column}${startRow + keywords.length - 1}`,
    valueInputOption: "RAW",
    requestBody: { values },
  });

  return keywords.length;
}
