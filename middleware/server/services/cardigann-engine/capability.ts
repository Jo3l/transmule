/**
 * Capacidad `cardigann` — motor genérico de indexers estilo Jackett/Cardigann.
 *
 * Se inyecta en los plugins que declaran `capability: "cardigann"` vía
 * `ctx.cardigann`. Es una capacidad del CORE (no depende de ningún plugin
 * concreto): cualquier plugin puede usarla para buscar en trackers definidos
 * por YAML Cardigann. El plugin conserva el catálogo y las instancias en su
 * propio `ctx.storage` y se los pasa aquí; el motor no toca la base de datos.
 */
import type { TorrentSearchResult } from "../../providers/types";
import type {
  IndexerDefinition,
  IndexerConfig,
  IndexerCatalogEntry,
  SearchQuery,
} from "./types";
import { parseDefinition } from "./yaml";
import { runSearch } from "./runner";
import { syncDefinitions, loadDefinition } from "./sync";

/** Una instancia de indexer configurada por el usuario (propiedad del plugin). */
export interface CardigannInstance {
  tracker_id: string;
  config?: IndexerConfig;
  enabled?: boolean;
}

export interface CardigannCapability {
  /** Parsea una definición Cardigann YAML → IndexerDefinition. */
  parseDefinition(yml: string): IndexerDefinition;
  /** Carga (y parsea) la definición completa desde los metadatos del catálogo. */
  loadDefinition(meta: IndexerCatalogEntry): IndexerDefinition | null;
  /** Ejecuta una búsqueda contra un único indexer. */
  runSearch(
    def: IndexerDefinition,
    config: IndexerConfig,
    query: SearchQuery,
    limit?: number,
  ): Promise<TorrentSearchResult[]>;
  /** Sincroniza definiciones desde Jackett y devuelve el catálogo. */
  syncDefinitions(dir?: string): Promise<{
    synced: number;
    freshClone: boolean;
    catalog: IndexerCatalogEntry[];
  }>;
  /** Busca en todas las instancias habilitadas y combina resultados. */
  search(
    query: string,
    limit: number,
    extraTrackers: string,
    instances: CardigannInstance[],
    catalog: IndexerCatalogEntry[],
  ): Promise<TorrentSearchResult[]>;
}

async function search(
  query: string,
  limit: number,
  extraTrackers: string,
  instances: CardigannInstance[],
  catalog: IndexerCatalogEntry[],
): Promise<TorrentSearchResult[]> {
  const enabled = instances.filter(
    (i) => i.enabled !== false && !!i.tracker_id,
  );

  const tasks = enabled.map(async (inst) => {
    try {
      const meta = catalog.find((c) => c.id === inst.tracker_id);
      if (!meta) return [];
      const def = loadDefinition(meta);
      if (!def) return [];
      const results = await runSearch(
        def,
        inst.config ?? {},
        { keywords: query },
        limit,
      );
      if (extraTrackers) {
        return results.map((r) =>
          r.magnet && !r.magnet.includes(extraTrackers)
            ? { ...r, magnet: r.magnet + extraTrackers }
            : r,
        );
      }
      return results;
    } catch {
      return [];
    }
  });

  const settled = await Promise.allSettled(tasks);
  return settled
    .filter(
      (s): s is PromiseFulfilledResult<TorrentSearchResult[]> =>
        s.status === "fulfilled",
    )
    .flatMap((s) => s.value);
}

export function createCardigannCapability(): CardigannCapability {
  return {
    parseDefinition,
    loadDefinition,
    runSearch: (def, config, query, limit) =>
      runSearch(def, config, query, limit),
    syncDefinitions,
    search,
  };
}
