/**
 * Server-side bulk cancellation helpers for slskd transfers.
 *
 * The frontend sends a single request per user/directory group; the middleware
 * resolves the real transfer ids from slskd's grouped transfers (source of
 * truth) and fans out the individual DELETE calls with limited concurrency.
 */

export interface SlskdCancelGroupInput {
  username: string;
  directory?: string;
  ids?: (string | number)[];
  remove?: boolean;
}

export interface SlskdCancelGroupResult {
  matched: number;
  cancelled: number;
}

function normSlskdPath(p: string): string {
  return p.replace(/\\/g, "/").replace(/\/+$/, "");
}

/**
 * Cancel (and optionally remove) all download transfers of a user that belong
 * to a directory (including merged subdirectories) or an explicit id list.
 */
export async function cancelSlskdTransferGroup(
  client: ReturnType<typeof useSlskdClient>,
  input: SlskdCancelGroupInput,
): Promise<SlskdCancelGroupResult> {
  const { username, directory = "", ids = [], remove = true } = input;

  const grouped = await client.getTransfersGrouped("download");
  const userGrp = grouped.find((g: any) => g.username === username);
  if (!userGrp) {
    return { matched: 0, cancelled: 0 };
  }

  const parent = directory ? normSlskdPath(directory) : "";
  const idSet = new Set(ids.map((i) => String(i)));
  const targets: string[] = [];

  for (const dir of userGrp.directories ?? []) {
    const dirPath = normSlskdPath(dir.directory ?? "");
    const inScope = parent
      ? dirPath === parent || dirPath.startsWith(parent + "/")
      : true;
    if (!inScope) continue;
    for (const file of dir.files ?? []) {
      const fid = String(file.id ?? "");
      if (!fid || fid.startsWith("synth-")) continue;
      if (idSet.size > 0 && !idSet.has(fid)) continue;
      targets.push(fid);
    }
  }

  // Fan out DELETEs with limited concurrency to avoid overwhelming slskd.
  const CONCURRENCY = 10;
  let cancelled = 0;
  for (let i = 0; i < targets.length; i += CONCURRENCY) {
    const batch = targets.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map((id) => client.cancelTransfer(username, id, "download", remove)),
    );
    cancelled += results.filter((r) => r.status === "fulfilled" && r.value).length;
  }

  return { matched: targets.length, cancelled };
}
