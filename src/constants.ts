import path from 'path';
import os from 'os';

export const SPOTIFY_AUTH_URL = 'https://accounts.spotify.com/authorize';
export const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
export const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';

/** Redirect URI used during PKCE OAuth flow.
 *  Must be registered in your Spotify app dashboard. */
export const REDIRECT_URI = 'http://127.0.0.1:8765/callback';

export const SCOPES = [
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-follow-read',
  'user-library-read',
  'user-top-read',
].join(' ');

export const DB_PATH =
  process.env.SPOTIFY_DB_PATH ??
  path.join(os.homedir(), '.spotify-mcp.db');
