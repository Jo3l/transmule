import { basename } from "node:path";
import { requireUser } from "../../utils/requireUser";
import { createShare, findShareByCode, type ShareKind } from "../../utils/share-db";
import { shareSecret } from "../../utils/share-access";
import {
  generateCode, generateShareId, generateToken, hashCode, isValidCode, normalizeCode,
} from "../../utils/share-token";
import { isSharableRoot, normalizeVirtualPath } from "../../utils/share-paths";
import { statVirtual } from "../../utils/share-fs";

const EXPIRY_MS: Record<string, number> = {
  "1h": 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
};

const MAX_ROOTS = 50;

defineRouteMeta({
  openAPI: {
    tags: ["Shares"],
    summary: "Create a share link (QR) for files or folders",
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: {
            type: "object",
            required: ["paths"],
            properties: {
              paths: { type: "array", items: { type: "string" }, description: "Virtual paths (1..50)" },
              label: { type: "string", description: "Display name; defaults to the file/folder name" },
              withCode: { type: "boolean", description: "Protect with a 6-character code (default true)" },
              code: { type: "string", description: "Use this code instead of a generated one" },
              expiresIn: { type: "string", enum: ["1h", "24h", "7d"] },
            },
          },
        },
      },
    },
    responses: {
      201: { description: "Share created" },
      400: { description: "Invalid request" },
      404: { description: "Path not found" },
      409: { description: "Code already in use" },
    },
  },
});

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const body = await readBody(event);

  const rawPaths: unknown[] = Array.isArray(body?.paths) ? body.paths : [];
  if (!rawPaths.length) {
    throw createError({ statusCode: 400, statusMessage: "paths is required" });
  }
  if (rawPaths.length > MAX_ROOTS) {
    throw createError({ statusCode: 400, statusMessage: `at most ${MAX_ROOTS} paths per share` });
  }

  const roots: string[] = [];
  const types: Array<"file" | "dir"> = [];
  for (const raw of rawPaths) {
    const normalized = normalizeVirtualPath(raw);
    if (!normalized) {
      throw createError({ statusCode: 400, statusMessage: `invalid path: ${String(raw)}` });
    }
    if (!isSharableRoot(normalized)) {
      throw createError({ statusCode: 400, statusMessage: `cannot share a root folder: ${normalized}` });
    }
    const type = await statVirtual(normalized);
    if (!type) {
      throw createError({ statusCode: 404, statusMessage: `not found: ${normalized}` });
    }
    if (roots.includes(normalized)) continue;
    roots.push(normalized);
    types.push(type);
  }

  const kind: ShareKind =
    roots.length > 1 ? "selection" : types[0] === "dir" ? "folder" : "file";

  const requestedLabel = typeof body?.label === "string" ? body.label.trim() : "";
  const label = requestedLabel
    ? requestedLabel.slice(0, 120)
    : kind === "selection"
      ? `${roots.length} items`
      : basename(roots[0]!.replace(/\\/g, "/"));

  const expiresIn = String(body?.expiresIn ?? "24h");
  const ttl = EXPIRY_MS[expiresIn];
  if (!ttl) {
    throw createError({ statusCode: 400, statusMessage: "expiresIn must be 1h, 24h or 7d" });
  }

  const secret = shareSecret();
  const withCode = body?.withCode !== false;
  let code: string | null = null;

  if (withCode) {
    const requestedCode = normalizeCode(body?.code);
    if (requestedCode) {
      if (!isValidCode(requestedCode)) {
        throw createError({ statusCode: 400, statusMessage: "code must be 6 valid characters" });
      }
      if (findShareByCode(requestedCode, secret)) {
        throw createError({ statusCode: 409, statusMessage: "code already in use" });
      }
      code = requestedCode;
    } else {
      // A collision on 32^6 values is vanishingly rare, but never ship duplicates.
      for (let attempt = 0; attempt < 5 && !code; attempt++) {
        const candidate = generateCode();
        if (!findShareByCode(candidate, secret)) code = candidate;
      }
      if (!code) {
        throw createError({ statusCode: 500, statusMessage: "could not allocate a code" });
      }
    }
  }

  const token = generateToken();
  const share = createShare({
    id: generateShareId(),
    token,
    codeHash: code ? hashCode(code, secret) : null,
    kind,
    label,
    roots,
    createdBy: user.username,
    expiresAt: new Date(Date.now() + ttl).toISOString(),
  });

  setResponseStatus(event, 201);
  return {
    id: share.id,
    token,
    code,
    kind: share.kind,
    label: share.label,
    roots: share.roots,
    expiresAt: share.expiresAt,
    path: `/s/${token}`,
  };
});
