import { getContainerLogs } from "~/utils/docker-client";

defineRouteMeta({
  openAPI: {
    tags: ["slskd"],
    summary: "Get slskd logs",
    description: "Retrieves slskd container logs from Docker.",
    responses: {
      200: { description: "Normalized log entries" },
    },
  },
});

type LogLevel = "debug" | "info" | "warning" | "error" | "critical" | "other";

interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  message: string;
}

function detectLevel(text: string): LogLevel {
  const lower = text.toLowerCase();
  if (lower.includes("critical") || lower.includes("fatal")) return "critical";
  if (lower.includes("error") || lower.includes("exception")) return "error";
  if (lower.includes("warn")) return "warning";
  if (lower.includes("debug") || lower.includes("trace")) return "debug";
  if (lower.includes("info")) return "info";
  return "other";
}

function parseDockerTimestamp(line: string): { ts: string; rest: string } | null {
  const spaceIdx = line.indexOf(" ");
  if (spaceIdx === -1) return null;
  const candidate = line.slice(0, spaceIdx);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(candidate)) return null;
  return { ts: candidate, rest: line.slice(spaceIdx + 1).trim() };
}

export default defineEventHandler(async (event) => {
  requireUser(event);

  const query = getQuery(event);
  const limitRaw = Number.parseInt(String(query.limit ?? "200"), 10);
  const limit = Number.isFinite(limitRaw) ? Math.max(10, Math.min(2000, limitRaw)) : 200;
  const levelFilter = typeof query.level === "string" ? query.level.trim().toLowerCase() : "all";

  const entries: LogEntry[] = [];

  try {
    const lines = await getContainerLogs("slskd", {
      tail: limit,
      timestamps: true,
    });
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const parsed = parseDockerTimestamp(line);
      if (parsed) {
        entries.push({
          id: `slskd-${i}`,
          timestamp: parsed.ts,
          level: detectLevel(parsed.rest),
          message: parsed.rest,
        });
      } else {
        entries.push({
          id: `slskd-${i}`,
          timestamp: new Date().toISOString(),
          level: detectLevel(line),
          message: line,
        });
      }
    }
  } catch {
    // Docker socket not available
  }

  let filtered = entries;
  if (levelFilter !== "all") {
    filtered = filtered.filter((e) => e.level === levelFilter);
  }

  const total = filtered.length;
  const sliced = filtered.slice(-limit);
  const newestFirst = [...sliced].reverse();

  return {
    source: "docker:transmule-slskd",
    total,
    count: newestFirst.length,
    items: newestFirst,
    fetchedAt: new Date().toISOString(),
  };
});
