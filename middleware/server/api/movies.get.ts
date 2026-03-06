const YTS_BASE = "https://movies-api.accel.li/api/v2/list_movies.json";

interface Torrent {
  url: string;
  hash: string;
  quality: string;
  type: string;
  seeds: number;
  peers: number;
  size: string;
  date_uploaded: string;
}

interface Movie {
  id: number;
  url: string;
  imdb_code: string;
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
  torrents: Torrent[];
}

export default defineEventHandler(async (event) => {
  requireUser(event);

  const query = getQuery(event);
  const queryTerm = (query.query_term as string) || "";
  const page = (query.page as string) || "1";
  const limit = (query.limit as string) || "20";
  const quality = (query.quality as string) || "";
  const genre = (query.genre as string) || "";
  const sortBy = (query.sort_by as string) || "date_added";
  const minimumRating = (query.minimum_rating as string) || "0";

  const url = new URL(YTS_BASE);
  url.searchParams.set("limit", limit);
  url.searchParams.set("page", page);
  url.searchParams.set("sort_by", sortBy);
  url.searchParams.set("order_by", "desc");
  if (queryTerm) url.searchParams.set("query_term", queryTerm);
  if (quality && quality !== "all") url.searchParams.set("quality", quality);
  if (genre && genre !== "all") url.searchParams.set("genre", genre);
  if (minimumRating && minimumRating !== "0")
    url.searchParams.set("minimum_rating", minimumRating);

  try {
    const res = await fetch(url.toString(), {
      headers: {
        "User-Agent": "TransMule/1.0",
      },
    });

    if (!res.ok) {
      throw createError({
        statusCode: res.status,
        statusMessage: `YTS API error: ${res.status}`,
      });
    }

    const json = (await res.json()) as {
      status: string;
      data: {
        movie_count: number;
        limit: number;
        page_number: number;
        movies: Movie[];
      };
    };

    if (json.status !== "ok") {
      throw createError({
        statusCode: 502,
        statusMessage: "YTS API returned non-ok status",
      });
    }

    return {
      movies: json.data.movies ?? [],
      movie_count: json.data.movie_count ?? 0,
      page: json.data.page_number ?? 1,
    };
  } catch (err: any) {
    if (err.statusCode) throw err;
    throw createError({
      statusCode: 502,
      statusMessage: err.message || "Failed to fetch movies",
    });
  }
});
