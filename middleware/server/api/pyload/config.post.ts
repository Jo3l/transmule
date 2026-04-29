defineRouteMeta({
  openAPI: {
    tags: ["pyLoad"],
    summary: "Update pyLoad configuration values",
    description:
      "Updates one or more pyLoad configuration values for a category.",
    responses: {
      200: { description: "Configuration updated" },
      400: { description: "Invalid payload" },
      502: { description: "pyLoad connection error" },
    },
  },
});

function serializePyLoadValue(value: string | number | boolean): string {
  if (typeof value === "boolean") {
    return value ? "True" : "False";
  }

  return String(value);
}

export default defineEventHandler(async (event) => {
  requireUser(event);

  const body = await readBody<{
    section?: string;
    category?: string;
    values?: Record<string, string | number | boolean>;
  }>(event);

  const category = body?.category;
  const values = body?.values;
  const section = body?.section || "core";

  if (
    !category ||
    !values ||
    typeof values !== "object" ||
    Object.keys(values).length === 0
  ) {
    throw createError({
      statusCode: 400,
      statusMessage: "Missing config category or values",
    });
  }

  const client = usePyLoadClient();

  try {
    for (const [option, value] of Object.entries(values)) {
      await client.setConfigValue(
        category,
        option,
        serializePyLoadValue(value),
        section,
      );
    }

    return { ok: true };
  } catch (err: any) {
    console.error("Failed to update pyLoad config:", err);
    throw createError({
      statusCode: 502,
      statusMessage:
        err?.statusMessage || err?.message || "Failed to update pyLoad config",
    });
  }
});
