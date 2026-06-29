import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

defineRouteMeta({
  openAPI: {
    tags: ["File Manager"],
    summary: "Upload files",
    description:
      "Upload one or more files to the downloads directory or a remote mount. " +
      "Send as multipart/form-data with a `dir` text field (relative destination path) " +
      "and one or more `files` file fields.",
    responses: {
      200: { description: "Files uploaded" },
      400: { description: "No files in request" },
      503: { description: "Downloads directory not configured" },
    },
  },
});

export default defineEventHandler(async (event) => {
  requireUser(event);

  const form = await readMultipartFormData(event);
  if (!form || form.length === 0) {
    throw createError({ statusCode: 400, statusMessage: "No multipart data" });
  }

  const root = getDownloadsRoot();

  // Target directory (relative)
  const dirField = form.find((f) => f.name === "dir");
  const relDir = dirField?.data?.toString() || "";

  // Check if target is inside a remote mount
  const mountInfo = resolveMountPath(relDir);
  let smbClient: ReturnType<typeof createSmbClient> | null = null;
  let remoteBase = "";

  if (mountInfo) {
    const { mount, subPath } = mountInfo;
    smbClient = createSmbClient(mount);
    // Store the raw subPath — the provider's getRemotePath() builds the full remote path
    remoteBase = subPath;
  } else {
    const targetDir = resolveSafe(root, relDir);
    if (!existsSync(targetDir)) {
      mkdirSync(targetDir, { recursive: true });
    }
  }

  const uploaded: string[] = [];
  const errors: string[] = [];

  for (const field of form) {
    if (!field.filename || !field.data) continue;

    // Sanitize filename: strip path separators
    const safeName = field.filename.replace(/[/\\\\]/g, "_");

    try {
      if (smbClient) {
        // Build path relative to mount root — provider's getRemotePath() will prepend the mount path
        const remotePath = remoteBase ? `${remoteBase}\\${safeName}` : safeName;
        try {
          const writable = await withTimeout(smbClient.createWriteStream(remotePath), 8000);
          const readable = Readable.from([field.data]);
          await pipeline(readable, writable);
        } catch (err: any) {
          // SMB2 may close the write stream before it finishes, producing
          // STATUS_FILE_CLOSED even though the file was fully written.
          // Check if the file exists remotely and treat as success if so.
          try {
            await withTimeout(smbClient.stat(remotePath), 8000);
            // file exists — write succeeded despite the error
          } catch {
            throw err; // file doesn't exist, real failure
          }
        }
        uploaded.push(safeName);
      } else {
        const dest = join(resolveSafe(root, relDir), safeName);
        resolveSafe(root, dest.slice(root.length).replace(/^[/\\\\]/, ""));
        writeFileSync(dest, field.data);
        uploaded.push(safeName);
      }
    } catch (err: any) {
      errors.push(`${field.filename}: ${err.message}`);
    }
  }

  if (smbClient) {
    try {
      smbClient.disconnect();
    } catch {
      /* ignore */
    }
  }

  if (uploaded.length === 0 && errors.length > 0) {
    throw createError({ statusCode: 500, statusMessage: errors.join("; ") });
  }

  return { ok: true, uploaded, errors };
});
