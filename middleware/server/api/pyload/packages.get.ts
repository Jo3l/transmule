import type {
  PyLoadPackage,
  PyLoadLink,
  PyLoadActiveDownload,
} from "~/utils/pyload-client";

defineRouteMeta({
  openAPI: {
    tags: ["pyLoad"],
    summary: "List pyLoad packages",
    description:
      "Returns all packages in the download queue and collector, " +
      "each with their download links and progress information.",
    responses: {
      200: { description: "Package list" },
      502: { description: "pyLoad connection error" },
    },
  },
});

/** Status codes that pyLoad uses for individual links */
const LINK_STATUS: Record<number, string> = {
  0: "Finished",
  1: "Offline",
  2: "Online",
  3: "Queued",
  4: "Skipped",
  5: "Waiting",
  6: "Temp Offline",
  7: "Starting",
  8: "Failed",
  9: "Aborted",
  10: "Decrypting",
  11: "Custom",
  12: "Downloading",
  13: "Processing",
  14: "Unknown",
};

function mapLink(link: PyLoadLink, active?: PyLoadActiveDownload) {
  const totalBytes = link.size || 0;

  // Prefer real-time data from status_downloads (has live speed, bleft, percent)
  // over the static snapshot from get_queue_data (bleft is always absent).
  let progress: number;
  let speedBytesPerSec: number;
  let doneBytes: number;

  if (active) {
    progress = active.percent ?? 0;
    speedBytesPerSec = active.speed || 0;
    doneBytes = totalBytes > 0 ? Math.max(0, totalBytes - active.bleft) : 0;
  } else if (link.status === 0) {
    // Finished — static snapshot has no bleft but status tells us it's done
    progress = 100;
    speedBytesPerSec = 0;
    doneBytes = totalBytes;
  } else {
    progress = 0;
    speedBytesPerSec = 0;
    doneBytes = 0;
  }

  const leftBytes = Math.max(0, totalBytes - doneBytes);
  const status = active?.status ?? link.status;

  return {
    fid: link.fid,
    url: link.url,
    name: link.name || link.url,
    packageID: link.packageID,
    status: LINK_STATUS[status] ?? "Unknown",
    statusCode: status,
    error: link.error || "",
    plugin: link.plugin || "",
    size: totalBytes,
    size_fmt: formatBytes(totalBytes),
    done: doneBytes,
    done_fmt: formatBytes(doneBytes),
    left: leftBytes,
    speed: speedBytesPerSec,
    speed_fmt: formatSpeed(speedBytesPerSec),
    progress,
    isFinished: status === 0,
    isFailed: status === 8 || status === 1,
    isDownloading: status === 12,
  };
}

function mapPackage(
  pkg: PyLoadPackage,
  dest: "queue" | "collector",
  activeMap: Map<number, PyLoadActiveDownload>,
) {
  const links = (pkg.links ?? []).map((l) => mapLink(l, activeMap.get(l.fid)));
  const totalSize = links.reduce((s, l) => s + l.size, 0);
  const doneSize = links.reduce((s, l) => s + l.done, 0);
  const progress =
    totalSize > 0 ? Math.round((doneSize / totalSize) * 10000) / 100 : 0;

  const activeLinks = links.filter((l) => l.isDownloading).length;
  const failedLinks = links.filter((l) => l.isFailed).length;
  const finishedLinks = links.filter((l) => l.isFinished).length;
  const speedBytes = links.reduce((s, l) => s + l.speed, 0);

  return {
    pid: pkg.pid,
    name: pkg.name,
    folder: pkg.folder,
    dest,
    linkCount: links.length,
    links,
    totalSize,
    totalSize_fmt: formatBytes(totalSize),
    doneSize,
    doneSize_fmt: formatBytes(doneSize),
    progress,
    activeLinks,
    failedLinks,
    finishedLinks,
    speed: speedBytes,
    speed_fmt: formatSpeed(speedBytes),
  };
}

export default defineEventHandler(async (event) => {
  requireUser(event);

  const client = usePyLoadClient();

  const [queue, collector, activeDownloads] = await Promise.all([
    client.getQueue(),
    client.getCollector(),
    client.getActiveDownloads().catch(() => [] as PyLoadActiveDownload[]),
  ]);

  // Build fid → active download map for O(1) lookup
  const activeMap = new Map<number, PyLoadActiveDownload>(
    activeDownloads.map((d) => [d.fid, d]),
  );

  const queuePackages = queue.map((p) => mapPackage(p, "queue", activeMap));
  const collectorPackages = collector.map((p) =>
    mapPackage(p, "collector", activeMap),
  );
  const allPackages = [...queuePackages, ...collectorPackages];

  const totalSpeed = allPackages
    .flatMap((p) => p.links)
    .reduce((s, l) => s + l.speed, 0);

  return {
    packages: allPackages,
    count: allPackages.length,
    totalSpeed,
    totalSpeed_fmt: formatSpeed(totalSpeed),
  };
});
