# aMule API Middleware

A [Nitro](https://nitro.unjs.io/) server that acts as a REST API middleware for the aMule web interface, solving its key limitations:

| Problem                                                                        | Solution                                                                       |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| **Single-threaded** — concurrent requests hang/crash the web server            | All requests are serialised through a FIFO queue with configurable delay       |
| **No CORS** — browsers block cross-origin calls                                | CORS headers added to every response                                           |
| **Awkward auth flow** — `login.php` logs you _out_ if accessed while logged in | Middleware manages the session cookie internally; auto-re-login on expiry      |
| **Always HTTP 200** — even errors come back as 200                             | Middleware returns proper status codes (401, 400, etc.)                        |
| **Legacy PHP URLs** — `amuleweb-main-dload.php?command=pause&{hash}=on`        | Clean REST endpoints: `POST /api/downloads { action: "pause", hashes: [...] }` |

## Quick Start

```bash
# Install
npm install

# Development (hot-reload)
npm run dev

# Production build
npm run build
npm run preview
```

## Configuration

Create a `.env` file (or set environment variables):

```env
NITRO_AMULE_URL=http://192.168.31.89:4711
NITRO_AMULE_PASSWORD=your_password
NITRO_REQUEST_DELAY=1500
```

| Variable               | Default                     | Description                                      |
| ---------------------- | --------------------------- | ------------------------------------------------ |
| `NITRO_AMULE_URL`      | `http://192.168.31.89:4711` | aMule web interface URL                          |
| `NITRO_AMULE_PASSWORD` | _(empty)_                   | Web interface password                           |
| `NITRO_REQUEST_DELAY`  | `1500`                      | Minimum ms between consecutive requests to aMule |

## API Documentation (Swagger)

Once the server is running, open:

- **Scalar UI:** [http://localhost:3000/\_scalar](http://localhost:3000/_scalar)
- **OpenAPI JSON:** [http://localhost:3000/\_openapi.json](http://localhost:3000/_openapi.json)

## Endpoints

### Authentication

| Method | Path               | Description            |
| ------ | ------------------ | ---------------------- |
| `POST` | `/api/auth/login`  | Login (`{ password }`) |
| `POST` | `/api/auth/logout` | Logout                 |
| `GET`  | `/api/auth/status` | Session & queue status |

### Downloads

| Method | Path             | Description                                                                 |
| ------ | ---------------- | --------------------------------------------------------------------------- |
| `GET`  | `/api/downloads` | List downloads (query: `sort`, `filter_status`, `filter_category`)          |
| `POST` | `/api/downloads` | Actions: `pause`, `resume`, `cancel`, `prioup`, `priodown`, `add`, `filter` |

### Search

| Method | Path          | Description                                              |
| ------ | ------------- | -------------------------------------------------------- |
| `GET`  | `/api/search` | Get search results (query: `sort`)                       |
| `POST` | `/api/search` | Actions: `search` (start new), `download` (grab results) |

### Servers

| Method | Path           | Description                                |
| ------ | -------------- | ------------------------------------------ |
| `GET`  | `/api/servers` | List ED2K servers (query: `sort`)          |
| `POST` | `/api/servers` | Actions: `connect`, `disconnect`, `remove` |

### Shared Files

| Method | Path          | Description                             |
| ------ | ------------- | --------------------------------------- |
| `GET`  | `/api/shared` | List shared files (query: `sort`)       |
| `POST` | `/api/shared` | Actions: `reload`, `prioup`, `priodown` |

### Statistics & KAD

| Method | Path         | Description                        |
| ------ | ------------ | ---------------------------------- |
| `GET`  | `/api/stats` | Statistics (query: `include_tree`) |
| `GET`  | `/api/kad`   | KAD status                         |
| `POST` | `/api/kad`   | Action: `bootstrap`                |

### Logs

| Method | Path       | Description                                     |
| ------ | ---------- | ----------------------------------------------- | -------- | ---------- |
| `GET`  | `/api/log` | Get logs (query: `type` = all / amule / server) |
| `POST` | `/api/log` | Reset logs (`{ target: "amule"                  | "server" | "both" }`) |

### Preferences

| Method | Path         | Description                                |
| ------ | ------------ | ------------------------------------------ |
| `GET`  | `/api/prefs` | Get current preferences                    |
| `POST` | `/api/prefs` | Apply preferences (send only changed keys) |

### Raw (Legacy)

| Method | Path                  | Description                  |
| ------ | --------------------- | ---------------------------- |
| `GET`  | `/api/raw/log`        | Raw log text (query: `show`) |
| `GET`  | `/api/raw/stats-tree` | Recursive stats tree         |

## Example Usage

```js
const BASE = "http://localhost:3000";

// Login
await fetch(`${BASE}/api/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ password: "mypass" }),
});

// Get downloads
const res = await fetch(`${BASE}/api/downloads?sort=name`);
const data = await res.json();
console.log(data.downloads.files);

// Pause a file
await fetch(`${BASE}/api/downloads`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    action: "pause",
    hashes: ["abc123def456abc123def456abc123de"],
  }),
});

// Start a search
await fetch(`${BASE}/api/search`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    action: "search",
    query: "ubuntu iso",
    type: "Global",
  }),
});
```

## Architecture

```
Client  ──►  Nitro Middleware  ──►  aMule Web Server (PHP)
              │                      │
              ├─ CORS headers        ├─ Single-threaded
              ├─ Request queue       ├─ No CORS
              ├─ Session mgmt        ├─ Cookie auth
              ├─ Clean REST API      ├─ Legacy PHP URLs
              └─ Swagger docs        └─ Always HTTP 200
```

## License

Same as [AmuleWebUI-Reloaded](../AmuleWebUI-Reloaded/LICENSE).
