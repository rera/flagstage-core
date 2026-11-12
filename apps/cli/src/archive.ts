import { gzipSync } from "node:zlib";

function splitName(name: string): { name: string; prefix: string } {
  if (name.length <= 100) return { name, prefix: "" };
  const slash = name.lastIndexOf("/", 155);
  if (slash <= 0 || name.length - slash - 1 > 100) {
    throw new Error(`Archive path is too long: ${name}`);
  }
  return { name: name.slice(slash + 1), prefix: name.slice(0, slash) };
}

function header(path: string, size: number): Buffer {
  const parts = splitName(path);
  const buf = Buffer.alloc(512);
  buf.write(parts.name, 0, 100, "utf8");
  buf.write("0000644\0", 100, "ascii");
  buf.write("0000000\0", 108, "ascii");
  buf.write("0000000\0", 116, "ascii");
  buf.write(`${size.toString(8).padStart(11, "0")}\0`, 124, "ascii");
  buf.write(
    `${Math.floor(Date.now() / 1000)
      .toString(8)
      .padStart(11, "0")}\0`,
    136,
    "ascii"
  );
  buf.write("        ", 148, "ascii");
  buf.write("0", 156, "ascii");
  buf.write("ustar\0", 257, "ascii");
  buf.write("00", 263, "ascii");
  if (parts.prefix) buf.write(parts.prefix, 345, 155, "utf8");
  let sum = 0;
  for (const byte of buf) sum += byte;
  buf.write(`${sum.toString(8).padStart(6, "0")}\0 `, 148, "ascii");
  return buf;
}

/** ustar archive, gzip-compressed. Paths may use a directory prefix. */
export function packTarGz(files: Array<{ name: string; body: Uint8Array }>): Buffer {
  const chunks: Buffer[] = [];
  for (const file of files) {
    chunks.push(header(file.name, file.body.byteLength));
    chunks.push(Buffer.from(file.body));
    const extra = (512 - (file.body.byteLength % 512)) % 512;
    if (extra) chunks.push(Buffer.alloc(extra));
  }
  chunks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(chunks));
}
