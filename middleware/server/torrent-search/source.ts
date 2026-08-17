/**
 * Source-id parsing for torrent search.
 *
 * A source id may be a plain plugin id (`"indexerr"`) or a sub-source id
 * (`"indexerr:1337x"`). This helper splits the two so the dispatcher can
 * route to the right plugin and pass the sub-source down to `search()`.
 */
export interface ParsedSource {
  pluginId: string;
  subSource?: string;
}

export function splitSource(source: string): ParsedSource {
  const idx = source.indexOf(":");
  if (idx > 0) {
    return {
      pluginId: source.slice(0, idx),
      subSource: source.slice(idx + 1),
    };
  }
  return { pluginId: source };
}
