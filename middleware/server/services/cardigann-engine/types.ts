/**
 * Tipos del motor indexerr (Cardigann-lite).
 *
 * Modela el subconjunto del formato Cardigann YAML de Jackett que soporta
 * el motor: cabecera, caps, settings, search (paths/inputs/rows/fields),
 * download y login. Fuente: src/Jackett.Common/Definitions/*.yml
 */

export type TrackerType = "public" | "private" | "semi-private";

export interface CategoryMapping {
  id: string | number;
  cat: string;
  desc?: string;
  default?: boolean;
}

export interface DefinitionSetting {
  name: string;
  type:
    | "text"
    | "password"
    | "number"
    | "checkbox"
    | "select"
    | "info"
    | "info_flaresolverr"
    | string;
  label?: string;
  default?: string | number | boolean;
  options?: Record<string, string>;
  required?: boolean;
}

export interface Filter {
  name: string;
  args?: unknown[];
}

export interface SearchPath {
  path: string;
  method?: string;
  response?: { type: "html" | "json" };
  inputs?: Record<string, string>;
  followredirect?: boolean;
}

export interface RowsSpec {
  selector: string;
  attribute?: string;
  multiple?: boolean;
  count?: { selector: string; filters?: Filter[] };
  after?: Filter[];
  before?: Filter[];
  missingAttributeEqualsNoResults?: boolean;
  fields?: Record<string, string>;
}

export interface FieldSpec {
  selector?: string;
  attribute?: string;
  optional?: boolean;
  default?: string | number | boolean;
  text?: string | number | boolean;
  case?: Record<string, string | number>;
  filters?: Filter[];
}

export interface DownloadSelector {
  selector: string;
  attribute?: string;
  filters?: Filter[];
}

export interface LoginSpec {
  path?: string;
  method?: string;
  inputs?: Record<string, string>;
  error?: { selector: string; message?: string }[];
  test?: { path: string; selector: string };
}

export interface IndexerDefinition {
  id: string;
  name: string;
  description?: string;
  language?: string;
  type?: TrackerType;
  encoding?: string;
  requestDelay?: number;
  links: string[];
  legacylinks?: string[];
  caps?: {
    categorymappings?: CategoryMapping[];
    modes?: Record<string, string[]>;
  };
  settings?: DefinitionSetting[];
  search?: {
    paths: SearchPath[];
    inputs?: Record<string, string>;
    keywordsfilters?: Filter[];
    rows: RowsSpec;
    fields: Record<string, FieldSpec>;
  };
  download?: {
    selectors: DownloadSelector[];
  };
  login?: LoginSpec;
}

/** Configuración del usuario para una instancia de un indexer. */
export type IndexerConfig = Record<string, string | number | boolean>;

/** Metadatos de un indexer en el catálogo sincronizado. */
export interface IndexerCatalogEntry {
  id: string;
  name: string;
  description?: string | null;
  type?: string | null;
  language?: string | null;
  yml_path: string;
}

/** Entrada de búsqueda. */
export interface SearchQuery {
  keywords: string;
  season?: number;
  episode?: number;
  imdbId?: string;
  tvdbId?: string;
  tmdbId?: string;
  categories?: (string | number)[];
}
