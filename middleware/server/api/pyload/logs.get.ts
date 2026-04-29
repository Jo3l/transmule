import { getContainerLogs } from "~/utils/docker-client";

defineRouteMeta({
  openAPI: {
    tags: ["pyLoad"],
    summary: "Get pyLoad logs",
    description:
      "Fetches pyLoad logs from available API commands and returns normalized entries with optional filtering.",
    responses: {
      200: { description: "Normalized pyLoad log entries" },
      502: { description: "pyLoad connection error" },
    },
  },
});

type LogLevel = "debug" | "info" | "warning" | "error" | "critical" | "other";

interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  message: string;
  raw?: unknown;
}

function detectLevel(value: string): LogLevel {
  const text = value.toLowerCase();
  if (text.includes("critical") || text.includes("fatal")) return "critical";
  if (text.includes("error") || text.includes("exception")) return "error";
  if (text.includes("warn")) return "warning";
  if (text.includes("debug") || text.includes("trace")) return "debug";
  if (text.includes("info")) return "info";
  return "other";
}

function normalizeTimestamp(value: unknown): string {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number" && Number.isFinite(value)) {
    const ts = value > 1e12 ? value : value * 1000;
    return new Date(ts).toISOString();
  }
  return new Date().toISOString();
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  return [];
}

function fromObjectLike(
  source: Record<string, unknown>,
  index: number,
): LogEntry {
  const message =
    typeof source.message === "string"
      ? source.message
      : typeof source.msg === "string"
        ? source.msg
        : typeof source.text === "string"
          ? source.text
          : JSON.stringify(source);

  const explicitLevel =
    typeof source.level === "string"
      ? source.level
      : typeof source.severity === "string"
        ? source.severity
        : "";

  const timestamp = normalizeTimestamp(
    source.time ?? source.timestamp ?? source.ts ?? source.date,
  );

  const level = explicitLevel
    ? detectLevel(explicitLevel)
    : detectLevel(message);

  return {
    id: `${timestamp}-${index}`,
    timestamp,
    level,
    message,
    raw: source,
  };
}

function normalizeLogEntries(data: unknown): LogEntry[] {
  const nowIso = new Date().toISOString();

  if (typeof data === "string") {
    return data
      .split(/\r?\n/g)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((message, index) => ({
        id: `${nowIso}-${index}`,
        timestamp: nowIso,
        level: detectLevel(message),
        message,
      }));
  }

  if (Array.isArray(data)) {
    const flattened = data.flatMap((item) => {
      if (typeof item === "string") return [item];
      if (Array.isArray(item)) return item.map((entry) => String(entry ?? ""));
      if (item && typeof item === "object") return [item];
      return [String(item ?? "")];
    });

    return flattened
      .map((item, index) => {
        if (typeof item === "string") {
          const message = item.trim();
          return {
            id: `${nowIso}-${index}`,
            timestamp: nowIso,
            level: detectLevel(message),
            message,
          } as LogEntry;
        }

        return fromObjectLike(item as Record<string, unknown>, index);
      })
      .filter((entry) => entry.message.trim().length > 0);
  }

  if (data && typeof data === "object") {
    const payload = data as Record<string, unknown>;

    if (typeof payload.content === "string") {
      return normalizeLogEntries(payload.content);
    }

    const candidates = [
      payload.logs,
      payload.log,
      payload.messages,
      payload.entries,
      payload.items,
      payload.events,
      payload.data,
    ];

    for (const candidate of candidates) {
      if (Array.isArray(candidate) || typeof candidate === "string") {
        const normalized = normalizeLogEntries(candidate);
        if (normalized.length > 0) return normalized;
      }
    }

    const nestedArrays = Object.values(payload).filter((value) =>
      Array.isArray(value),
    );
    if (nestedArrays.length > 0) {
      return normalizeLogEntries(
        nestedArrays.flatMap((value) => asArray(value)),
      );
    }

    return [fromObjectLike(payload, 0)];
  }

  return [];
}

export default defineEventHandler(async (event) => {
  requireUser(event);

  const query = getQuery(event);
  const q = typeof query.q === "string" ? query.q.trim().toLowerCase() : "";
  const levelFilter =
    typeof query.level === "string" ? query.level.trim().toLowerCase() : "all";
  const limitRaw = Number.parseInt(String(query.limit ?? "400"), 10);
  const limit = Number.isFinite(limitRaw)
    ? Math.max(10, Math.min(2000, limitRaw))
    : 400;

  const client = usePyLoadClient();

  let command = "unavailable";
  let data: unknown = [];
  let warning = "";

  try {
    const result = await client.getLogs(limit);
    command = result.command;
    data = result.data;
  } catch (err: any) {
    const detail = String(
      err?.statusMessage || err?.message || "unknown error",
    );

    try {
      const dockerLines = await getContainerLogs("pyload", {
        tail: limit,
        timestamps: true,
      });
      command = "docker:transmule-pyload";
      data = dockerLines;
      warning = `pyLoad API log endpoint unavailable: ${detail}`;
    } catch (dockerErr: any) {
      const dockerDetail = String(
        dockerErr?.statusMessage ||
          dockerErr?.message ||
          "unknown docker error",
      );
      console.error(
        "Failed to fetch pyLoad logs via API and Docker fallback:",
        { apiError: detail, dockerError: dockerDetail },
      );
      warning = `pyLoad log endpoint unavailable: ${detail}; docker fallback failed: ${dockerDetail}`;
    }
  }

  let items = normalizeLogEntries(data);

  if (levelFilter !== "all") {
    items = items.filter((entry) => entry.level === levelFilter);
  }

  if (q) {
    items = items.filter((entry) => {
      return (
        entry.message.toLowerCase().includes(q) ||
        entry.level.toLowerCase().includes(q) ||
        entry.timestamp.toLowerCase().includes(q)
      );
    });
  }

  const total = items.length;
  const sliced = items.slice(-limit);
  const newestFirst = [...sliced].reverse();

  return {
    source: command,
    total,
    count: newestFirst.length,
    items: newestFirst,
    warning: warning || undefined,
    fetchedAt: new Date().toISOString(),
  };
});
