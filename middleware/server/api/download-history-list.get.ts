import {
  getDownloadHistoryPaginated,
  getDownloadHistoryCount,
} from "../utils/database";

export default defineEventHandler((event) => {
  const { userId } = requireUser(event);
  const q = getQuery(event);
  const page = Math.max(1, Number(q.page) || 1);
  const limit = 50;
  const offset = (page - 1) * limit;

  const total = getDownloadHistoryCount(userId);
  const entries = getDownloadHistoryPaginated(userId, limit, offset);
  const pages = Math.max(1, Math.ceil(total / limit));

  return { entries, total, page, pages };
});
