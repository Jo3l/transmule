/**
 * GET /api/planner/calendar?month=2026-08&discover=1
 *
 * Calendario mensual del planificador.
 *
 * Devuelve eventos del mes:
 *   - Episodios de series suscritas (planner_episodes.air_date dentro del mes)
 *   - Películas suscritas (planner_movies.digital_release_date dentro del mes)
 *   - (opcional, discover=1) Estrenos descubiertos de TMDB en el rango:
 *       movies (primary_release_date) y series (air_date) del mes.
 *
 * Cada evento lleva isSubscribed para highlight en la UI.
 * Compatible hacia atrás con ?days=30 (lista plana de próximos N días).
 */
import { getEpisodesByAirDateRange } from "~/utils/planner-db";
import { useDatabase } from "~/utils/database";
import {
  discoverTmdbMoviesInRange,
  discoverTmdbTvInRange,
  getTmdbKey,
} from "~/services/planner/tmdb";
import { getTvmazeEpisodesInRange } from "~/services/planner/tvmaze";

defineRouteMeta({
  openAPI: {
    tags: ["Planner"],
    summary: "Planner calendar",
    description: "Returns monthly calendar events (subscriptions + optional TMDB discovery).",
    responses: {
      200: { description: "Calendar events" },
      401: { description: "Auth required" },
    },
  },
});

interface CalendarEvent {
  date: string; // YYYY-MM-DD
  kind: "episode" | "movie" | "discover-movie" | "discover-tv";
  title: string;
  subtitle: string | null;
  subscription_id: number | null;
  subscription_type: "series" | "movie" | null;
  is_subscribed: boolean;
  status: string | null;
  poster_url: string | null;
  /** TMDB id del evento descubierto (para suscribirse desde el calendario) */
  external_id?: number;
  /** media_type del descubrimiento: "movie" | "tv" */
  media_type?: string;
  vote_average?: number | null;
  /** Fuente del descubrimiento: "tvmaze" | "tmdb" */
  source?: string;
}

export default defineEventHandler(async (event) => {
  requireUser(event);
  const q = getQuery(event) as {
    month?: string;
    days?: string;
    discover?: string;
    /** Categorías de TVmaze a mostrar (separadas por coma); "all" = sin filtro. */
    types?: string;
  };

  // ── Modo legacy: ?days=N (lista plana de próximos N días) ────────────────
  if (!q.month && q.days) {
    const days = Math.min(Math.max(Number(q.days) || 30, 1), 365);
    const today = new Date().toISOString().slice(0, 10);
    const max = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
    const episodes = getEpisodesByAirDateRange(today, max);
    return {
      mode: "days",
      episodes,
      from: today,
      to: max,
    };
  }

  // ── Modo mensual ─────────────────────────────────────────────────────────
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth() + 1; // 1-12

  if (q.month) {
    const m = q.month.match(/^(\d{4})-(\d{2})$/);
    if (m) {
      year = Number(m[1]);
      month = Number(m[2]);
    }
  }

  const monthStr = `${year}-${String(month).padStart(2, "0")}`;
  const from = `${monthStr}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const to = `${monthStr}-${String(lastDay).padStart(2, "0")}`;

  const events: CalendarEvent[] = [];

  // 1. Episodios suscritos del mes
  const episodes = getEpisodesByAirDateRange(from, to);
  for (const ep of episodes) {
    events.push({
      date: ep.air_date!,
      kind: "episode",
      title: ep.subscription_title,
      subtitle: `S${String(ep.season_number).padStart(2, "0")}E${String(ep.episode_number).padStart(2, "0")}${ep.title ? ` — ${ep.title}` : ""}`,
      subscription_id: ep.subscription_id,
      subscription_type: "series",
      is_subscribed: true,
      status: ep.status,
      poster_url: ep.subscription_poster,
    });
  }

  // 2. Películas suscritas con fecha digital en el mes
  const db = useDatabase();
  const movieRows = db
    .prepare(
      `SELECT m.digital_release_date AS d, m.status AS st, m.id AS mid,
              s.id AS sub_id, s.title, s.poster_url
       FROM planner_movies m
       JOIN planner_subscriptions s ON s.id = m.subscription_id
       WHERE m.digital_release_date IS NOT NULL
         AND m.digital_release_date >= ?
         AND m.digital_release_date <= ?
         AND s.monitored = 1`,
    )
    .all(from, to) as unknown as Array<{
    d: string;
    st: string;
    mid: number;
    sub_id: number;
    title: string;
    poster_url: string | null;
  }>;

  for (const m of movieRows) {
    events.push({
      date: m.d,
      kind: "movie",
      title: m.title,
      subtitle: "Estreno digital",
      subscription_id: m.sub_id,
      subscription_type: "movie",
      is_subscribed: true,
      status: m.st,
      poster_url: m.poster_url,
    });
  }

  // 3. Descubrimiento (TVmaze series + TMDB movies/tv)
  const wantDiscover = q.discover !== "0";
  const tmdbEnabled = !!getTmdbKey();

  if (wantDiscover) {
    // Títulos suscritos normalizados para marcar coincidencias
    const subscribedTitles = new Set(
      [...events.map((e) => e.title)].map((t) => normalize(t)),
    );

    // 3a. Series: TVmaze schedule (episodio por episodio — como Sonarr/TVDB)
    //     Funciona sin API key. Itera días del mes con caché.
    // Filtro de categorías de TVmaze: por defecto solo series de ficción
    // (Scripted + Animation). "all" o lista explícita de tipos en `types`.
    const tvTypes = q.types ? parseTvTypes(q.types) : SCRIPTED_TYPES;

    const tvmazeEpisodes = await getTvmazeEpisodesInRange(from, to).catch(() => []);
    for (const ep of tvmazeEpisodes) {
      if (subscribedTitles.has(normalize(ep.show.name))) continue; // ya suscrita
      if (!ep.airdate) continue;
      if (tvTypes && ep.show.type && !tvTypes.has(ep.show.type)) continue; // categoría no deseada
      const subtitleParts: string[] = [];
      if (ep.season != null && ep.number != null) {
        subtitleParts.push(`S${String(ep.season).padStart(2, "0")}E${String(ep.number).padStart(2, "0")}`);
      }
      if (ep.name) subtitleParts.push(ep.name);
      events.push({
        date: ep.airdate,
        kind: "discover-tv",
        title: ep.show.name,
        subtitle: subtitleParts.join(" — ") || "Nuevo episodio",
        subscription_id: null,
        subscription_type: null,
        is_subscribed: false,
        status: null,
        poster_url: ep.show.image?.medium ?? ep.show.image?.original ?? null,
        // TVmaze externals.thetvdb → suscripción con tvdb_id real
        external_id: ep.show.externals.thetvdb ?? ep.show.id,
        media_type: "tv",
        vote_average: null,
        source: "tvmaze",
      });
    }

    if (tmdbEnabled) {
      // 3b. Películas: TMDB discover (estrenos en cines del mes)
      const movies = await discoverTmdbMoviesInRange(from, to).catch(() => []);
      for (const m of movies) {
        if (subscribedTitles.has(normalize(m.title))) continue;
        if (!m.date) continue;
        events.push({
          date: m.date,
          kind: "discover-movie",
          title: m.title,
          subtitle: "Estreno en cines",
          subscription_id: null,
          subscription_type: null,
          is_subscribed: false,
          status: null,
          poster_url: m.poster_url,
          external_id: m.id, // TMDB id → para suscribirse desde el calendario
          media_type: "movie",
          vote_average: m.vote_average,
          source: "tmdb",
        });
      }

      // 3c. Series extra: TMDB discover/tv (próximo episodio por serie)
      const tv = await discoverTmdbTvInRange(from, to).catch(() => []);
      for (const t of tv) {
        if (subscribedTitles.has(normalize(t.title))) continue;
        if (!t.date) continue;
        events.push({
          date: t.date,
          kind: "discover-tv",
          title: t.title,
          subtitle: "Nuevo episodio",
          subscription_id: null,
          subscription_type: null,
          is_subscribed: false,
          status: null,
          poster_url: t.poster_url,
          external_id: t.id, // TMDB id → para suscribirse desde el calendario
          media_type: "tv",
          vote_average: t.vote_average,
          source: "tmdb",
        });
      }
    }
  }

  // Ordenar por fecha
  events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  return {
    mode: "month",
    month: monthStr,
    from,
    to,
    tmdb: tmdbEnabled,
    events,
  };
});

/** Categorías de TVmaze que cuentan como "series de ficción" (guionizadas). */
const SCRIPTED_TYPES = new Set(["Scripted", "Animation"]);

/** Parsea el parámetro `types` (lista separada por comas). null = sin filtro (todo). */
function parseTvTypes(typesParam?: string): Set<string> | null {
  const v = (typesParam ?? "").trim();
  if (!v || v === "all") return null;
  return new Set(v.split(",").map((x) => x.trim()).filter(Boolean));
}

function normalize(t: string): string {
  return t
    .toLowerCase()
    .replace(/[^a-z0-9\u00e0-\u00ff\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
