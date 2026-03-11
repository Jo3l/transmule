export default defineEventHandler((event) => {
  const user = requireUser(event);
  const prefs = getAllUserPreferences(user.userId);
  return prefs;
});
