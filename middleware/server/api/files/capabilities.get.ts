import { spawnSync } from "node:child_process";

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

  const hasUnar = commandAvailable("unar", ["-v"]);
  const hasZip = commandAvailable("zip", ["-v"]);
  const hasTar = commandAvailable("tar", ["--version"]);

  const compressFormats: CompressFormatOption[] = [];
  if (hasZip) {
    compressFormats.push(
      { value: "zip", label: "ZIP (.zip)", extension: ".zip" },
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

  // unar supports a wide range of archive formats.
  if (hasUnar) {
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
      ".cbz",
      ".cbr",
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
      hasUnar,
      hasZip,
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
    // zip -v exits with code 0; unar -v may exit 1 on some builds — treat both as "available"
    return res.status === 0 || (res.status === 1 && !res.error);
  } catch {
    return false;
  }
}
