import crypto from 'crypto';
import { SPOTIFY_AUTH_URL, SPOTIFY_TOKEN_URL, REDIRECT_URI, SCOPES } from '../constants';
import { savePkceState, getPkceCodeVerifier, saveTokens } from './db';

// ── PKCE Helpers ─────────────────────────────────────────────────────────────

function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString('base64url');
}

function generateCodeChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Generates a Spotify OAuth2 PKCE authorization URL.
 * The state and code_verifier are stored in SQLite for later verification.
 */
export function generateAuthUrl(clientId: string): string {
  const state = crypto.randomBytes(16).toString('hex');
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);

  savePkceState(state, codeVerifier);

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    state,
    code_challenge_method: 'S256',
    code_challenge: codeChallenge,
  });

  return `${SPOTIFY_AUTH_URL}?${params.toString()}`;
}

/**
 * Exchanges an authorization code for access + refresh tokens.
 * Validates the state parameter against the stored PKCE verifier.
 */
export async function exchangeCode(
  clientId: string,
  code: string,
  state: string
): Promise<{ success: boolean; error?: string }> {
  const codeVerifier = getPkceCodeVerifier(state);
  if (!codeVerifier) {
    return {
      success: false,
      error:
        'Ungültiger oder abgelaufener State-Parameter. Bitte Auth-Flow erneut starten.',
    };
  }

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
    client_id: clientId,
    code_verifier: codeVerifier,
  });

  const response = await fetch(SPOTIFY_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    const err = await response.text();
    return { success: false, error: `Token-Austausch fehlgeschlagen: ${err}` };
  }

  const data = (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  saveTokens(data.access_token, data.refresh_token ?? null, data.expires_in);
  return { success: true };
}

/**
 * Refreshes an expired access token using the stored refresh token.
 * Returns the new access token or null on failure.
 */
export async function refreshAccessToken(
  clientId: string,
  refreshToken: string
): Promise<string | null> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
  });

  const response = await fetch(SPOTIFY_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) return null;

  const data = (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  saveTokens(
    data.access_token,
    data.refresh_token ?? refreshToken,
    data.expires_in
  );
  return data.access_token;
}
