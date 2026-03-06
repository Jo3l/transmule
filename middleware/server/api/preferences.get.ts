import { getAllUserPreferences } from "../utils/database";

export default defineEventHandler((event) => {
  const userId: number = event.context.user?.userId;
  if (!userId) {
    throw createError({
      statusCode: 401,
      statusMessage: "Authentication required",
    });
  }
  return getAllUserPreferences(userId);
});
