import { getConfig, setConfig } from "../../utils/database";

defineRouteMeta({
  openAPI: {
    tags: ["aMule"],
    summary: "Get or set aMule sharing preferences",
    responses: {
      200: { description: "Sharing preferences" },
    },
  },
});

export default defineEventHandler(async (event) => {
  requireUser(event);

  if (event.method === "GET") {
    return {
      includeSubdirs: getConfig("amule_include_subdirs") !== "false",
    };
  }

  if (event.method === "POST") {
    const body = await readBody(event);
    if (body.includeSubdirs !== undefined) {
      setConfig("amule_include_subdirs", body.includeSubdirs ? "true" : "false");
    }
    return { success: true };
  }
});
