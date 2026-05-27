/**
 * POST /api/files/remote-mounts
 *
 * Create a new remote mount (SMB or WebDAV).
 */

import { randomUUID } from "node:crypto";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function sanitizeSegment(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.includes("/") || trimmed.includes("\\")) return null;
  if (trimmed === "." || trimmed === "..") return null;
  return trimmed;
}

function sanitizeRemotePath(value?: string, isWebdav = false): string | undefined {
  if (!value || typeof value !== "string") return undefined;
  const separator = isWebdav ? "/" : "\\";
  const clean = value
    .replace(/\\/g, "/")
    .split("/")
    .map((s) => s.trim())
    .filter((s) => s && s !== "." && s !== "..")
    .join(separator);
  return clean || undefined;
}

defineRouteMeta({
  openAPI: {
    tags: ["File Manager"],
    summary: "Create remote mount",
    responses: {
      200: { description: "Mount created" },
      400: { description: "Invalid parameters" },
      409: { description: "Name already in use" },
    },
  },
});

export default defineEventHandler(async (event) => {
  requireUser(event);

  const body = await readBody(event);
  const {
    name,
    type,
    host,
    share,
    url,
    path: remotePath,
    domain,
    username,
    password,
    readOnly,
  } = body || {};

  if (
    !name ||
    typeof name !== "string" ||
    !username ||
    typeof username !== "string" ||
    !password ||
    typeof password !== "string"
  ) {
    throw createError({
      statusCode: 400,
      statusMessage: "name, username and password are required",
    });
  }

  if (type !== "smb" && type !== "webdav") {
    throw createError({ statusCode: 400, statusMessage: "Only 'smb' or 'webdav' types are supported" });
  }

  const trimmedName = sanitizeSegment(name);
  if (!trimmedName) {
    throw createError({
      statusCode: 400,
      statusMessage: "Invalid mount name (must not be empty, '.', '..' or contain path separators)",
    });
  }

  // Validate type-specific fields
  if (type === "smb") {
    if (!host || typeof host !== "string") {
      throw createError({ statusCode: 400, statusMessage: "host is required for SMB" });
    }
    if (!share || typeof share !== "string") {
      throw createError({ statusCode: 400, statusMessage: "share is required for SMB" });
    }
    
    const trimmedHost = host.trim();
    if (!trimmedHost || trimmedHost.includes("/") || trimmedHost.includes("\\")) {
      throw createError({ statusCode: 400, statusMessage: "Invalid host" });
    }

    const trimmedShare = sanitizeSegment(share);
    if (!trimmedShare) {
      throw createError({
        statusCode: 400,
        statusMessage: "Invalid share name",
      });
    }
  } else {
    // webdav
    if (!url || typeof url !== "string") {
      throw createError({ statusCode: 400, statusMessage: "url is required for WebDAV" });
    }
    
    try {
      new URL(url);
    } catch {
      throw createError({ statusCode: 400, statusMessage: "Invalid URL format" });
    }
  }

  // Prevent mounting over an existing local folder
  let rootEntries: string[] = [];
  let root = "";
  try {
    root = getDownloadsRoot();
    rootEntries = readdirSync(root);
  } catch {
    /* ignore read errors (e.g. root doesn't exist yet) */
  }

  for (const entry of rootEntries) {
    if (entry === trimmedName) {
      try {
        const full = join(root, entry);
        const st = statSync(full);
        if (st.isDirectory()) {
          throw createError({
            statusCode: 409,
            statusMessage: "A local folder with this name already exists",
          });
        }
      } catch (err: any) {
        if (err?.statusCode === 409) throw err;
        /* ignore stat errors */
      }
    }
  }

  const mounts = loadMounts();

  if (mounts.some((m) => m.name === trimmedName)) {
    throw createError({ statusCode: 409, statusMessage: "Mount name already exists" });
  }

  const mount: RemoteMount = {
    id: randomUUID(),
    name: trimmedName,
    type: type as "smb" | "webdav",
    host: type === "smb" ? host.trim() : undefined,
    share: type === "smb" ? sanitizeSegment(share) : undefined,
    url: type === "webdav" ? url.trim() : undefined,
    path: sanitizeRemotePath(remotePath, type === "webdav"),
    domain: type === "smb" ? domain?.trim() || undefined : undefined,
    username: username.trim(),
    password,
    readOnly: readOnly === true,
  };

  mounts.push(mount);
  saveMounts(mounts);

  return { id: mount.id, name: mount.name };
});
