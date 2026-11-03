/**
 * Filesystem helpers for share endpoints.
 *
 * Local and SMB are handled behind the same interface, so the public share
 * routes never branch on the mount type. Everything takes and returns **virtual**
 * paths; callers must validate containment first (`share-paths.ts`).
 */

import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { resolveVirtualPath, smbListDir } from "./remoteMounts";

export type EntryType = "file" | "dir";

export interface DirEntry {
  name: string;
  type: EntryType;
  size: number;
}

export interface ShareRoot {
  path: string;
  name: string;
  type: EntryType;
}

function baseName(virtualPath: string): string {
  const parts = virtualPath.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? virtualPath;
}

/** Resolve a virtual path to `file` or `dir`, or null when it does not exist. */
export async function statVirtual(virtualPath: string): Promise<EntryType | null> {
  const resolved = resolveVirtualPath(virtualPath);
  if (!resolved) return null;

  if (resolved.type === "local") {
    if (!existsSync(resolved.absPath)) return null;
    try {
      return statSync(resolved.absPath).isDirectory() ? "dir" : "file";
    } catch {
      return null;
    }
  }

  // SMB: list the parent and look the entry up by name.
  const name = baseName(virtualPath).toLowerCase();
  const parent = virtualPath.split("/").slice(0, -1).join("/");
  const parentResolved = resolveVirtualPath(parent);
  if (!parentResolved || parentResolved.type !== "smb") return null;
  try {
    const entries = await smbListDir(parentResolved.config, parentResolved.subPath);
    const match = entries.find((entry: any) => String(entry.name).toLowerCase() === name);
    if (!match) return null;
    return match.type === "directory" ? "dir" : "file";
  } catch {
    return null;
  }
}

/** List one level of a virtual directory (never recursive). */
export async function listVirtualDir(
  virtualPath: string,
): Promise<{ path: string; entries: DirEntry[] }> {
  const resolved = resolveVirtualPath(virtualPath);
  if (!resolved) {
    throw createError({ statusCode: 400, statusMessage: "Invalid path" });
  }

  if (resolved.type === "smb") {
    try {
      const entries = await smbListDir(resolved.config, resolved.subPath);
      return {
        path: virtualPath,
        entries: sortEntries(
          entries.map((entry: any) => ({
            name: String(entry.name),
            type: (entry.type === "directory" ? "dir" : "file") as EntryType,
            size: Number(entry.size) || 0,
          })),
        ),
      };
    } catch (err: any) {
      throw createError({ statusCode: 502, statusMessage: `SMB: ${err?.message ?? "error"}` });
    }
  }

  try {
    const names = readdirSync(resolved.absPath);
    const entries: DirEntry[] = names.map((name) => {
      const full = join(resolved.absPath, name);
      try {
        const st = statSync(full);
        return {
          name,
          type: st.isDirectory() ? ("dir" as const) : ("file" as const),
          size: st.isDirectory() ? 0 : st.size,
        };
      } catch {
        return { name, type: "file" as const, size: 0 };
      }
    });
    return { path: virtualPath, entries: sortEntries(entries) };
  } catch (err: any) {
    const code = err?.code ?? "";
    if (code === "ENOENT" || code === "ENOTDIR") {
      throw createError({ statusCode: 404, statusMessage: "Folder not found" });
    }
    if (code === "EACCES" || code === "EPERM") {
      throw createError({ statusCode: 403, statusMessage: "Permission denied" });
    }
    throw createError({ statusCode: 500, statusMessage: err?.message ?? "List failed" });
  }
}

/** Describe each share root so the public page knows whether to offer a listing. */
export async function describeRoots(roots: string[]): Promise<ShareRoot[]> {
  const described = await Promise.all(
    roots.map(async (root) => ({
      path: root,
      name: baseName(root),
      type: (await statVirtual(root)) ?? "file",
    })),
  );
  return described;
}

/** Directories first, then files, both alphabetically. */
function sortEntries(entries: DirEntry[]): DirEntry[] {
  return entries.sort((a, b) => {
    if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}
