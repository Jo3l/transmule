/**
 * GET /api/github/contributions?username=jo3l
 *
 * Scrapes GitHub's contribution graph HTML and returns clean JSON.
 * No auth required — GitHub serves this data publicly.
 */
export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const username = String(query.username || "").trim();
  if (!username) throw createError({ statusCode: 400, statusMessage: "username required" });

  const url = `https://github.com/users/${encodeURIComponent(username)}/contributions`;
  const resp = await fetch(url, {
    headers: { Accept: "text/html" },
  });
  if (!resp.ok) {
    throw createError({ statusCode: 502, statusMessage: `GitHub returned ${resp.status}` });
  }

  const html = await resp.text();

  // Extract total contributions
  const totalMatch = html.match(/(\d[\d,]*)\s+contributions?\s+in the last year/);
  const total = totalMatch ? parseInt(totalMatch[1].replace(/,/g, ""), 10) : 0;

  // Extract contribution cells: data-date + data-level
  const cellRe = /data-date="([^"]+)"[^>]*data-level="([^"]+)"/g;
  const days: Array<{ date: string; level: number; count?: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = cellRe.exec(html)) !== null) {
    days.push({ date: m[1], level: parseInt(m[2], 10) });
  }

  return { username, total, days };
});
