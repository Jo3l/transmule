/**
 * On startup, apply YAML config (shares + download subdirectory) to slskd.
 * This runs once when the Nitro server starts — before any HTTP requests.
 */
export default defineNitroPlugin(async () => {
  const slskdUrl = useRuntimeConfig().slskdUrl;
  if (!slskdUrl) return;

  // Small delay to let slskd container finish starting
  await new Promise((r) => setTimeout(r, 3000));

  try {
    const client = useSlskdClient();
    console.log("[startup] slskd: applying YAML config (shares)...");
    await client.connect();
    console.log("[startup] slskd: config applied successfully");
  } catch (err: any) {
    console.warn("[startup] slskd: config apply failed (slskd may not be ready):", err.message);
  }
});
