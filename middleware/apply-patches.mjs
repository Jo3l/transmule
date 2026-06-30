/**
 * Apply local patches to node_modules after npm install.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const patches = [
  // smb3-client readdir: adaptive continuation for Samba/Synology DSM.
  // The canonical SMB2 continuation sends an EMPTY FileName (macOS/Windows
  // accept this). Samba incl. Synology DSM rejects empty continuation with
  // STATUS_OBJECT_NAME_INVALID. This patch adaptively retries with the
  // search pattern when rejected; the switch is sticky per listing.
  // https://github.com/euricojardim/smb3-client/pull/10
  {
    from: join(__dirname, "patches/smb3-client/dist/open/readdir.js"),
    to: join(__dirname, "node_modules/smb3-client/dist/open/readdir.js"),
  },
  // smb3-client NTStatus: add STATUS_OBJECT_NAME_INVALID (0xC0000033)
  // needed by the readdir adaptive continuation logic above.
  {
    from: join(__dirname, "patches/smb3-client/dist/wire/commands.js"),
    to: join(__dirname, "node_modules/smb3-client/dist/wire/commands.js"),
  },
];

for (const { from, to } of patches) {
  try {
    mkdirSync(dirname(to), { recursive: true });
    const content = readFileSync(from, "utf-8");
    writeFileSync(to, content, "utf-8");
    console.log("[apply-patches] patched", to);
  } catch (err) {
    console.error("[apply-patches] failed to patch", to, err.message);
    process.exit(1);
  }
}
