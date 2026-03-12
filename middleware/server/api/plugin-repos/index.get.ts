/**
 * GET /api/plugin-repos
 *
 * Returns the list of stored plugin repository URLs.
 */
import { getPluginRepositories } from "../../utils/database";

export default defineEventHandler((event) => {
  requireUser(event);
  return getPluginRepositories();
});
