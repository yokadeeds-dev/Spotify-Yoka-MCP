export interface SpotifyTokenRow {
  id: number;
  access_token: string;
  refresh_token: string | null;
  expires_at: number;
}

export interface SpotifyPlaylist {
  id: string;
  name: string;
  owner_id: string;
  tracks_total: number;
  snapshot_id: string;
  synced_at: number;
}

export interface SpotifyArtist {
  id: string;
  name: string;
  genres: string[];
  popularity: number;
  followers: number;
}

export interface SpotifyTrack {
  id: string;
  name: string;
  artist_ids: string[];
  album_id: string;
  playlist_id: string;
}

export interface SpotifyAlbum {
  id: string;
  name: string;
  artist_ids: string[];
  release_date: string;
  album_type: string;
  image_url: string;
  external_url: string;
}

export interface ArtistRow {
  id: string;
  name: string;
  genres: string; // JSON array string
  popularity: number;
  followers: number;
  synced_at: number;
}

export interface GenreGroup {
  genre: string;
  artists: Array<{ id: string; name: string; popularity: number }>;
}

export interface NewRelease {
  id: string;
  name: string;
  artists: string[];
  release_date: string;
  album_type: string;
  image_url: string;
  spotify_url: string;
}
