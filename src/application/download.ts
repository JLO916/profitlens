/** Called only from a user-triggered browser action. Nothing is sent to a server. */
export function downloadText(text: string, filename: string, mime = "text/csv;charset=utf-8") {
  saveBlob(new Blob([text], { type: mime }), filename);
}

/** R6 binary exports (Excel／PPT). Same rule as downloadText: only from a user action, generated and saved locally. */
export function downloadBinary(bytes: Uint8Array | ArrayBuffer, filename: string, mime: string) {
  // Copy into a plain ArrayBuffer-backed view so a SharedArrayBuffer or a later mutation never reaches the Blob.
  const part = bytes instanceof ArrayBuffer ? bytes.slice(0) : new Uint8Array(bytes);
  saveBlob(new Blob([part], { type: mime }), filename);
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
