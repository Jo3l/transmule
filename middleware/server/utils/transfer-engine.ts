/**
 * Motor de copia/movimiento entre rutas virtuales (local y SMB).
 *
 * Extraído de `api/files/transfer.post.ts` para que el file manager y el
 * planificador (mover descargas completadas a la carpeta de destino) compartan
 * el MISMO motor: rename local instantáneo, streaming SMB vía smbclient,
 * recursión en directorios, y mensajes de error SMB amigables.
 */

import { rename, rm, stat, readdir, mkdir } from "node:fs/promises";
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { pipeline } from "node:stream/promises";
import { join, dirname } from "node:path";
import { Readable } from "node:stream";
import {
  resolveVirtualPath, smbDownloadStream, smbUploadStream,
  smbRmRecursive, smbStat, smbMkdir, smbRename, smbListDir,
} from "~/utils/remoteMounts";

/* ── SMB error helper ──────────────────────────────────────────────────────── */

/** Characters that are invalid in Windows/SMB filenames */
const SMB_INVALID_CHARS = /[\\/:*?"<>|]/;

/**
 * Check if an error message indicates an SMB invalid-character issue.
 * Returns a user-friendly message if so, otherwise returns null.
 */
export function smbFriendlyError(err: any, filename: string): string | null {
  const msg = String(err?.message ?? err ?? "");
  if (
    msg.includes("NT_STATUS_FILE_SYSTEM_LIMITATION") ||
    msg.includes("NT_STATUS_INVALID_NETWORK_RESPONSE") ||
    msg.includes("NT_STATUS_OBJECT_NAME_INVALID") ||
    msg.includes("NT_STATUS_OBJECT_PATH_NOT_FOUND")
  ) {
    // Check if the filename has invalid characters
    const base = filename.replace(/^.*[\\/]/, "");
    if (SMB_INVALID_CHARS.test(base)) {
      return `El archivo "${base}" contiene caracteres no válidos para SMB/Windows (\\ / : * ? " < > |). Renómbralo e inténtalo de nuevo.`;
    }
    return `Error de SMB al escribir "${base}": ${msg.split("\n")[0].trim()}`;
  }
  return null;
}

/* ── Copy/move logic (rutas VIRTUALES) ─────────────────────────────────────── */

/** Acumulador opcional de bytes copiados (para progreso). */
export interface CopyProgress {
  bytesDone: number;
}

export interface CopyOptions {
  signal?: AbortSignal;
  /** Callback opcional de progreso (bytes totales copiados hasta ahora). */
  onBytes?: (bytes: number) => void;
}

async function copyAnyPath(
  srcRel: string,
  destRel: string,
  opts?: CopyOptions,
): Promise<void> {
  const signal = opts?.signal;
  if (signal?.aborted) throw Object.assign(new Error("Cancelled"), { name: "AbortError" });

  const src = resolveVirtualPath(srcRel);
  const dest = resolveVirtualPath(destRel);
  if (!src || !dest) throw new Error("Invalid path");

  let srcIsDir = false;
  if (src.type === "local") {
    try { srcIsDir = (await stat(src.absPath)).isDirectory(); }
    catch { throw new Error("Source not found: " + srcRel); }
  } else {
    const st = await smbStat(src.config, src.subPath);
    if (!st) throw new Error("Source not found: " + srcRel);
    srcIsDir = st.type === "directory";
  }

  if (srcIsDir) {
    if (dest.type === "local") await mkdir(dest.absPath, { recursive: true });
    else {
      try {
        await smbMkdir(dest.config, dest.subPath);
      } catch (err: any) {
        const friendly = smbFriendlyError(err, dest.subPath);
        if (friendly) throw new Error(friendly);
        // Directory might already exist, don't fail for that
      }
    }

    let children: { name: string; type: "file" | "directory" }[];
    if (src.type === "local") {
      const ents = await readdir(src.absPath, { withFileTypes: true }).catch(() => []);
      children = ents.map((e) => ({ name: e.name, type: e.isDirectory() ? "directory" : "file" }));
    } else {
      const ents = await smbListDir(src.config, src.subPath).catch(() => []);
      children = ents.map((e: any) => ({ name: e.name, type: e.type as "file" | "directory" }));
    }

    for (const child of children) {
      if (signal?.aborted) throw Object.assign(new Error("Cancelled"), { name: "AbortError" });
      await copyAnyPath(join(srcRel, child.name), join(destRel, child.name), opts);
    }
  } else {
    if (dest.type === "local") {
      const parent = dirname(dest.absPath);
      if (!existsSync(parent)) await mkdir(parent, { recursive: true });
    }

    let readable: Readable;
    if (src.type === "local") {
      readable = createReadStream(src.absPath);
    } else {
      const { stream } = smbDownloadStream(src.config, src.subPath);
      readable = stream;
    }

    readable.on("data", (chunk: Buffer) => {
      if (opts?.onBytes) opts.onBytes(chunk.length);
    });

    if (dest.type === "local") {
      const writable = createWriteStream(dest.absPath);
      await pipeline(readable as any, writable as any, { signal } as any);
    } else {
      try {
        await smbUploadStream(dest.config, dest.subPath, readable);
      } catch (err: any) {
        const friendly = smbFriendlyError(err, dest.subPath);
        if (friendly) throw new Error(friendly);
        throw err;
      }
    }
  }
}

/** Elimina una ruta virtual (local o SMB), tolerante. */
export async function rmPath(rel: string): Promise<void> {
  const r = resolveVirtualPath(rel);
  if (!r) return;
  if (r.type === "local") await rm(r.absPath, { recursive: true, force: true }).catch(() => {});
  else { try { await smbRmRecursive(r.config, r.subPath); } catch { /* ignore */ } }
}

/** ¿Existe una ruta virtual (local o SMB)? */
async function pathExists(rel: string): Promise<boolean> {
  const r = resolveVirtualPath(rel);
  if (!r) return false;
  if (r.type === "local") return existsSync(r.absPath);
  try {
    return !!(await smbStat(r.config, r.subPath));
  } catch {
    return false;
  }
}

/**
 * Elimina el origen y VERIFICA que desapareció. Si el borrado falla (p.ej. el
 * cliente de descarga aún lo tiene bloqueado), lanza un error para que el job
 * de la cola quede en "error" y el llamador (el planificador) reintente — en
 * lugar de reportar un movimiento exitoso con el archivo aún en origen.
 */
async function removeSource(srcRel: string): Promise<void> {
  await rmPath(srcRel);
  if (await pathExists(srcRel)) {
    throw new Error(`No se pudo eliminar el origen tras el movimiento: ${srcRel}`);
  }
}

/** Copia una ruta virtual a otra (directorios recursivos incluidos). */
export async function copyPath(
  srcRel: string,
  destRel: string,
  opts?: CopyOptions,
): Promise<void> {
  await copyAnyPath(srcRel, destRel, opts);
}

/**
 * Mueve una ruta virtual a otra. Rename instantáneo cuando es posible
 * (local→local mismo FS, smb→smb mismo share); si no, copia + borra.
 */
export async function movePath(
  srcRel: string,
  destRel: string,
  opts?: CopyOptions,
): Promise<void> {
  const s = resolveVirtualPath(srcRel);
  const d = resolveVirtualPath(destRel);
  if (s && d && s.type === "smb" && d.type === "smb" && s.config.id === d.config.id) {
    try { await smbRename(s.config, s.subPath, d.subPath); }
    catch { await copyPath(srcRel, destRel, opts); await removeSource(srcRel); }
  } else if (s && d && s.type === "local" && d.type === "local") {
    // Asegurar que el directorio padre existe antes del rename
    const parent = dirname(d.absPath);
    if (!existsSync(parent)) await mkdir(parent, { recursive: true });
    try {
      if (s.absPath !== d.absPath) await rename(s.absPath, d.absPath);
    } catch (err: any) {
      if ((err as any)?.code === "EXDEV") {
        // Volumen distinto → copia + borra
        await copyPath(srcRel, destRel, opts);
        await removeSource(srcRel);
      } else {
        // Puede ser EPERM/EBUSY (fichero en uso) → copia + borra como fallback
        await copyPath(srcRel, destRel, opts);
        await removeSource(srcRel);
      }
    }
  } else {
    await copyPath(srcRel, destRel, opts);
    await removeSource(srcRel);
  }
}