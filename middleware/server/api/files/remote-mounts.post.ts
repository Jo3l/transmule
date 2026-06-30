import { randomUUID } from "node:crypto";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { loadSmbConfigs, saveSmbConfigs, SmbMountConfig } from "~/utils/remoteMounts";
import { getDownloadsRoot } from "~/utils/files";
/**
 * POST /api/files/remote-mounts
 *
 * Create a new SMB/CIFS mount configuration.
 * The share is NOT mounted immediately — it mounts on first access.
 */

import { randomUUID } from "node:crypto";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { loadSmbConfigs, saveSmbConfigs, SmbMountConfig } from "~/utils/remoteMounts";
import { getDownloadsRoot } from "~/utils/files";
import { resolveSafe } from "~/utils/files";

function sanitizeSegment(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.includes("/") || trimmed.includes("\\")) return null;
  if (trimmed === "." || trimmed === "..") return null;
  return trimmed;
}

function sanitizeRemotePath(value?: string): string | undefined {
  if (!value || typeof value !== "string") return undefined;
  const clean = value
    .replace(/\\/g, "/")
    .split("/")
    .map((s) => s.trim())
    .filter((s) => s && s !== "." && s !== "..")
    .join("/");
  return clean || undefined;
}

defineRouteMeta({
  openAPI: {
    tags: ["File Manager"],
    summary: "Create SMB mount",
    responses: { 200: { description: "Mount created" }, 400: { description: "Invalid" }, 409: { description: "Name in use" } },
  },
});

export default defineEventHandler(async (event) => {
  requireUser(event);

  const body = await readBody(event);
  const { name, host, share, path: remotePath, domain, username, password, readOnly } = body || {};

  if (!name || typeof name !== "string" || !username || typeof username !== "string" || !password || typeof password !== "string") {
    throw createError({ statusCode: 400, statusMessage: "name, username and password are required" });
  }

  if (!host || typeof host !== "string") {
    throw createError({ statusCode: 400, statusMessage: "host is required" });
  }
  if (!share || typeof share !== "string") {
    throw createError({ statusCode: 400, statusMessage: "share is required" });
  }

  const trimmedName = sanitizeSegment(name);
  if (!trimmedName) {
    throw createError({ statusCode: 400, statusMessage: "Invalid mount name" });
  }

  // Reserved name
  if (trimmedName === "downloads") {
    throw createError({ statusCode: 400, statusMessage: "'downloads' is reserved" });
  }

  const trimmedHost = host.trim();
  if (!trimmedHost || trimmedHost.includes("/") || trimmedHost.includes("\\")) {
    throw createError({ statusCode: 400, statusMessage: "Invalid host" });
  }

  const trimmedShare = sanitizeSegment(share);
  if (!trimmedShare) {
    throw createError({ statusCode: 400, statusMessage: "Invalid share name" });
  }

  // Check for conflicts with existing local folders in downloads root
  const root = getDownloadsRoot();
  try {
    const rootEntries = readdirSync(root);
    for (const entry of rootEntries) {
      if (entry === trimmedName) {
        const full = join(root, entry);
        const st = statSync(full);
        if (st.isDirectory()) {
          throw createError({ statusCode: 409, statusMessage: "A local folder with this name already exists" });
        }
      }
    }
  } catch { /* ignore */ }

  const configs = loadSmbConfigs();
  if (configs.some((c) => c.name === trimmedName)) {
    throw createError({ statusCode: 409, statusMessage: "Mount name already exists" });
  }

  const config: SmbMountConfig = {
    id: randomUUID(),
    name: trimmedName,
    host: trimmedHost,
    share: trimmedShare,
    path: sanitizeRemotePath(remotePath),
    domain: domain?.trim() || undefined,
    username: username.trim(),
    password,
    readOnly: readOnly === true,
  };

  configs.push(config);
  saveSmbConfigs(configs);

  return { id: config.id, name: config.name };
});
