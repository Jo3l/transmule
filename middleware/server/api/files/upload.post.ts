import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

defineRouteMeta({
  openAPI: {
    tags: ["File Manager"],
    summary: "Upload files",
    description:
      "Upload one or more files to the downloads directory. " +
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
  const form = await readMultipartFormData(event);
  if (!form || form.length === 0) {
    throw createError({ statusCode: 400, statusMessage: "No multipart data" });
  }

  const root = getDownloadsRoot();

  // Target directory (relative)
  const dirField = form.find((f) => f.name === "dir");
  const relDir = dirField?.data?.toString() || "";
  const targetDir = resolveSafe(root, relDir);

  // Ensure directory exists
  if (!existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true });
  }

  const uploaded: string[] = [];
  const errors: string[] = [];

  for (const field of form) {
    if (!field.filename || !field.data) continue;

    // Sanitize filename: strip path separators
    const safeName = field.filename.replace(/[/\\]/g, "_");
    const dest = join(targetDir, safeName);

    // Validate dest is within root
    try {
      resolveSafe(root, dest.slice(root.length).replace(/^[/\\]/, ""));
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
