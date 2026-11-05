# Adding local torrent files

Open **Add Torrent** on the Downloads page. The dialog keeps the **Magnet / URL** textarea and adds a **Torrent file** picker underneath it: pick one local `.torrent` and optionally enable **Add paused**. While a file is selected the textarea is disabled (the file wins); clearing the file gives the textarea back. Success closes the dialog; an existing torrent produces an informational message. Validation and connection errors keep the file selected so the user can retry.

The native picker works on desktop and mobile. File selection is restricted to `.torrent`; server validation remains authoritative. Browser MIME guesses are not trusted: the application sends `application/x-bittorrent` explicitly.

## API

`POST /api/transmission/upload?filename=example.torrent&paused=true`

- Authentication: existing TransMule session cookie or Bearer token, enforced by the global middleware and `requireUser`.
- Body: raw binary metainfo, `application/x-bittorrent` or `application/octet-stream`.
- Maximum: 5 MiB (5,242,880 bytes), enforced on declared and actual streamed bytes, including chunked requests. A reverse proxy may impose a smaller limit.
- Query options: `filename` (a basename ending in `.torrent`) and optional `paused=true|false`. Unknown options, including download path overrides, are rejected.
- Validation: bounded bencode parsing, dictionary ordering, complete input consumption, required info fields, v1 piece counts, multifile paths, and v2 file tree structure. Traversal components, separators and NULs are rejected. Depth is limited to 64 and parsed values to 100,000. Transmission performs final protocol and hash validation, including v2 piece layers and daemon-version support.
- Forwarding: the original bytes are Base64 encoded into `torrent-add.metainfo` using the existing Transmission client, credentials and session-ID retry. No file is written to disk. No download directory is sent; the daemon's configured directory and other defaults apply.
- Response: `{ ok: true, torrent: { id, name, hashString, duplicate }, duplicate: boolean }`. Duplicates are successful existing-torrent results, without changing their download settings.
- Errors: 400 invalid filename/options/metainfo; 401 missing or invalid session; 413 oversized file; 415 unsupported content type; 503 Transmission rejection, unavailable daemon or missing RPC result. Upstream error details are not exposed.

The existing `/api/transmission/torrents` magnet/URL endpoint remains in use. Its options and history recording are unchanged. Automatic retries are disabled for binary uploads; users can retry explicitly, and Transmission identifies duplicates.

## Isolated automated checks

Use a disposable development checkout with Node.js 22 or later (see `.nvmrc`). These commands install dependencies and run handlers against synthetic data and a mocked RPC client. They do not start the application, a Transmission daemon, Docker, background workers or real downloads, and do not read production configuration.

```bash
export NODE_OPTIONS=--max-old-space-size=1536
npm ci --prefix middleware
npm ci --prefix frontend
npm run test:torrent-upload --prefix middleware
npm run test:torrent-upload --prefix frontend
npm run build --prefix middleware
npm run build --prefix frontend
npm run lint --prefix frontend
```

Run each command to completion before starting the next; do not run installs, tests or builds in parallel. Run the focused tests before the general build and lint checks. An `ENOTCACHED` installation error means an offline cache lacks a required package; restore registry access and complete `npm ci` before considering the frontend fully validated.

Backend tests exercise the actual auth middleware, H3 events and Node readable streams in memory, including a chunked oversized request. They need no listening sockets. Frontend tests execute the dialog's TypeScript functions with a simulated API and verify validation, requests, messages, retry state, multiline magnet behavior and translation completeness. They do not replace browser interaction testing.

### Validation on 2026-11-04

- Middleware focused tests: 10 passed, including upload authentication, size limits, duplicates and the existing magnet endpoint.
- Frontend focused tests: 6 passed with the installed frontend dependencies.
- Middleware build: passed. No generated server was started.
- Frontend `npm ci` and `npm run generate`: completed successfully outside Codex, as reported by the contributor; not repeated during this review.
- Targeted frontend ESLint: the new test file passes. The Downloads page still fails existing lint rules (67 errors and 352 warnings, compared with 103 errors and 340 warnings in HEAD). No new lint error types or counts were introduced; existing Vue formatting warnings remain, with additional warnings in the new markup. Repository-wide lint was not run.

Checks in this review ran strictly sequentially with `NODE_OPTIONS=--max-old-space-size=1536`, without production services, Docker or downloads. Browser interaction and a live Transmission daemon remain unverified.

## Manual UI check

Use a separate disposable TransMule development deployment with its own test account, test-only configuration, empty downloads directory, and a separate Transmission daemon. Set its RPC URL explicitly; never use the application's default network address or production volumes. Disable external peer/tracker access or use a mocked daemon. Do not run a production compose file to test this feature.

1. Open Downloads → Add Torrent on desktop and a narrow mobile viewport. Confirm the existing dialog fits and both tabs work by keyboard and touch.
2. Select synthetic `.torrent` metainfo in the native picker, enable Add paused and submit. Confirm success and the configured test download directory; repeat to see the duplicate message.
3. Try a text file renamed `.torrent`, an empty file and a file over 5 MiB. Confirm errors and no new download.
4. Stop only the disposable test RPC daemon or simulate a network failure. Confirm the dialog retains the file and allows retry.
5. Paste multiple synthetic magnet links in the Magnet / URL tab. Confirm the existing behavior, including Add paused.
6. Confirm an unauthenticated request receives 401.

No browser screenshots or live-daemon verification were possible in the restricted implementation environment. Never use personal torrents for these checks.
