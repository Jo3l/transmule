/**
 * Docker Engine API client — talks to the Docker daemon over the Unix socket.
 *
 * Used to start / stop / inspect sibling containers (aMule, Transmission)
 * from the middleware container that has `/var/run/docker.sock` mounted.
 */

import { request as httpRequest, type RequestOptions } from "node:http";

const SOCKET_PATH = "/var/run/docker.sock";

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
    `/v1.47/containers/${name}/json`,
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
    `/v1.47/containers/${name}/start`,
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
    `/v1.47/containers/${name}/stop?t=10`,
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
