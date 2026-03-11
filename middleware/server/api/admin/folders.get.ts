defineRouteMeta({
  openAPI: {
    tags: ["Admin"],
    summary: "Get shared folder configuration",
    description:
      "Retrieve the shared download and temp/incomplete directory configuration. " +
      "Returns the stored config merged with Transmission's current session values.",
    responses: {
      200: { description: "Folder config" },
      403: { description: "Admin access required" },
    },
  },
});

export default defineEventHandler(async (event) => {
  requireAdmin(event);

  // Try to get stored values first, fall back to Transmission session
  let downloadDir = getConfig("shared_download_dir") || "";
  let incompleteDir = getConfig("shared_incomplete_dir") || "";
  let incompleteDirEnabled =
    getConfig("shared_incomplete_dir_enabled") === "true";

  // If no stored config yet, seed from Transmission session
  if (!downloadDir) {
    try {
      const client = useTransmissionClient();
      const session = await client.getSessionRaw();
      downloadDir = session["download-dir"] || "";
      incompleteDir = session["incomplete-dir"] || "";
      incompleteDirEnabled = session["incomplete-dir-enabled"] ?? false;
    } catch {
      /* Transmission may be unreachable */
    }
  }

  return {
    downloadDir,
    incompleteDir,
    incompleteDirEnabled,
  };
});
