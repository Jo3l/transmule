defineRouteMeta({
  openAPI: {
    tags: ["pyLoad"],
    summary: "pyLoad plugin configuration",
    description:
      "Returns the list of installed plugins with their configuration.",
    responses: {
      200: { description: "Array of plugin configuration objects" },
      502: { description: "pyLoad connection error" },
    },
  },
});

export default defineEventHandler(async (event) => {
  requireUser(event);

  const client = usePyLoadClient();

  try {
    const rawPlugins = await client.getPluginConfig();
    const normalizedPlugins = Object.entries(
      (rawPlugins || {}) as Record<string, any>,
    )
      .map(([name, section]) => {
        const items = Array.isArray(section?.items)
          ? section.items
          : Object.entries(section || {})
              .filter(([key]) => !["desc", "outline"].includes(key))
              .map(([key, option]) => ({
                name: key,
                description: option?.desc,
                type: option?.type,
                value: option?.value,
              }));

        const fields = items.map((item: any) => {
          const type = String(item?.type || "str");
          return {
            key: String(item?.name || ""),
            label: String(item?.description || item?.name || ""),
            type,
            value: item?.value,
            options: type.includes(";") ? type.split(";") : [],
          };
        });

        return {
          name,
          description: String(section?.description || section?.desc || name),
          outline: String(section?.outline || ""),
          fields,
        };
      })
      .filter((plugin) => plugin.fields.length > 0)
      .sort((left, right) => left.name.localeCompare(right.name));

    return normalizedPlugins;
  } catch (err: any) {
    console.error("Failed to fetch pyLoad plugins:", err);
    throw createError({
      statusCode: 502,
      statusMessage: "Failed to fetch pyLoad plugins",
    });
  }
});
