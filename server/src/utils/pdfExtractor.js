import fs from 'fs';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

/**
 * Extracts text page-by-page from a PDF file using Mozilla's pdfjs-dist.
 * Returns { pageCount, pages: [{ pageNumber, text }], totalCharacters, isScannedOrEmpty }
 */
export const extractTextPerPage = async (filePath) => {
  const fileBuffer = fs.readFileSync(filePath);
  const data = new Uint8Array(fileBuffer);

  const loadingTask = pdfjs.getDocument({
    data,
    useSystemFonts: true,
    disableFontFace: true,
  });

  const doc = await loadingTask.promise;
  const numPages = doc.numPages;
  const pages = [];

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const textContent = await page.getTextContent();

    let pageText = '';
    let lastY = null;

    for (const item of textContent.items) {
      if (!item.str) continue;

      const currentY = item.transform ? item.transform[5] : null;

      if (lastY !== null && currentY !== null && Math.abs(currentY - lastY) > 5) {
        // Different line (y position moved)
        pageText += '\n' + item.str;
      } else {
        // Same line
        if (pageText.length > 0 && !pageText.endsWith(' ') && !pageText.endsWith('\n')) {
          pageText += ' ';
        }
        pageText += item.str;
      }

      lastY = currentY;
    }

    const cleanText = pageText.trim();
    pages.push({
      pageNumber: pageNum,
      text: cleanText,
    });
  }

  const totalCharacters = pages.reduce((acc, p) => acc + p.text.length, 0);
  const isScannedOrEmpty = totalCharacters < 15;

  return {
    pageCount: numPages,
    pages,
    totalCharacters,
    isScannedOrEmpty,
  };
};
