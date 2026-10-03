import { inflateRawSync } from "node:zlib";

/**
 * 測試用最小 zip 讀取器（不依賴 jszip）：由 End of Central Directory 找到中央目錄，
 * 逐筆讀檔名、壓縮方式、壓縮後大小與 local header 位移，再從 local header 之後取資料。
 * 只支援 stored（0）與 deflate（8）；不支援 zip64、加密與多磁碟——遇到就丟錯，不猜。
 */
export function readZip(bytes: Uint8Array): Map<string, Buffer> {
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const EOCD = 0x06054b50, CENTRAL = 0x02014b50, LOCAL = 0x04034b50;
  let end = -1;
  // EOCD 固定 22 bytes，後面最多接 65535 bytes 的註解。
  for (let offset = buffer.length - 22; offset >= Math.max(0, buffer.length - 22 - 0xffff); offset--) {
    if (buffer.readUInt32LE(offset) === EOCD) { end = offset; break; }
  }
  if (end < 0) throw new Error("ZIP_EOCD_NOT_FOUND");
  if (buffer.readUInt16LE(end + 4) !== 0 || buffer.readUInt16LE(end + 6) !== 0) throw new Error("ZIP_MULTI_DISK_UNSUPPORTED");
  const count = buffer.readUInt16LE(end + 10);
  const directoryOffset = buffer.readUInt32LE(end + 16);
  if (count === 0xffff || directoryOffset === 0xffffffff) throw new Error("ZIP64_UNSUPPORTED");
  const files = new Map<string, Buffer>();
  let cursor = directoryOffset;
  for (let index = 0; index < count; index++) {
    if (buffer.readUInt32LE(cursor) !== CENTRAL) throw new Error("ZIP_CENTRAL_DIRECTORY_CORRUPT");
    const flags = buffer.readUInt16LE(cursor + 8);
    const method = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28), extraLength = buffer.readUInt16LE(cursor + 30), commentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.toString("utf8", cursor + 46, cursor + 46 + nameLength);
    if (flags & 0x1) throw new Error("ZIP_ENCRYPTED_UNSUPPORTED");
    if (buffer.readUInt32LE(localOffset) !== LOCAL) throw new Error("ZIP_LOCAL_HEADER_CORRUPT");
    const dataStart = localOffset + 30 + buffer.readUInt16LE(localOffset + 26) + buffer.readUInt16LE(localOffset + 28);
    const raw = buffer.subarray(dataStart, dataStart + compressedSize);
    const data = method === 0 ? Buffer.from(raw) : method === 8 ? inflateRawSync(raw) : (() => { throw new Error(`ZIP_METHOD_UNSUPPORTED_${method}`); })();
    if (data.length !== uncompressedSize) throw new Error("ZIP_SIZE_MISMATCH");
    if (files.has(name)) throw new Error("ZIP_DUPLICATE_ENTRY");
    files.set(name, data);
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

/** 取出 zip 內某個文字檔（UTF-8）；不存在時回傳 undefined。 */
export function zipText(files: Map<string, Buffer>, name: string): string | undefined {
  return files.get(name)?.toString("utf8");
}
