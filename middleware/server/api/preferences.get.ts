import { getAllUserPreferences } from "../utils/database";

export default defineEventHandler((event) => {
  const { userId } = requireUser(event);
  return getAllUserPreferences(userId);
});
