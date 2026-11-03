/**
 * Shared HTTP file-streaming helpers.
 *
 * Extracted from `server/api/files/download.get.ts` so the authenticated file
 * manager and the public share endpoints stream files identically: same Range
 * handling, same attachment headers, same MIME detection.
 */

import { pipeline } from "node:stream/promises";
import type { Readable } from "node:stream";
import type { H3Event } from "h3";

/** Backpressure and stream teardown when the browser cancels/disconnects. */
export async function sendDownloadStream(
  event: H3Event,
  stream: Readable,
  cleanup?: () => void,
) {
  try {
    await pipeline(stream, event.node.res);
  } catch (error: any) {
    if (error.code !== "ERR_STREAM_PREMATURE_CLOSE") throw error;
  } finally {
    cleanup?.();
  }
}

/** MIME types for common audio formats (enables proper Content-Type for streaming). */
export function getMimeType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const mimes: Record<string, string> = {
    mp3: "audio/mpeg",
    wav: "audio/wav",
    ogg: "audio/ogg",
    flac: "audio/flac",
    aac: "audio/aac",
    wma: "audio/x-ms-wma",
    m4a: "audio/mp4",
  };
  return mimes[ext] || "application/octet-stream";
}

/** ASCII fallback plus RFC 5987 UTF-8 filename (RFC 6266). */
export function attachmentDisposition(filename: string): string {
  const fallback = filename.replace(/[^\x20-\x7e]|["\\]/g, "_");
  const encoded = encodeURIComponent(filename).replace(/[!'()*]/g, (c) =>
    `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

/**
 * Parse an HTTP Range header value.
 * Handles: bytes=START-, bytes=START-END, bytes=-SUFFIX
 */
export function parseRange(
  header: string,
  fileSize: number,
): { start: number; end: number } | null {
  const match = header.match(/bytes=(\d*)-(\d*)/);
  if (!match) return null;
  const rawStart = match[1];
  const rawEnd = match[2];

  let start: number;
  let end: number;

  if (rawStart === "" && rawEnd !== "") {
    // Suffix range: bytes=-500 → last 500 bytes
    const suffix = parseInt(rawEnd, 10);
    if (isNaN(suffix) || suffix <= 0) return null;
    start = Math.max(0, fileSize - suffix);
    end = fileSize - 1;
  } else {
    start = rawStart ? parseInt(rawStart, 10) : 0;
    end = rawEnd ? parseInt(rawEnd, 10) : fileSize - 1;
    if (isNaN(start) || start < 0) return null;
    if (isNaN(end) || end < 0 || end >= fileSize) end = fileSize - 1;
    if (start > end) return null;
  }

  return { start, end };
}
