import { SpotifyClient } from '../services/spotify';
import { getAllArtistIdsFromTracks, getArtistCount } from '../services/db';
import type { NewRelease } from '../types';

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID ?? '';

// ── Tool: spotify_get_new_releases ───────────────────────────────────────────

export const TOOL_GET_NEW_RELEASES = {
  name: 'spotify_get_new_releases',
  description:
    'Zeigt neue Releases aus dem globalen Spotify-Katalog (kein Scan erforderlich). ' +
    'Gibt die aktuellsten Alben und Singles zurück.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      limit: {
        type: 'number',
        description: 'Anzahl der Releases (max 50, Standard: 20)',
      },
      country: {
        type: 'string',
        description: 'Ländercode (ISO 3166-1 alpha-2), Standard: "DE"',
      },
    },
    required: [] as string[],
  },
};

export async function handleGetNewReleases(
  limit = 20,
  country = 'DE'
): Promise<string> {
  if (!CLIENT_ID) return '❌ SPOTIFY_CLIENT_ID nicht gesetzt.';

  const client = new SpotifyClient(CLIENT_ID);
  const albums = await client.getNewReleasesGlobal(Math.min(limit, 50), country);

  if (albums.length === 0) {
    return '⚠️ Keine neuen Releases gefunden.';
  }

  const releases: NewRelease[] = albums.map((a) => ({
    id: a.id,
    name: a.name,
    artists: a.artists.map((ar) => ar.name),
    release_date: a.release_date,
    album_type: a.album_type,
    image_url: a.images[0]?.url ?? '',
    spotify_url: a.external_urls.spotify,
  }));

  const header = `🆕 Neue Spotify Releases (${country}, ${releases.length} Einträge)\n`;
  const lines: string[] = [header];

  for (const r of releases) {
    const typeIcon = r.album_type === 'single' ? '🎵' : '💿';
    lines.push(
      `${typeIcon} ${r.name}\n` +
        `   Künstler: ${r.artists.join(', ')}\n` +
        `   Datum: ${r.release_date}  |  Typ: ${r.album_type}\n` +
        `   🔗 ${r.spotify_url}`
    );
  }

  return lines.join('\n');
}

// ── Tool: spotify_get_releases_from_library ──────────────────────────────────

export const TOOL_GET_RELEASES_FROM_LIBRARY = {
  name: 'spotify_get_releases_from_library',
  description:
    'Gibt neue Releases von Künstlern zurück, die in deinen Playlisten vorkommen. ' +
    'Erfordert vorherigen Aufruf von spotify_scan_playlists. ' +
    'Durchsucht alle Künstler deiner Bibliothek nach Releases der letzten N Tage.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      days_back: {
        type: 'number',
        description: 'Wie viele Tage zurückschauen (Standard: 30)',
      },
      max_artists: {
        type: 'number',
        description:
          'Maximale Anzahl der zu durchsuchenden Künstler (Standard: 50). ' +
          'Hohe Werte verlängern die Ladezeit.',
      },
    },
    required: [] as string[],
  },
};

export async function handleGetReleasesFromLibrary(
  daysBack = 30,
  maxArtists = 50
): Promise<string> {
  if (!CLIENT_ID) return '❌ SPOTIFY_CLIENT_ID nicht gesetzt.';

  const artistCount = getArtistCount();
  if (artistCount === 0) {
    return '⚠️ Keine Künstlerdaten vorhanden. Bitte zuerst spotify_scan_playlists ausführen.';
  }

  const allIds = getAllArtistIdsFromTracks();
  const ids = allIds.slice(0, maxArtists);

  const client = new SpotifyClient(CLIENT_ID);
  const lines: string[] = [
    `🔍 Suche Releases der letzten ${daysBack} Tage von ${ids.length} Künstlern...\n`,
  ];

  const found: Array<NewRelease & { artist_name: string }> = [];

  for (const artistId of ids) {
    try {
      const albums = await client.getArtistRecentAlbums(artistId, daysBack);
      for (const a of albums) {
        found.push({
          id: a.id,
          name: a.name,
          artists: a.artists.map((ar) => ar.name),
          artist_name: a.artists[0]?.name ?? artistId,
          release_date: a.release_date,
          album_type: a.album_type,
          image_url: a.images[0]?.url ?? '',
          spotify_url: a.external_urls.spotify,
        });
      }
    } catch {
      // Skip artists that fail (e.g. 404)
    }
  }

  // Deduplicate by album id
  const unique = Array.from(new Map(found.map((r) => [r.id, r])).values());
  unique.sort(
    (a, b) =>
      new Date(b.release_date).getTime() - new Date(a.release_date).getTime()
  );

  if (unique.length === 0) {
    return (
      `✅ Suche abgeschlossen.\n` +
      `Keine neuen Releases der letzten ${daysBack} Tage von den geprüften Künstlern.`
    );
  }

  lines.push(
    `✅ ${unique.length} neue Release(s) von Künstlern deiner Bibliothek:\n`
  );

  for (const r of unique) {
    const typeIcon = r.album_type === 'single' ? '🎵' : '💿';
    lines.push(
      `${typeIcon} ${r.name}  (${r.release_date})\n` +
        `   Künstler: ${r.artists.join(', ')}\n` +
        `   Typ: ${r.album_type}\n` +
        `   🔗 ${r.spotify_url}`
    );
  }

  return lines.join('\n');
}
