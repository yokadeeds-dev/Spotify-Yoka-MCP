# spotify-mcp-server

A **Model Context Protocol (MCP) server** that connects Claude Desktop to the Spotify Web API.

Scan your playlists, explore artists by genre, and discover new releases — all from within Claude.

---

## Features

| Tool | Description |
|------|-------------|
| `spotify_get_auth_url` | Start OAuth2 login (PKCE) — generates a browser URL |
| `spotify_complete_auth` | Complete login by pasting the callback URL |
| `spotify_auth_status` | Check token status |
| `spotify_scan_playlists` | Scan all playlists + artists into local SQLite cache |
| `spotify_scan_status` | Show cache stats (playlists / tracks / artists) |
| `spotify_list_genres` | List all genres found in your library |
| `spotify_get_artists_by_genre` | Browse artists by genre with popularity filter |
| `spotify_get_new_releases` | Global new releases from Spotify catalog |
| `spotify_get_releases_from_library` | New releases from artists in your library |

---

## Requirements

- **Node.js ≥ 22.5** (uses built-in `node:sqlite`)
- **Claude Desktop** (with MCP support)
- A **Spotify Developer account** with an app

---

## Setup

### 1. Create a Spotify App

1. Go to [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)
2. Create a new app (any name)
3. In **Edit Settings → Redirect URIs**, add: `http://127.0.0.1:8765/callback`
4. Copy your **Client ID**

### 2. Install & Build

```bash
git clone https://github.com/YOUR_USERNAME/spotify-mcp-server.git
cd spotify-mcp-server
npm install
npm run build
```

### 3. Configure Claude Desktop

Open `%APPDATA%\Claude\claude_desktop_config.json` and add:

```json
{
  "mcpServers": {
    "spotify": {
      "command": "node",
      "args": ["C:\\path\\to\\spotify-mcp-server\\dist\\index.js"],
      "env": {
        "SPOTIFY_CLIENT_ID": "YOUR_CLIENT_ID_HERE"
      }
    }
  }
}
```

Replace `YOUR_CLIENT_ID_HERE` with the Client ID from step 1.

Restart Claude Desktop.

### 4. Authenticate

In Claude, run:
1. `spotify_get_auth_url` → open the URL in your browser
2. After login, copy the full callback URL from the address bar
3. `spotify_complete_auth` with `callback_url = <pasted URL>`

### 5. Scan your library

```
spotify_scan_playlists
```

Then explore with `spotify_list_genres`, `spotify_get_artists_by_genre`, etc.

---

## Architecture

```
src/
├── index.ts              # MCP server entry point (9 tools)
├── types.ts              # Shared TypeScript types
├── constants.ts          # Spotify API URLs, scopes, redirect URI
├── services/
│   ├── auth.ts           # PKCE OAuth2 flow + token refresh
│   ├── db.ts             # SQLite cache (node:sqlite, no native deps)
│   └── spotify.ts        # Spotify Web API client (rate-limit aware)
└── tools/
    ├── auth_tools.ts     # Login / status tools
    ├── scan_tools.ts     # Playlist + artist scan tools
    ├── artist_tools.ts   # Genre browsing tools
    └── releases_tools.ts # New releases tools
```

**No native dependencies** — uses Node.js built-in `node:sqlite` (≥ 22.5), so `npm install` never requires compilation.

**Auth:** PKCE flow only — no client secret needed. Tokens are stored locally in `~/.spotify-mcp.db`.

---

## OAuth Scopes

| Scope | Purpose |
|-------|---------|
| `playlist-read-private` | Read your private playlists |
| `playlist-read-collaborative` | Read collaborative playlists |
| `user-follow-read` | Read followed artists |
| `user-library-read` | Read saved tracks |
| `user-top-read` | Read top artists/tracks |

---

## License

MIT
