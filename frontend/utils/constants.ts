export const APP_VERSION = "1.178";

/** Variantes de color de STag. Compartido para que un valor inventado (p.ej.
 *  "accent", que nunca existió) falle en el typecheck en vez de renderizar sin
 *  estilo en silencio. */
export type STagVariant = "default" | "primary" | "success" | "warning" | "danger" | "info";
export const GITHUB_REPO = "Jo3l/transmule";
