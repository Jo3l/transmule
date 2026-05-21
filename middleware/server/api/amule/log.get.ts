import { getContainerLogs } from "../../utils/docker-client";

defineRouteMeta({
  openAPI: {
    tags: ["Logs"],
    summary: "Get aMule logs",
    description:
      "Retrieve aMule daemon logs from Docker container and EC protocol. Returns normalized log entries with optional filtering, similar to the pyLoad logs endpoint.",
    responses: {
      200: { description: "Normalized log entries" },
      502: { description: "aMule connection error" },
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
  // Docker timestamps look like: 2024-12-21T10:30:00.123456789Z message
  // The timestamp is up to the first space, in RFC3339 format
  const spaceIdx = line.indexOf(" ");
  if (spaceIdx === -1) return null;

  const candidate = line.slice(0, spaceIdx);
  // Validate it looks like an ISO timestamp
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(candidate)) return null;

  return { ts: candidate, rest: line.slice(spaceIdx + 1).trim() };
}

export default defineEventHandler(async (event) => {
  requireUser(event);

  const query = getQuery(event);
  const q = typeof query.q === "string" ? query.q.trim().toLowerCase() : "";
  const levelFilter = typeof query.level === "string" ? query.level.trim().toLowerCase() : "all";
  const limitRaw = Number.parseInt(String(query.limit ?? "400"), 10);
  const limit = Number.isFinite(limitRaw) ? Math.max(10, Math.min(2000, limitRaw)) : 400;

  // Collect log entries from both sources
  const entries: LogEntry[] = [];

  // 1. Docker container logs
  let dockerSource = "";
  try {
    const containerLines = await getContainerLogs("amule", {
      tail: limit,
      timestamps: true,
    });
    if (containerLines.length > 0) {
      dockerSource = "docker:transmule-amule";
      for (let i = 0; i < containerLines.length; i++) {
        const line = containerLines[i];
        const parsed = parseDockerTimestamp(line);
        if (parsed) {
          entries.push({
            id: `docker-${i}`,
            timestamp: parsed.ts,
            level: detectLevel(parsed.rest),
            message: parsed.rest,
          });
        } else {
          // Line without recognizable timestamp — treat as EC-style
          entries.push({
            id: `docker-${i}`,
            timestamp: new Date().toISOString(),
            level: detectLevel(line),
            message: line,
          });
        }
      }
    }
  } catch {
    // Docker socket not available
  }

  // 2. EC protocol logger messages
  let ecSource = "";
  try {
    const client = useAmuleClient();
    const stats = await client.getStats();
    const ecMessages: string[] = stats.loggerMessage || [];
    if (ecMessages.length > 0) {
      ecSource = "ec:amule";
      const nowIso = new Date().toISOString();
      for (let i = 0; i < ecMessages.length; i++) {
        const msg = ecMessages[i].trim();
        if (!msg) continue;
        entries.push({
          id: `ec-${i}`,
          timestamp: nowIso,
          level: detectLevel(msg),
          message: msg,
        });
      }
    }
  } catch {
    // EC might fail if aMule isn't running — that's ok
  }

  const source = dockerSource || ecSource || "unavailable";

  // 3. Filter by level
  let filtered = entries;
  if (levelFilter !== "all") {
    filtered = filtered.filter((entry) => entry.level === levelFilter);
  }

  // 4. Filter by search query
  if (q) {
    filtered = filtered.filter((entry) => {
      return (
        entry.message.toLowerCase().includes(q) ||
        entry.level.toLowerCase().includes(q) ||
        entry.timestamp.toLowerCase().includes(q)
      );
    });
  }

  // 5. Slice and reverse (newest first)
  const total = filtered.length;
  const sliced = filtered.slice(-limit);
  const newestFirst = [...sliced].reverse();

  return {
    source,
    total,
    count: newestFirst.length,
    items: newestFirst,
    fetchedAt: new Date().toISOString(),
  };
});
