/**
 * Parser de definiciones Cardigann YAML → IndexerDefinition.
 * Usa el paquete `yaml` (YAML 1.2) para el parse robusto.
 */
import { parse as parseYaml } from "yaml";
import type { IndexerDefinition } from "./types";

/** Parsea un fichero YAML Cardigann y normaliza campos clave. */
export function parseDefinition(yamlText: string): IndexerDefinition {
  const raw = parseYaml(yamlText) as Record<string, unknown>;

  const def = raw as unknown as IndexerDefinition;

  // Normalizaciones defensivas (los YAML a veces tienen campos sueltos)
  if (!Array.isArray(def.links)) def.links = [];
  if (def.settings && !Array.isArray(def.settings)) def.settings = [];
  if (def.search && !Array.isArray(def.search.paths)) def.search.paths = [];

  return def;
}
