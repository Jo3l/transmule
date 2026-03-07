import { registerProvider } from "./loader";
import type {
  MediaProvider,
  MediaItem,
  MediaLink,
  ProviderListResult,
  ProviderSearchParams,
  ProviderFilter,
} from "./types";

const YTS_BASE = "https://movies-api.accel.li/api/v2/list_movies.json";

const MAGNET_TRACKERS = [
  "udp://open.demonii.com:1337/announce",
  "udp://tracker.openbittorrent.com:80",
  "udp://tracker.coppersurfer.tk:6969",
  "udp://glotorrents.pw:6969/announce",
  "udp://tracker.opentrackr.org:1337/announce",
  "udp://torrent.gresille.org:80/announce",
  "udp://p4p.arenabg.com:1337",
  "udp://tracker.leechers-paradise.org:6969",
];

function buildMagnet(hash: string, title: string): string {
  const dn = encodeURIComponent(title);
  const tr = MAGNET_TRACKERS.map((t) => `&tr=${encodeURIComponent(t)}`).join(
    "",
  );
  return `magnet:?xt=urn:btih:${hash}&dn=${dn}${tr}`;
}

function formatRuntime(minutes: number): string {
  if (!minutes) return "";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

interface YtsTorrent {
  url: string;
  hash: string;
  quality: string;
  type: string;
  seeds: number;
  peers: number;
  size: string;
}

interface YtsMovie {
  id: number;
  url: string;
  title: string;
  title_long: string;
  year: number;
  rating: number;
  runtime: number;
  genres: string[];
  summary: string;
  language: string;
  medium_cover_image: string;
  large_cover_image: string;
  torrents: YtsTorrent[];
}

const filters: ProviderFilter[] = [
  {
    key: "query_term",
    label: "Search",
    type: "text",
    defaultValue: "",
  },
  {
    key: "genre",
    label: "Genre",
    type: "select",
    defaultValue: "all",
    options: [
      { label: "All", value: "all" },
      { label: "Action", value: "Action" },
      { label: "Adventure", value: "Adventure" },
      { label: "Animation", value: "Animation" },
      { label: "Biography", value: "Biography" },
      { label: "Comedy", value: "Comedy" },
      { label: "Crime", value: "Crime" },
      { label: "Documentary", value: "Documentary" },
      { label: "Drama", value: "Drama" },
      { label: "Family", value: "Family" },
      { label: "Fantasy", value: "Fantasy" },
      { label: "Film-Noir", value: "Film-Noir" },
      { label: "History", value: "History" },
      { label: "Horror", value: "Horror" },
      { label: "Music", value: "Music" },
      { label: "Musical", value: "Musical" },
      { label: "Mystery", value: "Mystery" },
      { label: "Romance", value: "Romance" },
      { label: "Sci-Fi", value: "Sci-Fi" },
      { label: "Sport", value: "Sport" },
      { label: "Thriller", value: "Thriller" },
      { label: "War", value: "War" },
      { label: "Western", value: "Western" },
    ],
  },
  {
    key: "quality",
    label: "Quality",
    type: "select",
    defaultValue: "all",
    options: [
      { label: "All", value: "all" },
      { label: "480p", value: "480p" },
      { label: "720p", value: "720p" },
      { label: "1080p", value: "1080p" },
      { label: "1080p x265", value: "1080p.x265" },
      { label: "2160p / 4K", value: "2160p" },
      { label: "3D", value: "3D" },
    ],
  },
  {
    key: "sort_by",
    label: "Sort by",
    type: "select",
    defaultValue: "date_added",
    options: [
      { label: "Latest", value: "date_added" },
      { label: "Year", value: "year" },
      { label: "Rating", value: "rating" },
      { label: "Seeds", value: "seeds" },
      { label: "Downloads", value: "download_count" },
      { label: "Most liked", value: "like_count" },
      { label: "Title", value: "title" },
    ],
  },
  {
    key: "minimum_rating",
    label: "Min. rating",
    type: "select",
    defaultValue: "0",
    options: [
      { label: "All", value: "0" },
      { label: "5+", value: "5" },
      { label: "6+", value: "6" },
      { label: "7+", value: "7" },
      { label: "8+", value: "8" },
      { label: "9+", value: "9" },
    ],
  },
];

function toMediaItem(m: YtsMovie): MediaItem {
  const links: MediaLink[] = (m.torrents ?? []).map((t) => ({
    label: `${t.quality} ${t.type}`,
    url: t.url?.startsWith("magnet:") ? t.url : buildMagnet(t.hash, m.title),
    quality: t.quality,
    type: t.type,
    size: t.size,
    seeds: t.seeds,
    hash: t.hash,
  }));

  return {
    id: String(m.id),
    title: m.title,
    cover: m.medium_cover_image,
    year: m.year ? String(m.year) : undefined,
    rating: m.rating,
    runtime: m.runtime,
    genre: m.genres?.join(", "),
    genres: m.genres,
    description: m.summary,
    language: m.language,
    links,
    isSeries: false,
    sourceUrl: m.url,
  };
}

const provider: MediaProvider = {
  meta: {
    id: "yts",
    name: "YTS",
    icon: "mdi-filmstrip",
    mediaType: "movies",
    description: "YTS.mx movie torrents",
  },
  filters,

  async list(params: ProviderSearchParams): Promise<ProviderListResult> {
    const url = new URL(YTS_BASE);
    url.searchParams.set("limit", params.limit || "20");
    url.searchParams.set("page", params.page || "1");
    url.searchParams.set("sort_by", params.sort_by || "date_added");
    url.searchParams.set("order_by", "desc");
    if (params.query_term)
      url.searchParams.set("query_term", params.query_term);
    if (params.quality && params.quality !== "all")
      url.searchParams.set("quality", params.quality);
    if (params.genre && params.genre !== "all")
      url.searchParams.set("genre", params.genre);
    if (params.minimum_rating && params.minimum_rating !== "0")
      url.searchParams.set("minimum_rating", params.minimum_rating);

    const res = await fetch(url.toString(), {
      headers: { "User-Agent": "TransMule/1.0" },
    });
    if (!res.ok) throw new Error(`YTS API error: ${res.status}`);

    const json = (await res.json()) as {
      status: string;
      data: { movie_count: number; page_number: number; movies: YtsMovie[] };
    };
    if (json.status !== "ok") throw new Error("YTS API returned non-ok status");

    const items = (json.data.movies ?? []).map(toMediaItem);
    return {
      items,
      total: json.data.movie_count ?? 0,
      page: json.data.page_number ?? 1,
    };
  },
};

registerProvider(provider);
export default provider;
