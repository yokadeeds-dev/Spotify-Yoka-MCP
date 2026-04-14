import { getArtistsByGenre, getArtistCount } from '../services/db';

// ── Tool: spotify_get_artists_by_genre ────────────────────────────────────────

export const TOOL_GET_ARTISTS_BY_GENRE = {
  name: 'spotify_get_artists_by_genre',
  description:
    'Gibt alle Künstler aus den gescannten Playlisten gruppiert nach Genre zurück. ' +
    'Optional: nach einem bestimmten Genre filtern (z.B. "techno", "jazz", "hip-hop"). ' +
    'Erfordert vorherigen Aufruf von spotify_scan_playlists.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      genre_filter: {
        type: 'string',
        description:
          'Optionaler Genre-Filter (case-insensitive, Teilstring-Suche). ' +
          'Beispiele: "techno", "house", "jazz", "pop", "hip"',
      },
      min_popularity: {
        type: 'number',
        description: 'Minimale Popularität (0–100). Standard: 0',
      },
      top_n: {
        type: 'number',
        description:
          'Nur die N populärsten Künstler pro Genre anzeigen. Standard: 10',
      },
    },
    required: [] as string[],
  },
};

export function handleGetArtistsByGenre(
  genreFilter?: string,
  minPopularity = 0,
  topN = 10
): string {
  const artistCount = getArtistCount();
  if (artistCount === 0) {
    return '⚠️ Keine Künstlerdaten vorhanden. Bitte zuerst spotify_scan_playlists ausführen.';
  }

  const genreMap = getArtistsByGenre(genreFilter);

  if (genreMap.size === 0) {
    return genreFilter
      ? `🔍 Kein Genre gefunden das "${genreFilter}" enthält.`
      : '⚠️ Keine Genre-Daten vorhanden.';
  }

  // Sort genres alphabetically, filter by popularity, limit artists per genre
  const sortedGenres = Array.from(genreMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([genre, artists]) => {
      const filtered = artists
        .filter((a) => a.popularity >= minPopularity)
        .sort((a, b) => b.popularity - a.popularity)
        .slice(0, topN);
      return { genre, artists: filtered };
    })
    .filter(({ artists }) => artists.length > 0);

  if (sortedGenres.length === 0) {
    return `🔍 Keine Künstler mit Popularität ≥ ${minPopularity} gefunden.`;
  }

  const header = genreFilter
    ? `🎵 Künstler mit Genre "${genreFilter}" (${sortedGenres.length} Genres)\n`
    : `🎵 Alle Genres (${sortedGenres.length} Genres, ${artistCount} Künstler gesamt)\n`;

  const lines: string[] = [header];

  for (const { genre, artists } of sortedGenres) {
    lines.push(`\n📀 ${genre.toUpperCase()} (${artists.length} Künstler)`);
    for (const a of artists) {
      const bar = '█'.repeat(Math.round(a.popularity / 10));
      lines.push(`   ${a.name.padEnd(30)} Pop: ${a.popularity.toString().padStart(3)} ${bar}`);
    }
  }

  return lines.join('\n');
}

// ── Tool: spotify_list_genres ────────────────────────────────────────────────

export const TOOL_LIST_GENRES = {
  name: 'spotify_list_genres',
  description:
    'Listet alle Genres auf, die in den gescannten Playlisten vorkommen, ' +
    'sortiert nach Anzahl der Künstler.',
  inputSchema: {
    type: 'object' as const,
    properties: {},
    required: [] as string[],
  },
};

export function handleListGenres(): string {
  const artistCount = getArtistCount();
  if (artistCount === 0) {
    return '⚠️ Keine Künstlerdaten vorhanden. Bitte zuerst spotify_scan_playlists ausführen.';
  }

  const genreMap = getArtistsByGenre();
  const sorted = Array.from(genreMap.entries())
    .sort(([, a], [, b]) => b.length - a.length)
    .map(([genre, artists]) => ({ genre, count: artists.length }));

  const lines = [
    `🎸 ${sorted.length} Genres in deiner Bibliothek (${artistCount} Künstler):\n`,
  ];

  for (const { genre, count } of sorted) {
    const bar = '▪'.repeat(Math.min(count, 20));
    lines.push(`  ${count.toString().padStart(3)}x  ${genre.padEnd(35)} ${bar}`);
  }

  return lines.join('\n');
}
