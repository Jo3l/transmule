import { getDownloadedUrls } from "../utils/database";

export default defineEventHandler((event) => {
  const { userId } = requireUser(event);
  const urls = getDownloadedUrls(userId);
  return { urls };
});
