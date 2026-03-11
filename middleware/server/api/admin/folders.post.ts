defineRouteMeta({
  openAPI: {
    tags: ["Admin"],
    summary: "Save shared folder configuration",
    description:
      "Persist the shared download and temp/incomplete directory configuration " +
      "and push it to the Transmission session.",
    responses: {
      200: { description: "Saved successfully" },
      400: { description: "Invalid body" },
      403: { description: "Admin access required" },
    },
  },
});

export default defineEventHandler(async (event) => {
  requireAdmin(event);

  const body = await readBody(event);
  if (!body || typeof body !== "object") {
    throw createError({ statusCode: 400, statusMessage: "Body required" });
  }

  const { downloadDir, incompleteDirEnabled, incompleteDir } = body as {
    downloadDir?: string;
    incompleteDirEnabled?: boolean;
    incompleteDir?: string;
  };

  // Persist to DB
  if (downloadDir !== undefined) {
    setConfig("shared_download_dir", downloadDir);
  }
  if (incompleteDirEnabled !== undefined) {
    setConfig(
      "shared_incomplete_dir_enabled",
      incompleteDirEnabled ? "true" : "false",
    );
  }
  if (incompleteDir !== undefined) {
    setConfig("shared_incomplete_dir", incompleteDir);
  }

  // Push to Transmission
  try {
    const client = useTransmissionClient();
    const sessionUpdate: Record<string, unknown> = {};

    if (downloadDir !== undefined) {
      sessionUpdate["download-dir"] = downloadDir;
    }
    if (incompleteDirEnabled !== undefined) {
      sessionUpdate["incomplete-dir-enabled"] = incompleteDirEnabled;
    }
    if (incompleteDir !== undefined) {
      sessionUpdate["incomplete-dir"] = incompleteDir;
    }

    if (Object.keys(sessionUpdate).length > 0) {
      await client.setSession(sessionUpdate);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[folders] Could not push to Transmission:", message);
    // Still return success — config is saved in DB even if Transmission is down
  }

  return { ok: true };
});
