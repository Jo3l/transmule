import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { resolveVirtualPath, ensureSmbMounted, getSmbConfigByName } from "../../utils/remoteMounts";
import { getDownloadsRoot } from "../../utils/files";
defineRouteMeta({
  openAPI: {
    tags: ["File Manager"],
    summary: "Upload files",
    description:
      "Upload one or more files to the downloads directory or a mounted SMB share. " +
      "Send as multipart/form-data with a `dir` text field and `files` file fields.",
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

  const dirField = form.find((f) => f.name === "dir");
  const relDir = dirField?.data?.toString() || "";

  // Resolve target directory
  let targetDir: string;
  if (relDir) {
    const resolved = resolveVirtualPath(relDir);
    if (!resolved) {
      throw createError({ statusCode: 400, statusMessage: "Invalid destination path" });
    }
    targetDir = resolved;

    // Ensure mount if needed
    const clean = relDir.replace(/\\/g, "/").replace(/^\/+/, "");
    const firstSeg = clean.split("/")[0];
    if (firstSeg !== "downloads") {
      const cfg = getSmbConfigByName(firstSeg);
      if (cfg) {
        try { await ensureSmbMounted(cfg); } catch (err: any) {
          throw createError({ statusCode: 500, statusMessage: `Cannot mount: ${err.message}` });
        }
      }
    }
  } else {
    targetDir = root;
  }

  if (!existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true });
  }

  const uploaded: string[] = [];
  const errors: string[] = [];

  for (const field of form) {
    if (!field.filename || !field.data) continue;

    const safeName = field.filename.replace(/[/\\\\]/g, "_");
    try {
      const dest = join(targetDir, safeName);
      writeFileSync(dest, field.data);
      uploaded.push(safeName);
    } catch (err: any) {
      errors.push(`${field.filename}: ${err.message}`);
    }
  }

  if (uploaded.length === 0 && errors.length > 0) {
    throw createError({ statusCode: 500, statusMessage: errors.join("; ") });
  }

  return { ok: true, uploaded, errors };
});
