import React, { useState, useEffect, useRef } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  ChevronLeft,
  ChevronRight,
  Bookmark,
  X,
  FileText,
  Loader2,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';

import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Configure pdf.js worker for Vite
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

export default function PdfViewerPane({
  fileUrl,
  title,
  targetPage = 1,
  activeCitation = null,
  onClearCitation,
  onPageChange,
}) {
  const [numPages, setNumPages] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1.1);
  const [loading, setLoading] = useState(true);
  const [pdfError, setPdfError] = useState(null);
  const containerRef = useRef(null);

  // Sync when targetPage changes (e.g. from citation click)
  useEffect(() => {
    if (targetPage && targetPage >= 1) {
      setCurrentPage(targetPage);
    }
  }, [targetPage]);

  const onDocumentLoadSuccess = ({ numPages }) => {
    setNumPages(numPages);
    setLoading(false);
    setPdfError(null);
  };

  const onDocumentLoadError = (err) => {
    console.error('react-pdf load error:', err);
    setPdfError(err.message || 'Failed to render PDF in viewer');
    setLoading(false);
  };

  const handlePrevPage = () => {
    if (currentPage > 1) {
      const nextP = currentPage - 1;
      setCurrentPage(nextP);
      if (onPageChange) onPageChange(nextP);
    }
  };

  const handleNextPage = () => {
    if (numPages && currentPage < numPages) {
      const nextP = currentPage + 1;
      setCurrentPage(nextP);
      if (onPageChange) onPageChange(nextP);
    }
  };

  const handleZoomIn = () => setScale((s) => Math.min(2.5, s + 0.15));
  const handleZoomOut = () => setScale((s) => Math.max(0.6, s - 0.15));
  const handleResetZoom = () => setScale(1.0);

  return (
    <div className="h-full flex flex-col bg-slate-950 border-r border-slate-800 relative overflow-hidden select-none">
      {/* Viewer Header / Toolbar */}
      <div className="p-3 border-b border-slate-800 bg-slate-900/90 flex flex-wrap items-center justify-between gap-2 shrink-0 z-10">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20 flex items-center justify-center">
            <FileText className="w-4 h-4" />
          </div>
          <div className="max-w-[180px] sm:max-w-xs truncate">
            <h4 className="text-xs font-semibold text-white truncate" title={title}>
              {title}
            </h4>
            <span className="text-[10px] text-slate-400">PDF Interactive Viewer</span>
          </div>
        </div>

        {/* Page navigation controls */}
        <div className="flex items-center space-x-1.5 bg-slate-950 px-2 py-1 rounded-xl border border-slate-800 text-xs">
          <button
            onClick={handlePrevPage}
            disabled={currentPage <= 1}
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-30 transition"
            title="Previous Page"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-slate-300 font-mono px-1">
            {currentPage} / {numPages || '-'}
          </span>
          <button
            onClick={handleNextPage}
            disabled={!numPages || currentPage >= numPages}
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-30 transition"
            title="Next Page"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Zoom controls */}
        <div className="flex items-center space-x-1 bg-slate-950 px-2 py-1 rounded-xl border border-slate-800 text-xs">
          <button
            onClick={handleZoomOut}
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleResetZoom}
            className="px-1 text-[11px] font-mono text-slate-400 hover:text-white"
            title="Reset Zoom"
          >
            {Math.round(scale * 100)}%
          </button>
          <button
            onClick={handleZoomIn}
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Active Citation Jump & Highlight Banner */}
      {activeCitation && (
        <div className="bg-sky-950/90 border-b border-sky-500/30 p-3 flex items-start justify-between text-xs animate-in slide-in-from-top-2 duration-150 shrink-0 z-10 shadow-lg">
          <div className="flex items-start space-x-2 mr-2">
            <Bookmark className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
            <div>
              <div className="flex items-center space-x-2 font-semibold text-sky-300">
                <span>Jumped to Page {activeCitation.pageNumber}</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-sky-500/20 text-sky-200 border border-sky-500/30">
                  Citation [{activeCitation.sourceIndex || '1'}]
                </span>
                {activeCitation.score && (
                  <span className="text-[10px] text-emerald-400 font-mono">
                    {(activeCitation.score * 100).toFixed(0)}% Match
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-300 font-mono mt-1 line-clamp-2 italic">
                "{activeCitation.snippet || activeCitation.text}"
              </p>
            </div>
          </div>
          <button
            onClick={onClearCitation}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition shrink-0"
            title="Dismiss Highlight Banner"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* PDF Rendering Canvas Container */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto p-4 flex flex-col items-center justify-start bg-slate-950"
      >
        {pdfError ? (
          <div className="h-full flex flex-col items-center justify-center p-6 text-center max-w-sm">
            <AlertCircle className="w-10 h-10 text-rose-400 mb-2" />
            <h5 className="text-sm font-bold text-white mb-1">Could not render PDF</h5>
            <p className="text-xs text-slate-400 mb-4">{pdfError}</p>
            <a
              href={fileUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-sky-400 text-xs font-semibold"
            >
              <span>Open raw PDF in new tab</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        ) : (
          <Document
            file={fileUrl}
            onLoadSuccess={onDocumentLoadSuccess}
            onLoadError={onDocumentLoadError}
            loading={
              <div className="py-20 flex flex-col items-center justify-center space-y-3 text-slate-400">
                <Loader2 className="w-8 h-8 animate-spin text-sky-400" />
                <span className="text-xs">Loading PDF document...</span>
              </div>
            }
            className="shadow-2xl rounded-lg overflow-hidden border border-slate-800"
          >
            <Page
              pageNumber={currentPage}
              scale={scale}
              renderAnnotationLayer={true}
              renderTextLayer={true}
              className="rounded-lg overflow-hidden bg-white"
              loading={
                <div className="w-[500px] h-[700px] bg-slate-900 animate-pulse flex items-center justify-center text-xs text-slate-500">
                  Rendering page {currentPage}...
                </div>
              }
            />
          </Document>
        )}
      </div>
    </div>
  );
}
