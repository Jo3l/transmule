export default defineCachedEventHandler(
  async (event) => {
    requireUser(event);

    const query = getQuery(event);
    const q = String(query.q ?? "").trim();
    if (!q) return { image: null };

    try {
      const res = await fetch(
        `https://www.episodate.com/api/search?q=${encodeURIComponent(q)}`,
        { headers: { "User-Agent": "TransMule/1.0" } },
      );
      if (!res.ok) return { image: null };
      const data = (await res.json()) as {
        tv_shows?: { image_thumbnail_path?: string }[];
      };
      const image = data.tv_shows?.[0]?.image_thumbnail_path ?? null;
      return { image };
    } catch {
      return { image: null };
    }
  },
  {
    maxAge: 60 * 60 * 24, // 24 hours
    getKey: (event) => {
      const q = String(getQuery(event).q ?? "")
        .trim()
        .toLowerCase();
      return `episodate:${q}`;
    },
  },
);
