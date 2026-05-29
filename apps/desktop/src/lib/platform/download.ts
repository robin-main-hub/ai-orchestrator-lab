export type TextDownloadRequest = {
  fileName: string;
  body: string;
  mimeType?: string;
};

export type DownloadAdapter = {
  downloadTextFile(request: TextDownloadRequest): void;
};

export const browserDownloadAdapter: DownloadAdapter = {
  downloadTextFile({ fileName, body, mimeType = "text/plain;charset=utf-8" }) {
    if (typeof document === "undefined" || typeof URL === "undefined" || typeof Blob === "undefined") {
      throw new Error("Text file download requires a browser-like runtime");
    }

    const blob = new Blob([body], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  },
};

export const platformDownload = browserDownloadAdapter;
