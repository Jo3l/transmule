# Provider Plugin Development Guide

TransMule supports user-uploaded media provider plugins. Providers are plain `.js` files that follow a simple interface, letting you add custom media sources for movies or TV shows.

---

## Quick Start

Create a file `my-provider.js` and upload it via **Settings → Providers → Upload Plugin**.

```js
// my-provider.js
export default {
  meta: {
    id: "my-provider",           // unique string — must not clash with built-ins
    name: "My Provider",         // display name shown in the UI
    icon: "mdi-magnify",         // MDI icon class (https://pictogrammers.com/library/mdi/)
    mediaType: "movies",         // "movies" | "shows"
    description: "My custom provider searches an awesome source.",
  },

  // Required: search / browse items
  async list({ query, page, filters }) {
    const res = await fetch(`https://example.com/api?q=${encodeURIComponent(query)}&page=${page}`);
    const data = await res.json();
    return {
      items: data.results.map((r) => ({
        id: r.id,
        title: r.title,
        year: r.year,
        cover: r.poster_url,
        links: r.torrents.map((t) => ({ url: t.magnet, label: t.quality })),
      })),
      hasMore: data.page < data.totalPages,
      total: data.totalCount,
    };
  },

  // Optional: fetch full detail for an item (used when needsDetail = true)
  async detail(url) {
    const res = await fetch(`https://example.com/api/detail?url=${encodeURIComponent(url)}`);
    const data = await res.json();
    return {
      id: data.id,
      title: data.title,
      description: data.overview,
      year: data.year,
      rating: data.rating,
      cover: data.poster,
      links: data.torrents.map((t) => ({ url: t.magnet, label: t.quality, size: t.size })),
    };
  },
};
```

---

## Interface Reference

### `meta` (required)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `string` | ✅ | Unique identifier. Use lowercase kebab-case (e.g. `"my-source"`). Must not conflict with built-in ids: `yts`, `dontorrent-movies`, `dontorrent-shows`, `showrss`. |
| `name` | `string` | ✅ | Human-readable display name. |
| `icon` | `string` | ✅ | MDI icon CSS class (e.g. `"mdi-movie"`, `"mdi-television-play"`). Full list at [Pictogrammers](https://pictogrammers.com/library/mdi/). |
| `mediaType` | `"movies" \| "shows"` | ✅ | Which section this provider appears in. |
| `description` | `string` | — | Short description shown in Settings. |

---

### `list(params)` (required)

Called when the user searches or browses.

```ts
interface ListParams {
  query: string;          // search query (may be empty for browse)
  page: number;           // 1-based page number
  filters: Record<string, string>; // key/value from declared filters
}

interface ListResult {
  items: MediaItem[];
  hasMore?: boolean;      // true if there are more pages
  total?: number;         // total number of results (optional)
  page?: number;          // current page (optional, echoed back)
}
```

---

### `detail(url)` (optional)

Called when the user clicks a result that has `needsDetail: true`. Return the full `MediaItem` with `links` populated.

```ts
async detail(url: string): Promise<MediaItem>
```

---

### `cover(title)` (optional)

Return a cover image URL for the given title (used as fallback).

```ts
async cover(title: string): Promise<string | null>
```

---

### `filters` (optional)

Declare filter controls that appear in the search sidebar.

```js
filters: [
  {
    key: "quality",
    label: "Quality",
    type: "select",
    options: [
      { label: "Any", value: "" },
      { label: "1080p", value: "1080p" },
      { label: "4K", value: "2160p" },
    ],
    defaultValue: "",
  },
  {
    key: "genre",
    label: "Genre",
    type: "text",
    defaultValue: "",
  },
],
```

---

### `MediaItem` object

```ts
interface MediaItem {
  id: string;
  title: string;
  cover?: string;          // poster/thumbnail URL
  year?: number | string;
  date?: string;
  genre?: string;
  rating?: number | string;
  runtime?: number;        // minutes
  description?: string;
  links?: MediaLink[];     // direct torrent/magnet links
  episodes?: MediaEpisode[]; // for TV shows
  isSeries?: boolean;
  needsDetail?: boolean;   // true → detail() will be called before showing links
  sourceUrl?: string;      // URL passed to detail() when needsDetail is true
}
```

### `MediaLink` object

```ts
interface MediaLink {
  url: string;             // magnet: or https:// torrent URL
  label?: string;          // e.g. "1080p BluRay"
  quality?: string;
  type?: string;
  size?: string;           // human-readable, e.g. "2.3 GB"
  seeds?: number;
  hash?: string;           // info hash (without magnet prefix)
}
```

### `MediaEpisode` object (for shows)

```ts
interface MediaEpisode {
  code: string;            // e.g. "S01E03"
  links: MediaLink[];
  date?: string;
}
```

---

## File Format

Plugins must be plain **JavaScript** files (`.js`). Both ESM and CommonJS are supported:

**ESM (recommended)**
```js
export default { meta: { ... }, async list(...) { ... } };
```

**CommonJS**
```js
module.exports = { meta: { ... }, async list(...) { ... } };
```

> **Note:** The server runs on Node.js 18+. You can use `fetch`, `async/await`, and any built-in Node.js module (`node:crypto`, `node:https`, etc.). Third-party `npm` packages are **not** available in plugins — use `fetch` or `https` for HTTP requests.

---

## Lifecycle

1. Upload the `.js` file via Settings → Providers → Upload Plugin.
2. The server validates the export and registers it immediately (no restart needed).
3. After reloading the page the provider appears in the sidebar.
4. To update, delete the plugin and re-upload the new file.
5. Enabled/disabled state is stored in the database and survives server restarts.

---

## Security Notes

- Plugins run inside the server process with full Node.js access. **Only install plugins from trusted sources.**
- The server is only accessible by authenticated users, so plugin management is protected.
- Plugin filenames are sanitized (only `[a-zA-Z0-9._-]` characters are kept).
