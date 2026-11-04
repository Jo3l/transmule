/** Bounded bencode validation before forwarding untrusted metainfo to Transmission. */
export const MAX_TORRENT_BYTES = 5 * 1024 * 1024;

export function validateTorrentMetainfo(data: Buffer): void {
  const invalid = () => { throw createError({ statusCode: 400, statusMessage: "Invalid torrent metainfo" }); };
  if (!data.length || data.length > MAX_TORRENT_BYTES) invalid();
  let offset = 0;
  let nodes = 0;
  function parse(depth = 0): any {
    if (depth > 64 || ++nodes > 100000 || offset >= data.length) return invalid();
    const token = data[offset];
    if (token >= 48 && token <= 57) {
      const colon = data.indexOf(58, offset);
      if (colon < 0 || colon - offset > 8) return invalid();
      const raw = data.toString("latin1", offset, colon);
      if (!/^(0|[1-9][0-9]*)$/.test(raw)) return invalid();
      const end = colon + 1 + Number(raw);
      if (end > data.length) return invalid();
      offset = end;
      return data.subarray(colon + 1, end);
    }
    offset++;
    if (token === 105) {
      const end = data.indexOf(101, offset);
      if (end < 0) return invalid();
      const raw = data.toString("latin1", offset, end);
      if (!/^(0|-?[1-9][0-9]*)$/.test(raw) || !Number.isSafeInteger(Number(raw))) return invalid();
      offset = end + 1;
      return Number(raw);
    }
    if (token !== 100 && token !== 108) return invalid();
    const value: any = token === 100 ? Object.create(null) : [];
    let previous: Buffer | undefined;
    while (data[offset] !== 101) {
      if (token === 108) value.push(parse(depth + 1));
      else {
        const key = parse(depth + 1);
        if (!Buffer.isBuffer(key) || (previous && Buffer.compare(previous, key) >= 0)) return invalid();
        previous = key;
        value[key.toString("hex")] = parse(depth + 1);
      }
    }
    offset++;
    return value;
  }
  const field = (obj: any, key: string) => obj?.[Buffer.from(key).toString("hex")];
  const dictionary = (obj: any) => obj && typeof obj === "object" && !Array.isArray(obj) && !Buffer.isBuffer(obj);
  const safeName = (name: any) => Buffer.isBuffer(name) && name.length > 0 &&
    ![".", ".."].includes(name.toString()) && !/[\x00/\\]/.test(name.toString());
  const length = (n: any) => Number.isSafeInteger(n) && n >= 0;
  const root = parse();
  const info = field(root, "info");
  if (offset !== data.length || !dictionary(root) || !dictionary(info) || !safeName(field(info, "name"))) invalid();
  const pieceLength = field(info, "piece length");
  if (!Number.isSafeInteger(pieceLength) || pieceLength <= 0) invalid();
  const pieces = field(info, "pieces");
  if (pieces !== undefined) {
    if (!Buffer.isBuffer(pieces) || pieces.length % 20 !== 0) invalid();
    const files = field(info, "files");
    let total = 0;
    if (files !== undefined) {
      if (!Array.isArray(files) || !files.length || field(info, "length") !== undefined) invalid();
      for (const file of files) {
        const path = field(file, "path");
        if (!dictionary(file) || !length(field(file, "length")) || !Array.isArray(path) || !path.length || !path.every(safeName)) invalid();
        total += field(file, "length");
      }
    } else {
      if (!length(field(info, "length"))) invalid();
      total = field(info, "length");
    }
    if (!Number.isSafeInteger(total) || pieces.length / 20 !== Math.ceil(total / pieceLength)) invalid();
  } else if (field(info, "meta version") !== 2) invalid();
  if (field(info, "meta version") === 2) {
    if (pieceLength < 16384 || !Number.isInteger(Math.log2(pieceLength))) invalid();
    function checkTree(tree: any, depth = 0): void {
      if (!dictionary(tree) || !Object.keys(tree).length || depth > 64) invalid();
      for (const key of Object.keys(tree)) {
        const entry = tree[key];
        if (key === "") {
          if (!depth || Object.keys(tree).length !== 1 || !dictionary(entry) || !length(field(entry, "length"))) invalid();
          const hash = field(entry, "pieces root");
          if (field(entry, "length") > 0 && (!Buffer.isBuffer(hash) || hash.length !== 32)) invalid();
        } else {
          if (!safeName(Buffer.from(key, "hex"))) invalid();
          checkTree(entry, depth + 1);
        }
      }
    }
    checkTree(field(info, "file tree"));
  }
}
