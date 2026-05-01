/**
 * Apply local patches to node_modules after npm install.
 */
const { copyFileSync, mkdirSync } = require("fs");
const { dirname, join } = require("path");

const patches = [
  {
    from: join(__dirname, "patches/@marsaud/smb2/lib/messages/create.js"),
    to: join(__dirname, "node_modules/@marsaud/smb2/lib/messages/create.js"),
  },
  {
    from: join(__dirname, "patches/@marsaud/smb2/lib/api/createWriteStream.js"),
    to: join(__dirname, "node_modules/@marsaud/smb2/lib/api/createWriteStream.js"),
  },
  {
    from: join(__dirname, "patches/@marsaud/smb2/lib/api/writeFile.js"),
    to: join(__dirname, "node_modules/@marsaud/smb2/lib/api/writeFile.js"),
  },
];

for (const { from, to } of patches) {
  try {
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(from, to);
    console.log("[apply-patches] patched", to);
  } catch (err) {
    console.error("[apply-patches] failed to patch", to, err.message);
    process.exit(1);
  }
}
