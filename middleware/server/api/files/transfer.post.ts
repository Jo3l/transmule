/**
 * POST /api/files/transfer — background move/copy across local and SMB.
 *
 * La lógica de la cola vive ahora en `utils/transfer-queue.ts` para que el
 * planificador pueda encolar movimientos igual que el file manager.
 */
import { enqueueTransferJob } from "~/utils/transfer-queue";

defineRouteMeta({
  openAPI: {
    tags: ["File Manager"],
    summary: "Move or copy (background)",
    responses: { 200: {}, 400: {} },
  },
});

export default defineEventHandler(async (event) => {
  requireUser(event);
  const body = await readBody(event);
  const { sources, destination, mode } = body ?? {};
  if (
    !Array.isArray(sources) ||
    !sources.length ||
    destination === undefined ||
    !["move", "copy"].includes(mode)
  )
    throw createError({
      statusCode: 400,
      statusMessage: "sources[], destination and mode are required",
    });

  const jobId = enqueueTransferJob(
    sources as string[],
    destination as string,
    mode as "move" | "copy",
  );
  return { jobId };
});
