/**
 * POST /api/files/remote-mounts/validate
 *
 * Test an SMB connection without creating a persistent mount.
 * Uses smbclient to list the share and confirm connectivity.
 */

import { spawn } from "node:child_process";

defineRouteMeta({
  openAPI: {
    tags: ["File Manager"],
    summary: "Validate SMB connection",
    responses: {
      200: { description: "{ ok: boolean, error?: string }" },
      400: { description: "Invalid parameters" },
    },
  },
});

export default defineEventHandler(async (event) => {
  requireUser(event);

  const body = await readBody(event);
  const { host, share, path, domain, username, password } = body || {};

  if (!host || !share) {
    throw createError({ statusCode: 400, statusMessage: "host and share are required" });
  }

  const sharePath = `//${host}/${share}`;
  const creds = password ? `${username || ""}%${password}` : (username || "");
  const args = [sharePath];
  if (username) args.push("-U", creds);
  if (domain) args.push("-W", domain);

  // List the specified subpath (or root if none)
  const remotePath = path
    ? `\\${String(path).replace(/\//g, "\\")}`
    : "";
  const cmd = remotePath ? `ls "${remotePath}\\*"` : "ls";

  try {
    await new Promise<string>((resolve, reject) => {
      const child = spawn("smbclient", [...args, "-c", cmd], {
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 15000,
      });
      let stdout = "", stderr = "";
      child.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
      child.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
      child.on("close", (code) => {
        if (code === 0) resolve(stdout);
        else reject(new Error(stderr.trim() || `smbclient exit ${code}`));
      });
      child.on("error", reject);
    });

    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err.message || "Connection failed" };
  }
});
