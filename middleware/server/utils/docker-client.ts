/**
 * Docker Engine API client — talks to the Docker daemon over the Unix socket.
 *
 * Used to start / stop / inspect sibling containers (aMule, Transmission)
 * from the middleware container that has `/var/run/docker.sock` mounted.
 */

import { request as httpRequest, type RequestOptions } from "node:http";
import { existsSync } from "node:fs";

const DEFAULT_SOCKET_PATH = "/var/run/docker.sock";
const ROOTLESS_SOCKET_PATH = `/run/user/${process.getuid?.() ?? 1000}/docker.sock`;

function socketFromDockerHost(): string | null {
  const raw = process.env.DOCKER_HOST?.trim();
  if (!raw) return null;
  if (!raw.startsWith("unix://")) return null;
  const path = raw.slice("unix://".length);
  return path || null;
}

function resolveSocketPath(): string {
  const explicit = process.env.NITRO_DOCKER_SOCKET?.trim();
  if (explicit) return explicit;

  const fromDockerHost = socketFromDockerHost();
  if (fromDockerHost) return fromDockerHost;

  if (existsSync(DEFAULT_SOCKET_PATH)) return DEFAULT_SOCKET_PATH;
  if (existsSync(ROOTLESS_SOCKET_PATH)) return ROOTLESS_SOCKET_PATH;

  return DEFAULT_SOCKET_PATH;
}

function normalizeApiVersion(value: string | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("v")) return trimmed;
  return `v${trimmed}`;
}

const SOCKET_PATH = resolveSocketPath();
const API_VERSION = normalizeApiVersion(process.env.NITRO_DOCKER_API_VERSION);

function apiPath(path: string): string {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return API_VERSION ? `/${API_VERSION}${cleanPath}` : cleanPath;
}

// Container names as set by docker-compose
const CONTAINER_NAMES: Record<string, string> = {
  amule: "transmule-amule",
  transmission: "transmule-transmission",
  pyload: "transmule-pyload",
};

export type ServiceName = keyof typeof CONTAINER_NAMES;

interface ContainerInspect {
  State: {
    Status: string; // "running" | "exited" | "paused" | …
    Running: boolean;
    StartedAt?: string; // ISO 8601
    FinishedAt?: string;
  };
}

function decodeDockerLogPayload(payload: string): string {
  const buf = Buffer.from(payload, "binary");

  // Docker may multiplex stdout/stderr as framed chunks with 8-byte headers.
  // Header layout: [stream, 0, 0, 0, size(4 bytes BE)].
  let offset = 0;
  const frames: string[] = [];

  while (offset + 8 <= buf.length) {
    const streamType = buf[offset];
    const size = buf.readUInt32BE(offset + 4);

    if (
      ![1, 2].includes(streamType) ||
      size < 0 ||
      offset + 8 + size > buf.length
    ) {
      break;
    }

    const start = offset + 8;
    const end = start + size;
    frames.push(buf.subarray(start, end).toString("utf8"));
    offset = end;
  }

  if (frames.length > 0 && offset === buf.length) {
    return frames.join("");
  }

  return buf.toString("utf8");
}

// ── Low-level helpers ────────────────────────────────────────────────────────

function dockerFetch(
  method: string,
  path: string,
  body?: string,
): Promise<{ status: number; data: string }> {
  return new Promise((resolve, reject) => {
    const opts: RequestOptions = {
      socketPath: SOCKET_PATH,
      path,
      method,
      headers: { "Content-Type": "application/json" },
    };

    const req = httpRequest(opts, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () =>
        resolve({
          status: res.statusCode || 0,
          data: Buffer.concat(chunks).toString(),
        }),
      );
    });

    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

// ── Public API ───────────────────────────────────────────────────────────────

function containerName(service: ServiceName): string {
  const name = CONTAINER_NAMES[service];
  if (!name) throw new Error(`Unknown service: ${service}`);
  return name;
}

/** Inspect a container and return its running status. */
export async function getContainerStatus(
  service: ServiceName,
): Promise<{ running: boolean; status: string; startedAt: string | null }> {
  const name = containerName(service);
  const { status, data } = await dockerFetch(
    "GET",
    apiPath(`/containers/${name}/json`),
  );

  if (status === 404)
    return { running: false, status: "not_found", startedAt: null };
  if (status !== 200)
    throw new Error(`Docker inspect failed (${status}): ${data}`);

  const info: ContainerInspect = JSON.parse(data);
  return {
    running: info.State.Running,
    status: info.State.Status,
    startedAt: info.State.Running ? info.State.StartedAt || null : null,
  };
}

/** Start a stopped container. */
export async function startContainer(service: ServiceName): Promise<void> {
  const name = containerName(service);
  const { status, data } = await dockerFetch(
    "POST",
    apiPath(`/containers/${name}/start`),
  );
  // 204 = started, 304 = already running
  if (status !== 204 && status !== 304)
    throw new Error(`Docker start failed (${status}): ${data}`);
}

/** Stop a running container (10 s timeout). */
export async function stopContainer(service: ServiceName): Promise<void> {
  const name = containerName(service);
  const { status, data } = await dockerFetch(
    "POST",
    apiPath(`/containers/${name}/stop?t=10`),
  );
  // 204 = stopped, 304 = already stopped
  if (status !== 204 && status !== 304)
    throw new Error(`Docker stop failed (${status}): ${data}`);
}

/** Get the status of all managed services. */
export async function getAllServicesStatus(): Promise<
  Record<
    ServiceName,
    { running: boolean; status: string; startedAt: string | null }
  >
> {
  const [amule, transmission, pyload] = await Promise.all([
    getContainerStatus("amule"),
    getContainerStatus("transmission"),
    getContainerStatus("pyload"),
  ]);
  return { amule, transmission, pyload };
}

/**
 * Read recent container logs.
 * Returns plain text lines (timestamped when requested).
 */
export async function getContainerLogs(
  service: ServiceName,
  options?: { tail?: number; timestamps?: boolean },
): Promise<string[]> {
  const name = containerName(service);
  const tail = Number.isFinite(options?.tail)
    ? Math.max(1, Math.min(5000, Math.trunc(options!.tail!)))
    : 400;
  const timestamps = options?.timestamps !== false;

  const query = new URLSearchParams({
    stdout: "1",
    stderr: "1",
    tail: String(tail),
    timestamps: timestamps ? "1" : "0",
  });

  const { status, data } = await dockerFetch(
    "GET",
    apiPath(`/containers/${name}/logs?${query.toString()}`),
  );

  if (status === 404) return [];
  if (status !== 200)
    throw new Error(`Docker logs failed (${status}): ${data}`);

  const text = decodeDockerLogPayload(data);
  return text
    .split(/\r?\n/g)
    .map((line) => line.trimEnd())
    .filter(Boolean);
}
