import { createWriteStream, existsSync, mkdirSync, statSync, unlinkSync, writeFileSync } from "fs";
import { join } from "path";
import { pipeline } from "stream/promises";

const SKINS_DIR = join(process.cwd(), "data", "webamp", "skins");
const MUSEUM_GRAPHQL = "https://skins.webamp.org/graphql";

const MUSEUM_SKIN_QUERY = `query DebugSkin($md5: String!) {
  fetch_skin_by_md5(md5: $md5) {
    filename
    download_url
  }
}`;

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function verifyAndReturn(path: string, displayName: string) {
  const size = statSync(path).size;
  if (size < 10000) {
    unlinkSync(path);
    throw createError({
      statusCode: 400,
      statusMessage: "File too small, not a valid skin",
    });
  }
  return { ok: true, name: displayName.replace(/\.wsz$/i, "").replace(/\.zip$/i, "") };
}

/** Extract MD5 hash from a skins.webamp.org URL */
function extractMuseumMd5(url: string): string | null {
  // Matches: https://skins.webamp.org/skin/{md5} or https://skins.webamp.org/skin/{md5}/filename.wsz
  const match = url.match(/skins\.webamp\.org\/skin\/([a-f0-9]{32})(?:\/|$)/i);
  return match?.[1] || null;
}

async function resolveMuseumUrl(md5: string): Promise<{ downloadUrl: string; filename: string }> {
  const res = await fetch(MUSEUM_GRAPHQL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query: MUSEUM_SKIN_QUERY, variables: { md5 } }),
  });

  if (!res.ok) {
    throw createError({
      statusCode: 502,
      statusMessage: `Museum API error: HTTP ${res.status}`,
    });
  }

  const json = await res.json();
  const skin = json?.data?.fetch_skin_by_md5;
  if (!skin?.download_url) {
    throw createError({
      statusCode: 404,
      statusMessage: "Skin not found on Winamp Museum",
    });
  }

  return { downloadUrl: skin.download_url, filename: skin.filename };
}

async function downloadSkin(url: string, filePath: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw createError({
      statusCode: 400,
      statusMessage: `Failed to download skin: HTTP ${response.status}`,
    });
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("text/html")) {
    throw createError({
      statusCode: 400,
      statusMessage: "URL points to an HTML page, not a direct skin file",
    });
  }

  const contentLength = response.headers.get("content-length");
  if (contentLength && parseInt(contentLength) < 10000) {
    throw createError({
      statusCode: 400,
      statusMessage: "File too small (probably not a valid skin)",
    });
  }

  const fileStream = createWriteStream(filePath);
  await pipeline(response.body as any, fileStream);
}

export default defineEventHandler(async (event) => {
  requireUser(event);

  const body = await readBody<{ url?: string; name?: string; data?: string }>(event);

  if (!existsSync(SKINS_DIR)) {
    mkdirSync(SKINS_DIR, { recursive: true });
  }

  // Mode 1: raw base64 data (from museum blob)
  if (body?.name && body?.data) {
    let filename = body.name.trim();
    if (!filename.endsWith(".wsz")) filename += ".wsz";
    filename = sanitizeFilename(filename);
    const filePath = join(SKINS_DIR, filename);
    try {
      const binary = Buffer.from(body.data, "base64");
      writeFileSync(filePath, binary);
      return verifyAndReturn(filePath, filename);
    } catch (err: any) {
      try { if (existsSync(filePath)) unlinkSync(filePath); } catch {}
      throw createError({
        statusCode: 400,
        statusMessage: err.message || "Failed to write skin data",
      });
    }
  }

  // Mode 2: download from URL
  if (!body?.url) {
    throw createError({ statusCode: 400, statusMessage: "Provide {url} or {name, data}" });
  }

  const rawUrl = body.url.trim();

  // Check for Museum URL — extract md5 and resolve to real download URL
  const museumMd5 = extractMuseumMd5(rawUrl);
  if (museumMd5) {
    const { downloadUrl, filename: museumFilename } = await resolveMuseumUrl(museumMd5);
    let filename = museumFilename.replace(/\.zip$/i, ".wsz");
    filename = sanitizeFilename(filename);

    const filePath = join(SKINS_DIR, filename);

    try {
      await downloadSkin(downloadUrl, filePath);
      return verifyAndReturn(filePath, filename);
    } catch (err: any) {
      try { if (existsSync(filePath)) unlinkSync(filePath); } catch {}
      if (err.statusCode) throw err;
      throw createError({
        statusCode: 500,
        statusMessage: err.message || "Failed to download skin from Museum",
      });
    }
  }

  // Regular URL download
  const urlParts = rawUrl.replace(/\/+$/, "").split("/");
  let filename = urlParts[urlParts.length - 1] || "";
  filename = filename.split("?")[0].split("#")[0];
  if (!filename.endsWith(".wsz")) filename += ".wsz";
  filename = sanitizeFilename(filename);

  const filePath = join(SKINS_DIR, filename);

  try {
    await downloadSkin(rawUrl, filePath);
    return verifyAndReturn(filePath, filename);
  } catch (err: any) {
    try { if (existsSync(filePath)) unlinkSync(filePath); } catch {}
    if (err.statusCode) throw err;
    throw createError({
      statusCode: 500,
      statusMessage: err.message || "Failed to download skin",
    });
  }
});
