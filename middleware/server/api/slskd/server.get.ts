import type { SlskdServerState } from "~/utils/slskd-client";

defineRouteMeta({
  openAPI: {
    tags: ["slskd"],
    summary: "Get slskd server status",
    description: "Returns the current Soulseek server connection state.",
    responses: {
      200: { description: "Server state" },
      502: { description: "slskd connection error" },
    },
  },
});

export default defineEventHandler(async (event) => {
  requireUser(event);

  const client = useSlskdClient();

  try {
    const state = await client.getServer();
    if (!state) {
      return { connected: false, state: null };
    }
    return { connected: true, state };
  } catch (err: any) {
    return { connected: false, error: err?.message || String(err), state: null };
  }
});
