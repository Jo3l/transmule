import { randomUUID } from "node:crypto";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { loadSmbConfigs, saveSmbConfigs, SmbMountConfig, getDownloadsRoot } from "~/utils/remoteMounts";

function sanitizeSegment(value: string): string | null {
  const t = value.trim();
  if (!t || t.includes("/") || t.includes("\\") || t === "." || t === "..") return null;
  return t;
}

defineRouteMeta({
  openAPI: { tags: ["File Manager"], summary: "Create SMB mount",
    responses: { 200: {}, 400: {}, 409: {} } },
});

export default defineEventHandler(async (event) => {
  requireUser(event);
  const body = await readBody(event);
  const { name, host, share, path: remotePath, domain, username, password, readOnly } = body || {};

  if (!name || !username || !password)
    throw createError({ statusCode: 400, statusMessage: "name, username and password required" });
  if (!host || !share)
    throw createError({ statusCode: 400, statusMessage: "host and share required" });

  const trimmedName = sanitizeSegment(name);
  if (!trimmedName) throw createError({ statusCode: 400, statusMessage: "Invalid mount name" });
  if (trimmedName === "downloads") throw createError({ statusCode: 400, statusMessage: "'downloads' is reserved" });

  const root = getDownloadsRoot();
  try {
    for (const entry of readdirSync(root)) {
      if (entry === trimmedName && statSync(join(root, entry)).isDirectory())
        throw createError({ statusCode: 409, statusMessage: "Local folder with this name exists" });
    }
  } catch { /* ignore */ }

  const configs = loadSmbConfigs();
  if (configs.some((c) => c.name === trimmedName))
    throw createError({ statusCode: 409, statusMessage: "Mount name already exists" });

  const config: SmbMountConfig = {
    id: randomUUID(), name: trimmedName,
    host: host.trim(), share: sanitizeSegment(share)!,
    path: remotePath?.trim() || undefined,
    domain: domain?.trim() || undefined,
    username: username.trim(), password, readOnly: readOnly === true,
  };
  configs.push(config);
  saveSmbConfigs(configs);
  return { id: config.id, name: config.name };
});
