# TransMule Middleware

A [Nitro](https://nitro.unjs.io/) REST API server that bridges the TransMule frontend with aMule, Transmission and pyLoad NG.

- Talks to **aMule** via its binary EC (External Connector) protocol on port 4712 — no dependency on aMule's PHP web server
- Talks to **Transmission** via its JSON-RPC API
- Talks to **pyLoad NG** via its HTTP API
- JWT-based multi-user authentication with SQLite storage
- CORS handling and clean REST endpoints

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
NITRO_AMULE_HOST=127.0.0.1
NITRO_AMULE_PORT=4712
NITRO_AMULE_PASSWORD=your_ec_password
NITRO_TRANSMISSION_URL=http://127.0.0.1:9091/transmission/rpc
NITRO_PYLOAD_URL=http://127.0.0.1:8000
NITRO_JWT_SECRET=change-me
```

| Variable                      | Default                                      | Description                         |
| ----------------------------- | -------------------------------------------- | ----------------------------------- |
| `NITRO_AMULE_HOST`            | `192.168.31.89`                              | aMule host (EC protocol, port 4712) |
| `NITRO_AMULE_PORT`            | `4712`                                       | aMule EC port                       |
| `NITRO_AMULE_PASSWORD`        | _(empty)_                                    | aMule EC password                   |
| `NITRO_TRANSMISSION_URL`      | `http://192.168.31.89:9091/transmission/rpc` | Transmission RPC endpoint           |
| `NITRO_TRANSMISSION_USERNAME` | _(empty)_                                    | Transmission RPC username           |
| `NITRO_TRANSMISSION_PASSWORD` | _(empty)_                                    | Transmission RPC password           |
| `NITRO_PYLOAD_URL`            | `http://pyload:8000`                         | pyLoad NG API base URL              |
| `NITRO_PYLOAD_USERNAME`       | `pyload`                                     | pyLoad username                     |
| `NITRO_PYLOAD_PASSWORD`       | `pyload`                                     | pyLoad password                     |
| `NITRO_JWT_SECRET`            | `amule-middleware-change-this-secret`        | Secret for signing JWT tokens       |

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
Frontend (Nuxt)  ──►  Nitro Middleware  ──►  aMule (EC :4712)
                            │            ──►  Transmission RPC (:9091)
                            │            ──►  pyLoad NG API (:8000)
                            │
                    ├─ JWT auth (SQLite)
                    ├─ CORS headers
                    └─ Swagger docs (/_scalar)
```
