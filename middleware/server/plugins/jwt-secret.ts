/**
 * Resolve the JWT signing secret at startup (NITRO_JWT_SECRET → data/.jwt_secret
 * → generated and persisted), so no request is ever signed with a placeholder.
 * Replaces the per-container entrypoint script.
 */
export default defineNitroPlugin(() => {
  initJwtSecret();
});
