import { createContext, useContext } from "react";

/** A PDF to show: its title, the file name it downloads as, and how to make it. */
export type PdfRequest = { title: string; fileName: string; make: () => Promise<Blob> };

export const PdfViewerContext = createContext<(request: PdfRequest) => void>(() => {
  throw new Error("usePdfViewer must be used inside <PdfViewerProvider>");
});

/** Opens a PDF in the in-app viewer: view first, then download or print. */
export function usePdfViewer() {
  return useContext(PdfViewerContext);
}
