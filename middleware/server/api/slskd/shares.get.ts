defineRouteMeta({
  openAPI: {
    tags: ["slskd"],
    summary: "List local shared files (tree + aMule stats)",
    description:
      "Returns the slskd share tree structure alongside aMule shared file data, " +
      "so the frontend can render a unified directory browser.",
    responses: {
      200: { description: "Share tree + aMule stats" },
      502: { description: "slskd connection error" },
    },
  },
});

interface FileEntry {
  filename: string;
  size: number;
  size_fmt: string;
  bitRate: number | null;
  length: number | null;
  extension: string;
}

interface TreeNode {
  name: string;
  fileCount: number;
  files: FileEntry[];
  subdirectories: TreeNode[];
}

/**
 * Build a directory tree from a flat list of slskd share entries.
 * Entries have names like "downloads" or "downloads\\subdir".
 */
function buildTree(entries: any[]): TreeNode[] {
  const root: TreeNode[] = [];

  for (const entry of entries) {
    const fullName = entry.name ?? "";
    // Split on backslash or forward slash
    const parts = fullName.split(/[\\/]/);
    const topDir = parts[0];

    // Find or create the top-level directory node
    let topNode = root.find((n) => n.name === topDir);
    if (!topNode) {
      topNode = { name: topDir, fileCount: 0, files: [], subdirectories: [] };
      root.push(topNode);
    }

    if (parts.length === 1) {
      // Files directly in this directory
      topNode.fileCount += entry.fileCount ?? 0;
      for (const f of entry.files ?? []) {
        topNode.files.push({
          filename: f.filename ?? "",
          size: f.size ?? 0,
          size_fmt: formatBytes(f.size ?? 0),
          bitRate: f.bitRate ?? null,
          length: f.length ?? null,
          extension: f.extension ?? "",
        });
      }
    } else {
      // It's a subdirectory - add to the subdirectory tree
      // parts[0] is topDir, parts[1..] is the subpath
      let current = topNode;
      for (let i = 1; i < parts.length; i++) {
        const part = parts[i];
        let child = current.subdirectories.find((n) => n.name === part);
        if (!child) {
          child = { name: part, fileCount: 0, files: [], subdirectories: [] };
          current.subdirectories.push(child);
        }
        if (i === parts.length - 1) {
          // Last part: add files here
          child.fileCount += entry.fileCount ?? 0;
          for (const f of entry.files ?? []) {
            child.files.push({
              filename: f.filename ?? "",
              size: f.size ?? 0,
              size_fmt: formatBytes(f.size ?? 0),
              bitRate: f.bitRate ?? null,
              length: f.length ?? null,
              extension: f.extension ?? "",
            });
          }
        }
        current = child;
      }
    }
  }

  return root;
}

export default defineEventHandler(async (event) => {
  requireUser(event);

  const amuleClient = useAmuleClient();
  const slskdClient = useSlskdClient();

  // Fetch aMule shared files and slskd shares in parallel
  const [amuleFiles, slskdShares] = await Promise.all([
    amuleClient.getSharedFiles().catch(() => []),
    slskdClient.getShares().catch(() => null),
  ]);

  // Build aMule file map by name for cross-referencing
  const amuleMap: Record<string, any> = {};
  for (const f of amuleFiles) {
    const key = f.fileName || f.name || "";
    if (key) {
      amuleMap[key] = f;
      // Also index by just the filename (last path component)
      const lastSep = Math.max(key.lastIndexOf("\\"), key.lastIndexOf("/"));
      if (lastSep >= 0) {
        const shortKey = key.slice(lastSep + 1);
        if (shortKey && !amuleMap[shortKey]) amuleMap[shortKey] = f;
      }
    }
  }

  // Build slskd tree
  const slskdResult: any[] = [];
  if (slskdShares) {
    for (const host of Object.keys(slskdShares)) {
      const shareList = slskdShares[host] ?? [];
      for (const share of shareList) {
        const shareId = share.id;
        if (!shareId) continue;

        // Get flat contents from slskd
        let entries: any[];
        try {
          entries = (await slskdClient.getShareContents(shareId, "")) ?? [];
        } catch {
          continue;
        }

        // Build tree from flat entries
        const tree = buildTree(entries);

        // Annotate tree nodes with aMule stats
        function annotate(nodes: TreeNode[]) {
          for (const node of nodes) {
            for (const f of node.files) {
              const aKey = f.filename;
              if (amuleMap[aKey]) {
                (f as any).amuleStats = {
                  xfer_fmt: amuleMap[aKey].xfer_fmt,
                  xfer_all_fmt: amuleMap[aKey].xfer_all_fmt,
                  req: amuleMap[aKey].req,
                  priority: amuleMap[aKey].priority,
                  hash: amuleMap[aKey].hash,
                };
              }
            }
            annotate(node.subdirectories);
          }
        }
        annotate(tree);

        slskdResult.push({
          shareId,
          localPath: share.localPath ?? "",
          remotePath: share.remotePath ?? "",
          directories: share.directories ?? 0,
          files: share.files ?? 0,
          contents: tree,
        });
      }
    }
  }

  // aMule totals
  const totalAmuleSpeed = amuleFiles.reduce(
    (s: number, f: any) => s + (f.upSpeed || 0),
    0,
  );

  return {
    slskd: slskdResult,
    amule: {
      fileCount: amuleFiles.length,
      totalSpeed: totalAmuleSpeed,
      totalSpeed_fmt: formatSpeed(totalAmuleSpeed),
    },
  };
});
