/**
 * Shared utilities for safely fetching external plugin/repo URLs.
 * Guards against SSRF by blocking private / loopback / link-local addresses.
 */

const SIZE_LIMIT = 2 * 1024 * 1024; // 2 MB

/** Throw a 400 error if the URL is not a safe external HTTPS URL. */
export function assertSafeUrl(urlStr: string): URL {
  let url: URL;
  try {
    url = new URL(urlStr);
  } catch {
    throw createError({ statusCode: 400, statusMessage: "Invalid URL" });
  }

  if (url.protocol !== "https:") {
    throw createError({
      statusCode: 400,
      statusMessage: "Only HTTPS URLs are accepted",
    });
  }

  const h = url.hostname.toLowerCase();
  const blocked = ["localhost", "127.0.0.1", "::1", "0.0.0.0", "169.254.169.254"];
  if (blocked.includes(h)) {
    throw createError({ statusCode: 400, statusMessage: "URL not allowed" });
  }
  // Block private RFC-1918 ranges
  if (
    /^10\./.test(h) ||
    /^192\.168\./.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h)
  ) {
    throw createError({ statusCode: 400, statusMessage: "URL not allowed" });
  }

  return url;
}

/** Fetch text from an external URL with a size cap. */
export async function fetchTextSafe(urlStr: string): Promise<string> {
  assertSafeUrl(urlStr);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  let res: Response;
  try {
    res = await fetch(urlStr, { signal: ctrl.signal });
  } catch (err: any) {
    throw createError({
      statusCode: 502,
      statusMessage: `Failed to fetch URL: ${err.message}`,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    throw createError({
      statusCode: 502,
      statusMessage: `Remote returned ${res.status}`,
    });
  }

  const reader = res.body?.getReader();
  if (!reader) {
    throw createError({ statusCode: 502, statusMessage: "No response body" });
  }

  let total = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > SIZE_LIMIT) {
      reader.cancel().catch(() => {});
      throw createError({
        statusCode: 413,
        statusMessage: "Remote file exceeds size limit (2 MB)",
      });
    }
    chunks.push(value);
  }

  const buf = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    buf.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(buf);
}
