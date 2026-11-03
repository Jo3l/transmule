/**
 * Virtual-path containment for public shares.
 *
 * A share stores one or more virtual roots (`home/pelis`, `series/...`). Every
 * public request carries a path supplied by the client, so containment is
 * enforced here — on the virtual form, before any filesystem access — and only
 * then handed to `resolveVirtualPath()`.
 *
 * Comparison is deliberately segment-based: `home/a` must not match `home/ab`.
 */

/** Normalise a virtual path, or return null when it is not usable at all. */
export function normalizeVirtualPath(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const raw = input.trim().replace(/\\/g, "/");
  if (!raw) return null;
  // Virtual paths are always relative to the manager root.
  if (raw.startsWith("/")) return null;

  const segments = raw.split("/").filter((segment) => segment !== "");
  if (!segments.length) return null;
  for (const segment of segments) {
    if (segment === "." || segment === "..") return null;
    if (segment.includes("\0")) return null;
  }
  return segments.join("/");
}

/** True when `candidate` is the root itself or lives underneath it. */
export function isInsideRoot(root: string, candidate: string): boolean {
  const normalizedRoot = normalizeVirtualPath(root);
  const normalizedCandidate = normalizeVirtualPath(candidate);
  if (!normalizedRoot || !normalizedCandidate) return false;
  if (normalizedCandidate === normalizedRoot) return true;
  return normalizedCandidate.startsWith(`${normalizedRoot}/`);
}

/** True when the candidate is inside any of the share's roots. */
export function isInsideAnyRoot(roots: string[], candidate: string): boolean {
  const normalized = normalizeVirtualPath(candidate);
  if (!normalized) return false;
  return roots.some((root) => isInsideRoot(root, normalized));
}

/** A root is shareable only when it is a concrete item, never the manager root. */
export function isSharableRoot(root: string): boolean {
  const normalized = normalizeVirtualPath(root);
  return Boolean(normalized && normalized.includes("/"));
}
