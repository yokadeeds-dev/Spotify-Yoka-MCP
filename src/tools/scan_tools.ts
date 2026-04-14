import { SpotifyClient } from '../services/spotify';
import {
  upsertPlaylist,
  upsertTrack,
  upsertArtist,
  getAllArtistIdsFromTracks,
  getPlaylists,
  getTrackCount,
  getArtistCount,
} from '../services/db';

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID ?? '';

// ── Tool: spotify_scan_playlists ─────────────────────────────────────────────

export const TOOL_SCAN_PLAYLISTS = {
  name: 'spotify_scan_playlists',
  description:
    'Scannt alle Playlisten des Benutzers, importiert Tracks und lädt vollständige ' +
    'Künstler-Daten (inkl. Genres) aus der Spotify API. ' +
    'Ergebnis wird in der lokalen SQLite-Datenbank gecacht. ' +
    'Kann je nach Bibliotheksgröße mehrere Minuten dauern.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      limit_playlists: {
        type: 'number',
        description:
          'Maximale Anzahl Playlisten (Standard: alle). Nützlich zum Testen.',
      },
    },
    required: [] as string[],
  },
};

export async function handleScanPlaylists(limitPlaylists?: number): Promise<string> {
  if (!CLIENT_ID) return '❌ SPOTIFY_CLIENT_ID nicht gesetzt.';

  const client = new SpotifyClient(CLIENT_ID);
  const lines: string[] = [];

  // 1. Fetch all playlists
  lines.push('📋 Lade Playlisten...');
  let playlists = await client.getAllPlaylists();
  if (limitPlaylists) playlists = playlists.slice(0, limitPlaylists);

  lines.push(`  → ${playlists.length} Playlisten gefunden`);

  // 2. For each playlist, store metadata + fetch tracks
  let totalTracks = 0;
  for (const pl of playlists) {
    upsertPlaylist(
      pl.id,
      pl.name,
      pl.owner.id,
      pl.tracks?.total ?? 0,
      pl.snapshot_id
    );

    let tracks: Awaited<ReturnType<typeof client.getPlaylistTracks>> = [];
    try {
      tracks = await client.getPlaylistTracks(pl.id);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      lines.push(`  ⚠️ "${pl.name}" – übersprungen (${msg.slice(0, 60)})`);
      continue;
    }
    for (const t of tracks) {
      upsertTrack(
        t.id,
        t.name,
        t.artists.map((a) => a.id),
        t.album.id,
        pl.id
      );
    }
    totalTracks += tracks.length;
    lines.push(`  ✓ "${pl.name}" – ${tracks.length} Tracks`);
  }

  // 3. Fetch artist details for all unique artist IDs
  lines.push(`\n🎤 Lade Künstlerdaten...`);
  const artistIds = getAllArtistIdsFromTracks();
  lines.push(`  → ${artistIds.length} einzigartige Künstler`);

  let artistsFetched = 0;
  const artists = await client.getArtists(artistIds);
  for (const a of artists) {
    upsertArtist(a.id, a.name, a.genres, a.popularity, a.followers?.total ?? 0);
    artistsFetched++;
  }

  lines.push(`  ✓ ${artistsFetched} Künstler mit Genre-Daten gespeichert`);

  lines.push(
    `\n✅ Scan abgeschlossen!\n` +
      `   📁 Playlisten: ${playlists.length}\n` +
      `   🎵 Tracks: ${totalTracks}\n` +
      `   🎤 Künstler: ${artistsFetched}\n\n` +
      `Nächster Schritt: spotify_get_artists_by_genre aufrufen`
  );

  return lines.join('\n');
}

// ── Tool: spotify_scan_status ────────────────────────────────────────────────

export const TOOL_SCAN_STATUS = {
  name: 'spotify_scan_status',
  description:
    'Zeigt den Status des lokalen Daten-Caches (Anzahl Playlisten, Tracks, Künstler).',
  inputSchema: {
    type: 'object' as const,
    properties: {},
    required: [] as string[],
  },
};

export function handleScanStatus(): string {
  const playlists = getPlaylists();
  const trackCount = getTrackCount();
  const artistCount = getArtistCount();

  if (playlists.length === 0) {
    return '⚠️ Keine Daten im Cache. Bitte zuerst spotify_scan_playlists ausführen.';
  }

  const lastSync = playlists.reduce((max, p) => Math.max(max, p.synced_at), 0);
  const age = Math.round((Date.now() - lastSync) / 60_000);

  return (
    `📊 Spotify MCP Cache-Status\n\n` +
    `📁 Playlisten: ${playlists.length}\n` +
    `🎵 Tracks: ${trackCount}\n` +
    `🎤 Künstler: ${artistCount}\n` +
    `🕒 Letzter Scan: vor ${age} Minuten\n\n` +
    `Playlisten:\n` +
    playlists
      .slice(0, 20)
      .map((p) => `  • ${p.name} (${p.tracks_total} Tracks)`)
      .join('\n') +
    (playlists.length > 20 ? `\n  ... und ${playlists.length - 20} weitere` : '')
  );
}
