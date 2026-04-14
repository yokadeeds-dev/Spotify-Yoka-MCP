import { SPOTIFY_API_BASE } from '../constants';
import { getTokens } from './db';
import { refreshAccessToken } from './auth';

export class SpotifyClient {
  constructor(private readonly clientId: string) {}

  // ── Auth ─────────────────────────────────────────────────────────────────

  private async getAccessToken(): Promise<string> {
    const tokens = getTokens();
    if (!tokens) {
      throw new Error(
        'Nicht authentifiziert. Bitte zuerst spotify_get_auth_url aufrufen.'
      );
    }
    // Refresh 60 seconds before expiry
    if (Date.now() < tokens.expires_at - 60_000) {
      return tokens.access_token;
    }
    if (!tokens.refresh_token) {
      throw new Error(
        'Kein Refresh-Token vorhanden. Bitte erneut authentifizieren.'
      );
    }
    const newToken = await refreshAccessToken(this.clientId, tokens.refresh_token);
    if (!newToken) {
      throw new Error(
        'Token-Refresh fehlgeschlagen. Bitte erneut authentifizieren.'
      );
    }
    return newToken;
  }

  // ── Core fetch ───────────────────────────────────────────────────────────

  private async apiFetch<T>(path: string, options?: RequestInit, retries = 3): Promise<T> {
    const token = await this.getAccessToken();
    const url = path.startsWith('http') ? path : `${SPOTIFY_API_BASE}${path}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...((options?.headers as Record<string, string>) ?? {}),
      },
    });

    if (response.status === 204) return {} as T;

    // Handle rate limiting: wait and retry
    if (response.status === 429 && retries > 0) {
      const retryAfter = parseInt(response.headers.get('Retry-After') ?? '5', 10);
      await new Promise((resolve) => setTimeout(resolve, (retryAfter + 1) * 1000));
      return this.apiFetch<T>(path, options, retries - 1);
    }

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Spotify API ${response.status}: ${err}`);
    }
    return response.json() as Promise<T>;
  }

  // ── User ─────────────────────────────────────────────────────────────────

  async getCurrentUser(): Promise<{
    id: string;
    display_name: string;
    email: string;
    country: string;
  }> {
    return this.apiFetch('/me');
  }

  // ── Playlists ─────────────────────────────────────────────────────────────

  async getAllPlaylists(): Promise<SpotifyApiPlaylist[]> {
    const playlists: SpotifyApiPlaylist[] = [];
    let next: string | null = `${SPOTIFY_API_BASE}/me/playlists?limit=50`;

    while (next) {
      const data: SpotifyPagingObject<SpotifyApiPlaylist> = await this.apiFetch<SpotifyPagingObject<SpotifyApiPlaylist>>(next);
      playlists.push(...data.items);
      next = data.next;
    }
    return playlists;
  }

  async getPlaylistTracks(playlistId: string): Promise<SpotifyApiTrack[]> {
    const tracks: SpotifyApiTrack[] = [];
    let next: string | null =
      `${SPOTIFY_API_BASE}/playlists/${playlistId}/items?limit=100`;

    while (next) {
      const data: SpotifyPagingObject<{ track: SpotifyApiTrack | null }> = await this.apiFetch<SpotifyPagingObject<{ track: SpotifyApiTrack | null }>>(next);
      for (const item of data.items) {
        if (item?.track?.id) tracks.push(item.track);
      }
      next = data.next;
    }
    return tracks;
  }

  // ── Artists ───────────────────────────────────────────────────────────────

  /** Fetch artist objects in batches of 50 */
  async getArtists(artistIds: string[]): Promise<SpotifyApiArtistFull[]> {
    const artists: SpotifyApiArtistFull[] = [];
    for (let i = 0; i < artistIds.length; i += 50) {
      const batch = artistIds.slice(i, i + 50);
      const data = await this.apiFetch<{ artists: (SpotifyApiArtistFull | null)[] }>(
        `/artists?ids=${batch.join(',')}`
      );
      artists.push(...data.artists.filter((a): a is SpotifyApiArtistFull => a !== null));
    }
    return artists;
  }

  async getFollowedArtists(): Promise<SpotifyApiArtistFull[]> {
    const artists: SpotifyApiArtistFull[] = [];
    let next: string | null =
      `${SPOTIFY_API_BASE}/me/following?type=artist&limit=50`;

    while (next) {
      const data: { artists: SpotifyPagingObject<SpotifyApiArtistFull> } = await this.apiFetch<{
        artists: SpotifyPagingObject<SpotifyApiArtistFull>;
      }>(next);
      artists.push(...data.artists.items);
      next = data.artists.next;
    }
    return artists;
  }

  // ── Releases ──────────────────────────────────────────────────────────────

  async getNewReleasesGlobal(limit = 20, country = 'DE'): Promise<SpotifyApiAlbum[]> {
    const data = await this.apiFetch<{ albums: SpotifyPagingObject<SpotifyApiAlbum> }>(
      `/browse/new-releases?limit=${limit}&country=${country}`
    );
    return data.albums.items;
  }

  /** Albums released by a given artist within the last `daysBack` days */
  async getArtistRecentAlbums(
    artistId: string,
    daysBack = 30
  ): Promise<SpotifyApiAlbum[]> {
    const cutoff = Date.now() - daysBack * 86_400_000;
    const data = await this.apiFetch<SpotifyPagingObject<SpotifyApiAlbum>>(
      `/artists/${artistId}/albums?include_groups=album,single&limit=50&market=DE`
    );
    return data.items.filter((a) => {
      const d = new Date(a.release_date).getTime();
      return !isNaN(d) && d >= cutoff;
    });
  }
}

// ── Spotify API Types (minimal) ───────────────────────────────────────────

export interface SpotifyApiPlaylist {
  id: string;
  name: string;
  owner: { id: string };
  tracks: { total: number };
  snapshot_id: string;
}

export interface SpotifyApiTrack {
  id: string;
  name: string;
  artists: Array<{ id: string; name: string }>;
  album: { id: string; name: string };
}

export interface SpotifyApiArtistFull {
  id: string;
  name: string;
  genres: string[];
  popularity: number;
  followers: { total: number };
}

export interface SpotifyApiAlbum {
  id: string;
  name: string;
  artists: Array<{ id: string; name: string }>;
  release_date: string;
  album_type: string;
  images: Array<{ url: string; width: number; height: number }>;
  external_urls: { spotify: string };
}

interface SpotifyPagingObject<T> {
  items: T[];
  next: string | null;
  total: number;
  limit: number;
  offset: number;
}
