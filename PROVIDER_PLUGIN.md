# Provider Plugin Development Guide

TransMule supports user-uploaded media provider plugins. Providers are plain `.js` files that follow a simple interface, letting you add custom media sources for any content type — movies, TV shows, games, software, or anything else.

---

## Quick Start

Create a file `my-provider.js` and upload it via **Settings → Providers → Upload Plugin**.

```js
// my-provider.js
export default {
  meta: {
    id: "my-provider", // unique string — must not clash with built-ins
    name: "My Provider", // display name shown in the UI
    icon: "mdi-magnify", // MDI icon class (https://pictogrammers.com/library/mdi/)
    mediaType: "movies", // any string — creates a sidebar section with that name
    description: "My custom provider searches an awesome source.",
  },

  // Required: search / browse items
  async list({ query, page, filters }) {
    const res = await fetch(
      `https://example.com/api?q=${encodeURIComponent(query)}&page=${page}`,
    );
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
    const res = await fetch(
      `https://example.com/api/detail?url=${encodeURIComponent(url)}`,
    );
    const data = await res.json();
    return {
      id: data.id,
      title: data.title,
      description: data.overview,
      year: data.year,
      rating: data.rating,
      cover: data.poster,
      links: data.torrents.map((t) => ({
        url: t.magnet,
        label: t.quality,
        size: t.size,
      })),
    };
  },
};
```

---

## Interface Reference

### `meta` (required)

| Field         | Type     | Required | Description                                                                                                                                                       |
| ------------- | -------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`          | `string` | ✅       | Unique identifier. Use lowercase kebab-case (e.g. `"my-source"`). Must not conflict with built-in ids: `yts`, `dontorrent-movies`, `dontorrent-shows`, `showrss`. |
| `name`        | `string` | ✅       | Human-readable display name.                                                                                                                                      |
| `icon`        | `string` | ✅       | MDI icon CSS class (e.g. `"mdi-movie"`, `"mdi-television-play"`). Full list at [Pictogrammers](https://pictogrammers.com/library/mdi/).                           |
| `mediaType`   | `string` | ✅       | The content category for this provider (e.g. `"movies"`, `"shows"`, `"games"`). A sidebar section is automatically created for each unique value.                 |
| `description` | `string` | —        | Short description shown in Settings.                                                                                                                              |

---

### `list(params)` (required)

Called when the user searches or browses.

```ts
interface ListParams {
  query: string; // search query (may be empty for browse)
  page: number; // 1-based page number
  filters: Record<string, string>; // key/value from declared filters
}

interface ListResult {
  items: MediaItem[];
  hasMore?: boolean; // true if there are more pages
  total?: number; // total number of results (optional)
  page?: number; // current page (optional, echoed back)
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
  cover?: string; // poster/thumbnail URL
  year?: number | string;
  date?: string;
  genre?: string;
  rating?: number | string;
  runtime?: number; // minutes
  description?: string;
  links?: MediaLink[]; // direct torrent/magnet links
  episodes?: MediaEpisode[]; // for TV shows
  isSeries?: boolean;
  needsDetail?: boolean; // true → detail() will be called before showing links
  sourceUrl?: string; // URL passed to detail() when needsDetail is true
}
```

### `MediaLink` object

```ts
interface MediaLink {
  url: string; // magnet: or https:// torrent URL
  label?: string; // e.g. "1080p BluRay"
  quality?: string;
  type?: string;
  size?: string; // human-readable, e.g. "2.3 GB"
  seeds?: number;
  hash?: string; // info hash (without magnet prefix)
}
```

### `MediaEpisode` object (for shows)

```ts
interface MediaEpisode {
  code: string; // e.g. "S01E03"
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

## Plugin Installation SPI (advanced)

Beyond data providers, a plugin can **install its own middleware API routes** and **declare a settings section** for the frontend. The core is fully generic and never references a plugin by id.

```js
export default {
  meta: { id, name, icon, pluginType, capability: "cardigann" },

  // (optional) receive injected core services
  install(ctx) {
    ctx.storage.set("key", value);        // persisted JSON, scoped to this plugin
    ctx.interval(() => sync(), 86400000); // recurring task (returns a cancel fn)
    ctx.log("hello");                     // scoped logger
  },

  // data methods (media: list/detail/cover; torrent-search: search)
  async search(query, limit, extraTrackers) { ... },

  // (optional) API routes installed by the plugin
  routes: {
    "GET /definitions": (ctx) => ({ ... }),
    "POST /instances": (ctx) => ({ ... }),
  },

  // (optional) settings-section descriptor (rendered generically)
  settings: { type: "collection-manager", ... },
};
```

- **`routes`** — keys are `"METHOD /path/:param"`, dispatched under `/api/plugins/:pluginId/...`. Handlers receive `{ params, query, body, method }` and return JSON (or throw `ctx.httpError(code, msg)`).
- **`settings`** — a `collection-manager` descriptor (toolbar + catalog list + per-item dynamic form) rendered by the generic `CollectionManager` component.
- **`capability`** — declares core capabilities the plugin needs (e.g. `"cardigann"`, a generic Jackett/Cardigann indexer engine) which are injected into `install(ctx)`.

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
