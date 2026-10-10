/** Save a data/object URL to disk under the given file name. */
export function downloadUrl(url: string, name: string): void {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
}

/** Save text (a prompt list, JSON, HTML, CSV…) as a file. */
export function downloadText(text: string, name: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  downloadUrl(url, name);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
