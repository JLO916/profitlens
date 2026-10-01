/** Called only from a user-triggered browser action. Nothing is sent to a server. */
export function downloadText(text: string, filename: string, mime = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
