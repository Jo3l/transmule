import { getConfig, setConfig } from "../../utils/database";
import {
  useAmuleClient,
  AmuleUnsupportedError,
} from "../../utils/amule-client";

defineRouteMeta({
  openAPI: {
    tags: ["aMule"],
    summary: "Get or set aMule sharing preferences",
    responses: {
      200: { description: "Sharing preferences" },
      502: { description: "aMule connection error" },
    },
  },
});

export default defineEventHandler(async (event) => {
  requireUser(event);

  if (event.method === "GET") {
    const client = useAmuleClient();
    const result: {
      includeSubdirs: boolean;
      supported: boolean;
      roots: { path: string; recursive: boolean }[];
      /** "unsupported" = daemon antiguo sin EC shared dirs; "connection" = fallo real. */
      error?: "unsupported" | "connection";
      errorMessage?: string;
    } = {
      // Fall back to the persisted flag when the daemon can't be queried.
      includeSubdirs: getConfig("amule_include_subdirs") !== "false",
      supported: false,
      roots: [],
    };

    try {
      const dirs = await client.getSharedDirs();
      result.supported = true;
      result.roots = dirs;
      // The checkbox reflects "are all roots recursive?" — a single root wins
      // when mixed, because the toggle operates on the whole set.
      result.includeSubdirs =
        dirs.length > 0 &&
        dirs.every((d) => d.recursive);
    } catch (err: any) {
      if (err instanceof AmuleUnsupportedError) {
        // Older aMule (2.3.3) answers EC_OP_FAILED → unsupported. Keep the
        // persisted fallback rather than surfacing an error to the UI.
        result.error = "unsupported";
        result.errorMessage = err?.message ?? "unsupported";
      } else {
        // Fallo REAL (conexión/auth/transitorio): NO camuflarlo como "no
        // soportado" — la UI lo muestra como error de conexión.
        result.error = "connection";
        result.errorMessage =
          err?.statusMessage ?? err?.message ?? String(err);
        console.error("[amule] sharing GET EC error:", result.errorMessage);
      }
    }

    return result;
  }

  if (event.method === "POST") {
    const body = await readBody(event);

    if (body.includeSubdirs === undefined) {
      return { success: true };
    }

    const client = useAmuleClient();
    let roots: { path: string; recursive: boolean }[];

    try {
      roots = await client.getSharedDirs();
    } catch (err: any) {
      if (err instanceof AmuleUnsupportedError) {
        // Daemon lacks EC_OP_GET_SHARED_DIRS: persist the flag and bail. The
        // value will take effect once the daemon supports it (or is configured
        // out-of-band). Make this explicit to the caller.
        setConfig(
          "amule_include_subdirs",
          body.includeSubdirs ? "true" : "false",
        );
        return { success: true, applied: false, reason: "unsupported" };
      }
      // Cualquier otro fallo (conexión/auth) es un error REAL → 502, no
      // "unsupported": antes se tragaba en silencio y la UI revertía el
      // checkbox sin explicación.
      throw createError({
        statusCode: 502,
        statusMessage: `aMule unavailable: ${err?.statusMessage ?? err?.message ?? "connection refused"}`,
      });
    }

    // Apply the new recursiveness to every currently-shared root.
    roots = roots.map((d) => ({ ...d, recursive: !!body.includeSubdirs }));

    let rejected: { path: string; reason: number }[];
    try {
      rejected = await client.setSharedDirs(roots);
    } catch (err: any) {
      if (err instanceof AmuleUnsupportedError) {
        setConfig(
          "amule_include_subdirs",
          body.includeSubdirs ? "true" : "false",
        );
        return { success: true, applied: false, reason: "unsupported" };
      }
      throw createError({
        statusCode: 502,
        statusMessage: `aMule unavailable: ${err?.statusMessage ?? err?.message ?? "connection refused"}`,
      });
    }

    setConfig("amule_include_subdirs", body.includeSubdirs ? "true" : "false");

    return {
      success: true,
      applied: true,
      rejected,
    };
  }
});
