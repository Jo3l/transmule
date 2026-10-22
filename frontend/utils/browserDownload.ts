/** Hand the original HTTP response to the browser's download manager.
 * Keep this synchronous so it runs within the user's click gesture. The browser
 * owns progress/errors; a dispatched click does not prove a file was saved.
 */
export function startBrowserDownload(url: string, filename: string) {
  const link = document.createElement("a");
  link.href = `${url}&download=1`;
  link.download = filename;
  link.referrerPolicy = "no-referrer";
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
  }
}
