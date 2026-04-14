// node:sqlite is built into Node.js >= 22.5 — no native compilation needed
import { DatabaseSync } from 'node:sqlite';
import { DB_PATH } from '../constants';
import type { SpotifyTokenRow } from '../types';

let _db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (!_db) {
    _db = new DatabaseSync(DB_PATH);
    _db.exec('PRAGMA journal_mode = WAL');
    initSchema(_db);
  }
  return _db;
}

function initSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tokens (
      id INTEGER PRIMARY KEY,
      access_token TEXT NOT NULL,
      refresh_token TEXT,
      expires_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pkce_state (
      state TEXT PRIMARY KEY,
      code_verifier TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS playlists (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      tracks_total INTEGER NOT NULL,
      snapshot_id TEXT NOT NULL,
      synced_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tracks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      artist_ids TEXT NOT NULL,
      album_id TEXT NOT NULL,
      playlist_id TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS artists (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      genres TEXT NOT NULL,
      popularity INTEGER NOT NULL,
      followers INTEGER NOT NULL,
      synced_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS albums (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      artist_ids TEXT NOT NULL,
      release_date TEXT NOT NULL,
      album_type TEXT NOT NULL,
      image_url TEXT,
      external_url TEXT NOT NULL,
      synced_at INTEGER NOT NULL
    );
  `);
}

// ── Tokens ─────────────────────────────────────────────────────────────────

export function saveTokens(
  accessToken: string,
  refreshToken: string | null,
  expiresIn: number
): void {
  const db = getDb();
  const expiresAt = Date.now() + expiresIn * 1000;
  db.prepare('DELETE FROM tokens').run();
  db
    .prepare(
      'INSERT INTO tokens (access_token, refresh_token, expires_at) VALUES (?, ?, ?)'
    )
    .run(accessToken, refreshToken ?? null, expiresAt);
}

export function getTokens(): SpotifyTokenRow | null {
  return (getDb().prepare('SELECT * FROM tokens LIMIT 1').get() as unknown as SpotifyTokenRow) ?? null;
}

// ── PKCE State ──────────────────────────────────────────────────────────────

export function savePkceState(state: string, codeVerifier: string): void {
  const db = getDb();
  // clean up states older than 10 minutes
  db.prepare('DELETE FROM pkce_state WHERE created_at < ?').run(Date.now() - 600_000);
  db
    .prepare(
      'INSERT OR REPLACE INTO pkce_state (state, code_verifier, created_at) VALUES (?, ?, ?)'
    )
    .run(state, codeVerifier, Date.now());
}

export function getPkceCodeVerifier(state: string): string | null {
  const row = getDb()
    .prepare('SELECT code_verifier FROM pkce_state WHERE state = ?')
    .get(state) as { code_verifier: string } | undefined;
  return row?.code_verifier ?? null;
}

// ── Playlists ───────────────────────────────────────────────────────────────

export function upsertPlaylist(
  id: string,
  name: string,
  ownerId: string,
  tracksTotal: number,
  snapshotId: string
): void {
  getDb()
    .prepare(
      `INSERT OR REPLACE INTO playlists
         (id, name, owner_id, tracks_total, snapshot_id, synced_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(id, name, ownerId, tracksTotal, snapshotId, Date.now());
}

export function getPlaylists(): Array<{
  id: string;
  name: string;
  owner_id: string;
  tracks_total: number;
  synced_at: number;
}> {
  return getDb().prepare('SELECT * FROM playlists ORDER BY name').all() as any;
}

// ── Tracks ──────────────────────────────────────────────────────────────────

export function upsertTrack(
  id: string,
  name: string,
  artistIds: string[],
  albumId: string,
  playlistId: string
): void {
  getDb()
    .prepare(
      `INSERT OR REPLACE INTO tracks (id, name, artist_ids, album_id, playlist_id)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(id, name, JSON.stringify(artistIds), albumId, playlistId);
}

export function getAllArtistIdsFromTracks(): string[] {
  const rows = getDb().prepare('SELECT DISTINCT artist_ids FROM tracks').all() as Array<{
    artist_ids: string;
  }>;
  const ids = new Set<string>();
  for (const row of rows) {
    const arr: string[] = JSON.parse(row.artist_ids as string);
    arr.forEach((id) => ids.add(id));
  }
  return Array.from(ids);
}

// ── Artists ─────────────────────────────────────────────────────────────────

export function upsertArtist(
  id: string,
  name: string,
  genres: string[],
  popularity: number,
  followers: number
): void {
  getDb()
    .prepare(
      `INSERT OR REPLACE INTO artists (id, name, genres, popularity, followers, synced_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(id, name, JSON.stringify(genres), popularity, followers, Date.now());
}

export function getArtistsByGenre(
  genreFilter?: string
): Map<string, Array<{ id: string; name: string; popularity: number }>> {
  const rows = getDb()
    .prepare('SELECT id, name, genres, popularity FROM artists')
    .all() as Array<{
    id: string;
    name: string;
    genres: string;
    popularity: number;
  }>;

  const map = new Map<string, Array<{ id: string; name: string; popularity: number }>>();

  for (const row of rows) {
    const genres: string[] = JSON.parse(row.genres as string);
    const filtered = genreFilter
      ? genres.filter((g) => g.toLowerCase().includes(genreFilter.toLowerCase()))
      : genres;

    for (const genre of filtered.length > 0 ? filtered : ['(unbekannt)']) {
      if (!map.has(genre)) map.set(genre, []);
      map.get(genre)!.push({
        id: row.id as string,
        name: row.name as string,
        popularity: row.popularity as number,
      });
    }
  }
  return map;
}

export function getArtistCount(): number {
  const row = getDb().prepare('SELECT COUNT(*) as c FROM artists').get() as { c: number };
  return row.c;
}

export function getTrackCount(): number {
  const row = getDb().prepare('SELECT COUNT(*) as c FROM tracks').get() as { c: number };
  return row.c;
}
