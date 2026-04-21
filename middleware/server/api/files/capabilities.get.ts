import { spawnSync } from "node:child_process";
import sevenBin from "7zip-bin";

type CompressFormatOption = {
  value: string;
  label: string;
  extension: string;
};

defineRouteMeta({
  openAPI: {
    tags: ["File Manager"],
    summary: "Get archive capabilities",
    description:
      "Returns dynamic compression/extraction capabilities based on available binaries in the runtime.",
    responses: {
      200: { description: "Capabilities" },
      503: { description: "Downloads directory not configured" },
    },
  },
});

export default defineEventHandler(async (event) => {
  requireUser(event);

  // Keep behavior aligned with other file endpoints: fail if downloads root
  // is not configured/available for the current runtime.
  getDownloadsRoot();

  const has7za = commandAvailable(sevenBin.path7za, ["i"]);
  const hasTar = commandAvailable("tar", ["--version"]);

  const compressFormats: CompressFormatOption[] = [];
  if (has7za) {
    compressFormats.push(
      { value: "zip", label: "ZIP (.zip)", extension: ".zip" },
      { value: "7z", label: "7-Zip (.7z)", extension: ".7z" },
    );
  }
  if (hasTar) {
    compressFormats.push(
      { value: "tar", label: "TAR (.tar)", extension: ".tar" },
      { value: "tar.gz", label: "TAR + GZ (.tar.gz)", extension: ".tar.gz" },
      {
        value: "tar.bz2",
        label: "TAR + BZ2 (.tar.bz2)",
        extension: ".tar.bz2",
      },
      { value: "tar.xz", label: "TAR + XZ (.tar.xz)", extension: ".tar.xz" },
    );
  }

  const extractExtensions = new Set<string>();

  // 7-Zip path covers the common archive set in this project.
  if (has7za) {
    for (const ext of [
      ".zip",
      ".rar",
      ".r00",
      ".7z",
      ".tar",
      ".tar.gz",
      ".tar.bz2",
      ".tar.xz",
      ".tgz",
      ".gz",
      ".bz2",
      ".xz",
    ]) {
      extractExtensions.add(ext);
    }
  }

  // Keep explicit multi-volume RAR pattern visible.
  extractExtensions.add(".r01");

  return {
    compressFormats,
    extractExtensions: Array.from(extractExtensions).sort(
      (a, b) => b.length - a.length,
    ),
    tools: {
      has7za,
      hasTar,
    },
  };
});

function commandAvailable(command: string, args: string[]): boolean {
  try {
    const res = spawnSync(command, args, {
      encoding: "utf8",
      timeout: 6000,
    });
    return res.status === 0;
  } catch {
    return false;
  }
}
