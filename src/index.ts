import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

// Tool definitions
import {
  TOOL_GET_AUTH_URL,
  TOOL_COMPLETE_AUTH,
  TOOL_AUTH_STATUS,
  handleGetAuthUrl,
  handleCompleteAuth,
  handleAuthStatus,
} from './tools/auth_tools.js';

import {
  TOOL_SCAN_PLAYLISTS,
  TOOL_SCAN_STATUS,
  handleScanPlaylists,
  handleScanStatus,
} from './tools/scan_tools.js';

import {
  TOOL_GET_ARTISTS_BY_GENRE,
  TOOL_LIST_GENRES,
  handleGetArtistsByGenre,
  handleListGenres,
} from './tools/artist_tools.js';

import {
  TOOL_GET_NEW_RELEASES,
  TOOL_GET_RELEASES_FROM_LIBRARY,
  handleGetNewReleases,
  handleGetReleasesFromLibrary,
} from './tools/releases_tools.js';

import {
  TOOL_IMPORT_FOLDER,
  handleImportFolder,
} from './tools/import_tools.js';

// ── Server setup ─────────────────────────────────────────────────────────────

const server = new Server(
  {
    name: 'spotify-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// ── Tool registry ─────────────────────────────────────────────────────────────

const ALL_TOOLS = [
  TOOL_GET_AUTH_URL,
  TOOL_COMPLETE_AUTH,
  TOOL_AUTH_STATUS,
  TOOL_SCAN_PLAYLISTS,
  TOOL_SCAN_STATUS,
  TOOL_GET_ARTISTS_BY_GENRE,
  TOOL_LIST_GENRES,
  TOOL_GET_NEW_RELEASES,
  TOOL_GET_RELEASES_FROM_LIBRARY,
  TOOL_IMPORT_FOLDER,
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: ALL_TOOLS,
}));

// ── Tool dispatcher ───────────────────────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const a = (args ?? {}) as Record<string, unknown>;

  let text: string;

  try {
    switch (name) {
      // Auth
      case 'spotify_get_auth_url':
        text = await handleGetAuthUrl();
        break;

      case 'spotify_complete_auth':
        text = await handleCompleteAuth(a['callback_url'] as string);
        break;

      case 'spotify_auth_status':
        text = handleAuthStatus();
        break;

      // Scan
      case 'spotify_scan_playlists':
        text = await handleScanPlaylists(
          a['limit_playlists'] != null ? Number(a['limit_playlists']) : undefined
        );
        break;

      case 'spotify_scan_status':
        text = handleScanStatus();
        break;

      // Artists / Genres
      case 'spotify_get_artists_by_genre':
        text = handleGetArtistsByGenre(
          a['genre_filter'] as string | undefined,
          a['min_popularity'] != null ? Number(a['min_popularity']) : undefined,
          a['top_n'] != null ? Number(a['top_n']) : undefined
        );
        break;

      case 'spotify_list_genres':
        text = handleListGenres();
        break;

      // Releases
      case 'spotify_get_new_releases':
        text = await handleGetNewReleases(
          a['limit'] != null ? Number(a['limit']) : undefined,
          a['country'] as string | undefined
        );
        break;

      case 'spotify_get_releases_from_library':
        text = await handleGetReleasesFromLibrary(
          a['days_back'] != null ? Number(a['days_back']) : undefined,
          a['max_artists'] != null ? Number(a['max_artists']) : undefined
        );
        break;

      // Import
      case 'spotify_import_folder':
        text = await handleImportFolder(
          a['folder_path'] as string,
          a['playlist_name'] as string | undefined,
          a['playlist_id'] as string | undefined,
          a['dry_run'] != null ? Boolean(a['dry_run']) : undefined,
          a['recursive'] != null ? Boolean(a['recursive']) : undefined
        );
        break;

      default:
        text = `❌ Unbekanntes Tool: ${name}`;
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    text = `❌ Fehler beim Ausführen von "${name}":\n${message}`;
  }

  return {
    content: [{ type: 'text', text }],
  };
});

// ── Start ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Server runs until process exits; no console.log to avoid polluting stdio
}

main().catch((err) => {
  process.stderr.write(`Fatal error: ${err}\n`);
  process.exit(1);
});
