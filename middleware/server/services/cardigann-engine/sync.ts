/**
 * Sync de definiciones de indexers desde Jackett (Cardigann YAML).
 *
 * Descarga el repo de Jackett vía `git clone --sparse` (solo la carpeta de
 * definiciones YAML) y devuelve un catálogo de metadatos. Es agnóstico al
 * almacenamiento: el que llama (el plugin `indexerr`) decide dónde persistir
 * el catálogo devuelto. Las definiciones son GPL-2.0 y se descargan en
 * runtime — nunca se bundlean.
 */
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseDefinition } from "./yaml";
import type { IndexerDefinition, IndexerCatalogEntry } from "./types";

const REPO_URL = "https://github.com/Jackett/Jackett.git";
const DEFS_SUBPATH = "src/Jackett.Common/Definitions";

export function definitionsDir(): string {
  return resolve("data", "cardigann-definitions");
}

/**
 * Sincroniza (clona o actualiza) las definiciones YAML y devuelve el catálogo
 * de metadatos de indexers (sin tocar ninguna tabla).
 */
export async function syncDefinitions(
  dir: string = definitionsDir(),
): Promise<{ synced: number; freshClone: boolean; catalog: IndexerCatalogEntry[] }> {
  let freshClone = false;

  if (!existsSync(join(dir, ".git"))) {
    mkdirSync(dir, { recursive: true });
    try {
      execSync(
        `git clone --depth=1 --filter=blob:none --sparse ${REPO_URL} "${dir}"`,
        { stdio: "pipe", timeout: 120_000 },
      );
      execSync(`git -C "${dir}" sparse-checkout set ${DEFS_SUBPATH}`, {
        stdio: "pipe",
      });
      freshClone = true;
    } catch (err: any) {
      console.error("[cardigann] clone fallido:", err?.message);
      return { synced: 0, freshClone: false, catalog: [] };
    }
  } else {
    try {
      execSync(`git -C "${dir}" pull --depth=1 origin master`, {
        stdio: "pipe",
        timeout: 120_000,
      });
    } catch (err: any) {
      console.error("[cardigann] pull fallido (se usa la caché):", err?.message);
    }
  }

  const defsDir = join(dir, DEFS_SUBPATH);
  if (!existsSync(defsDir)) return { synced: 0, freshClone, catalog: [] };

  const files = readdirSync(defsDir).filter((f) => f.endsWith(".yml"));
  const catalog: IndexerCatalogEntry[] = [];
  for (const f of files) {
    try {
      const yml = readFileSync(join(defsDir, f), "utf8");
      const def = parseDefinition(yml);
      if (!def.id || !def.name) continue;
      catalog.push({
        id: String(def.id),
        name: def.name,
        description: def.description ?? null,
        type: def.type ?? null,
        language: def.language ?? null,
        yml_path: join(defsDir, f),
      });
    } catch {
      // YAML inválido o no soportado — saltar sin romper el sync
    }
  }
  return { synced: catalog.length, freshClone, catalog };
}

/** Carga la definición completa (parseada) de un indexer desde su YAML cacheado. */
export function loadDefinition(
  meta: IndexerCatalogEntry,
): IndexerDefinition | null {
  try {
    const yml = readFileSync(meta.yml_path, "utf8");
    return parseDefinition(yml);
  } catch {
    return null;
  }
}