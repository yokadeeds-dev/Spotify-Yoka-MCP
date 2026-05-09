import fs from 'fs';
import path from 'path';
import { SpotifyClient } from '../services/spotify';

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID ?? '';

// ── Audio file detection ──────────────────────────────────────────────────────

const AUDIO_EXTENSIONS = new Set([
  '.mp3', '.flac', '.wav', '.aac', '.ogg', '.m4a', '.opus', '.wma', '.aiff',
]);

function isAudioFile(filename: string): boolean {
  return AUDIO_EXTENSIONS.has(path.extname(filename).toLowerCase());
}

// ── Filename parsing ──────────────────────────────────────────────────────────
// Handles all common patterns:
//   "01. Bicep - Glue.mp3"   → { artist: "Bicep", title: "Glue" }
//   "01 - Bicep - Glue.mp3"  → { artist: "Bicep", title: "Glue" }
//   "Bicep - Glue.mp3"       → { artist: "Bicep", title: "Glue" }
//   "Glue.mp3"               → { title: "Glue" }

function parseFilename(filename: string): { title: string; artist?: string } {
  // Strip extension
  const base = path.basename(filename, path.extname(filename));

  // Remove leading track number: "01.", "01 -", "1. ", etc.
  const noNumber = base.replace(/^\d+[\s.\-–]+/, '').trim();

  // Try to split on first " - " (or " – " or " — ")
  const sepMatch = noNumber.match(/^(.+?)\s*[-–—]\s*(.+)$/);
  if (sepMatch) {
    return {
      artist: sepMatch[1].trim(),
      title: sepMatch[2].trim(),
    };
  }

  return { title: noNumber };
}

// ── Tool definition ───────────────────────────────────────────────────────────

export const TOOL_IMPORT_FOLDER = {
  name: 'spotify_import_folder',
  description:
    'Liest alle Audiodateien aus einem lokalen Ordner, sucht jeden Song auf Spotify ' +
    'und fügt gefundene Tracks in eine Playlist ein. ' +
    'Unterstützte Formate: MP3, FLAC, WAV, AAC, OGG, M4A, OPUS, WMA. ' +
    'Dateinamen-Formate werden automatisch erkannt: ' +
    '"Künstler - Titel.mp3", "01. Künstler - Titel.mp3", "Titel.mp3". ' +
    'HINWEIS: Nach dem ersten Einsatz ist erneute Authentifizierung nötig ' +
    '(neue Scopes: playlist-modify-public/private).',
  inputSchema: {
    type: 'object' as const,
    properties: {
      folder_path: {
        type: 'string',
        description:
          'Absoluter Pfad zum Ordner mit den Audiodateien, z.B. "C:\\\\Music\\\\Techno"',
      },
      playlist_name: {
        type: 'string',
        description:
          'Name der neuen Playlist die erstellt wird. ' +
          'Wird playlist_id angegeben, wird stattdessen zu dieser hinzugefügt.',
      },
      playlist_id: {
        type: 'string',
        description:
          'Optional: ID einer bestehenden Playlist (aus der Spotify URL). ' +
          'Falls angegeben, wird playlist_name ignoriert.',
      },
      dry_run: {
        type: 'boolean',
        description:
          'Wenn true: nur anzeigen was gefunden würde, nichts zu Spotify hinzufügen. ' +
          'Standard: false',
      },
      recursive: {
        type: 'boolean',
        description:
          'Unterordner ebenfalls durchsuchen. Standard: false',
      },
    },
    required: ['folder_path'],
  },
};

// ── Handler ───────────────────────────────────────────────────────────────────

export async function handleImportFolder(
  folderPath: string,
  playlistName?: string,
  playlistId?: string,
  dryRun = false,
  recursive = false
): Promise<string> {
  if (!CLIENT_ID) return '❌ SPOTIFY_CLIENT_ID nicht gesetzt.';
  if (!playlistName && !playlistId && !dryRun) {
    return '❌ Bitte playlist_name oder playlist_id angeben (oder dry_run: true zum Testen).';
  }

  // 1. Read audio files from folder
  let files: string[];
  try {
    files = collectAudioFiles(folderPath, recursive);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `❌ Ordner konnte nicht gelesen werden: ${msg}\nPfad: ${folderPath}`;
  }

  if (files.length === 0) {
    return `⚠️ Keine Audiodateien gefunden in:\n${folderPath}`;
  }

  const lines: string[] = [
    `📁 Ordner: ${folderPath}`,
    `🎵 ${files.length} Audiodatei(en) gefunden\n`,
  ];

  if (dryRun) {
    lines.push('🔍 DRY RUN – keine Änderungen an Spotify\n');
  }

  // 2. Parse filenames + search Spotify
  const client = new SpotifyClient(CLIENT_ID);
  const foundUris: string[] = [];
  const notFound: string[] = [];

  for (const file of files) {
    const filename = path.basename(file);
    const { title, artist } = parseFilename(filename);

    let track = null;
    try {
      // Try with artist first, fallback to title-only
      if (artist) {
        track = await client.searchTrack(title, artist);
      }
      if (!track) {
        track = await client.searchTrack(title);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      lines.push(`  ⚠️ "${filename}" – Suchfehler: ${msg.slice(0, 60)}`);
      notFound.push(filename);
      continue;
    }

    if (track) {
      const trackArtist = track.artists.map((a) => a.name).join(', ');
      lines.push(`  ✅ "${filename}"`);
      lines.push(`      → ${track.name} · ${trackArtist}`);
      foundUris.push(`spotify:track:${track.id}`);
    } else {
      lines.push(`  ❌ "${filename}" – nicht gefunden`);
      notFound.push(filename);
    }
  }

  lines.push(
    `\n📊 Ergebnis: ${foundUris.length}/${files.length} gefunden` +
    (notFound.length > 0 ? `, ${notFound.length} nicht gefunden` : '')
  );

  if (dryRun || foundUris.length === 0) {
    if (foundUris.length === 0) lines.push('⚠️ Nichts zum Hinzufügen.');
    return lines.join('\n');
  }

  // 3. Get or create playlist
  let targetPlaylistId = playlistId;
  let targetPlaylistName = playlistName ?? 'Importiert';

  if (!targetPlaylistId) {
    try {
      const user = await client.getCurrentUser();
      const playlist = await client.createPlaylist(user.id, targetPlaylistName);
      targetPlaylistId = playlist.id;
      lines.push(`\n🆕 Playlist erstellt: "${targetPlaylistName}"`);
      lines.push(`   🔗 ${playlist.external_urls.spotify}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return lines.join('\n') + `\n\n❌ Playlist konnte nicht erstellt werden: ${msg}\n` +
        `⚠️ Falls "401 Unauthorized": Bitte spotify_get_auth_url aufrufen – neue Scopes benötigt.`;
    }
  } else {
    const existing = await client.getPlaylist(targetPlaylistId);
    if (!existing) {
      return lines.join('\n') + `\n\n❌ Playlist "${targetPlaylistId}" nicht gefunden.`;
    }
    targetPlaylistName = existing.name;
    lines.push(`\n📋 Playlist: "${targetPlaylistName}"`);
  }

  // 4. Add tracks
  try {
    await client.addTracksToPlaylist(targetPlaylistId!, foundUris);
    lines.push(`✅ ${foundUris.length} Track(s) hinzugefügt zu "${targetPlaylistName}"`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    lines.push(`\n❌ Fehler beim Hinzufügen: ${msg}`);
    if (msg.includes('401')) {
      lines.push('⚠️ Bitte spotify_get_auth_url aufrufen – neue Scopes (playlist-modify) benötigt.');
    }
  }

  return lines.join('\n');
}

// ── Helper: collect audio files ───────────────────────────────────────────────

function collectAudioFiles(dir: string, recursive: boolean): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && recursive) {
      results.push(...collectAudioFiles(fullPath, true));
    } else if (entry.isFile() && isAudioFile(entry.name)) {
      results.push(fullPath);
    }
  }

  return results.sort();
}
