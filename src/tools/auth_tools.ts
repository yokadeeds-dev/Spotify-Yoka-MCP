import { generateAuthUrl, exchangeCode } from '../services/auth';
import { getTokens } from '../services/db';
import { SpotifyClient } from '../services/spotify';

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID ?? '';

// ── Tool: spotify_get_auth_url ───────────────────────────────────────────────

export const TOOL_GET_AUTH_URL = {
  name: 'spotify_get_auth_url',
  description:
    'Startet den Spotify OAuth2-Login (PKCE). Gibt eine URL zurück, die der User im Browser öffnen muss. ' +
    'Nach der Anmeldung wird der Browser zu http://127.0.0.1:8765/callback weitergeleitet. ' +
    'Die vollständige Callback-URL (mit code= und state=) muss danach an spotify_complete_auth übergeben werden.',
  inputSchema: {
    type: 'object' as const,
    properties: {},
    required: [] as string[],
  },
};

export async function handleGetAuthUrl(): Promise<string> {
  if (!CLIENT_ID || CLIENT_ID === 'HIER_EINTRAGEN') {
    return (
      '❌ SPOTIFY_CLIENT_ID ist nicht gesetzt.\n' +
      'Bitte in claude_desktop_config.json eintragen und Claude Desktop neustarten.'
    );
  }
  const url = generateAuthUrl(CLIENT_ID);
  return (
    '🎵 Spotify Authorization URL:\n\n' +
    url +
    '\n\n' +
    '📋 Schritte:\n' +
    '1. Öffne die URL im Browser\n' +
    '2. Melde dich bei Spotify an und erlaube den Zugriff\n' +
    '3. Der Browser wird zu http://127.0.0.1:8765/callback weitergeleitet (Seite lädt nicht – das ist OK)\n' +
    '4. Kopiere die vollständige URL aus der Adresszeile\n' +
    '5. Rufe spotify_complete_auth mit callback_url = <die kopierte URL> auf'
  );
}

// ── Tool: spotify_complete_auth ──────────────────────────────────────────────

export const TOOL_COMPLETE_AUTH = {
  name: 'spotify_complete_auth',
  description:
    'Schließt den Spotify OAuth2-Login ab. Übergib die vollständige Callback-URL ' +
    '(z.B. http://localhost:8888/callback?code=AQD...&state=abc123) aus dem Browser.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      callback_url: {
        type: 'string',
        description:
          'Die vollständige Callback-URL aus dem Browser (inkl. code= und state= Parameter)',
      },
    },
    required: ['callback_url'],
  },
};

export async function handleCompleteAuth(callbackUrl: string): Promise<string> {
  let url: URL;
  try {
    url = new URL(callbackUrl);
  } catch {
    return '❌ Ungültige URL. Bitte die vollständige Callback-URL einfügen.';
  }

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  if (error) {
    return `❌ Spotify hat den Zugriff verweigert: ${error}`;
  }
  if (!code || !state) {
    return '❌ URL enthält keinen code oder state Parameter. Bitte die vollständige Callback-URL verwenden.';
  }

  if (!CLIENT_ID) {
    return '❌ SPOTIFY_CLIENT_ID nicht gesetzt.';
  }

  const result = await exchangeCode(CLIENT_ID, code, state);
  if (!result.success) {
    return `❌ Fehler beim Token-Austausch: ${result.error}`;
  }

  // Verify by fetching user info
  try {
    const client = new SpotifyClient(CLIENT_ID);
    const user = await client.getCurrentUser();
    return (
      `✅ Erfolgreich authentifiziert!\n\n` +
      `👤 Benutzer: ${user.display_name ?? user.id}\n` +
      `📧 E-Mail: ${user.email}\n` +
      `🌍 Land: ${user.country}\n\n` +
      `Token wurde gespeichert. Du kannst jetzt spotify_scan_playlists aufrufen.`
    );
  } catch {
    return '✅ Token gespeichert, aber Benutzerinfo konnte nicht abgerufen werden.';
  }
}

// ── Tool: spotify_auth_status ────────────────────────────────────────────────

export const TOOL_AUTH_STATUS = {
  name: 'spotify_auth_status',
  description: 'Zeigt den aktuellen Authentifizierungsstatus an (eingeloggt / Token abgelaufen / nicht eingeloggt).',
  inputSchema: {
    type: 'object' as const,
    properties: {},
    required: [] as string[],
  },
};

export function handleAuthStatus(): string {
  const tokens = getTokens();
  if (!tokens) {
    return '❌ Nicht authentifiziert. Bitte spotify_get_auth_url aufrufen.';
  }
  const expiresIn = Math.round((tokens.expires_at - Date.now()) / 1000);
  if (expiresIn < 0) {
    return `⚠️ Token abgelaufen (vor ${Math.abs(expiresIn)}s). Wird beim nächsten API-Aufruf automatisch erneuert.`;
  }
  return (
    `✅ Authentifiziert\n` +
    `🔑 Token gültig für: ${Math.round(expiresIn / 60)} Minuten\n` +
    `🔄 Refresh-Token: ${tokens.refresh_token ? 'vorhanden' : 'nicht vorhanden'}`
  );
}
