import React, { useState, useEffect } from 'react';
import { X, ChevronLeft, ChevronRight, Search, FileText, Loader2, AlertCircle } from 'lucide-react';
import { api } from '../services/api';

export default function PagesViewerModal({ documentId, onClose }) {
  const [loading, setLoading] = useState(true);
  const [docData, setDocData] = useState(null);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let isMounted = true;
    async function fetchPages() {
      try {
        setLoading(true);
        const data = await api.getDocumentPages(documentId);
        if (isMounted) {
          setDocData(data);
          setCurrentPageIndex(0);
        }
      } catch (err) {
        if (isMounted) setError(err.message || 'Failed to load document pages');
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    if (documentId) {
      fetchPages();
    }
    return () => {
      isMounted = false;
    };
  }, [documentId]);

  if (!documentId) return null;

  const pages = docData?.pages || [];
  const currentPage = pages[currentPageIndex];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between shrink-0 bg-slate-950/40">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20 flex items-center justify-center">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white truncate max-w-md">
                {docData?.title || 'Extracted Pages'}
              </h3>
              <p className="text-xs text-slate-400">
                {pages.length} total pages parsed & verified
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content body */}
        <div className="flex-1 overflow-hidden flex flex-col sm:flex-row">
          {loading ? (
            <div className="flex-1 flex flex-col items-center justify-center space-y-3">
              <Loader2 className="w-8 h-8 animate-spin text-sky-400" />
              <p className="text-sm text-slate-400">Loading extracted pages...</p>
            </div>
          ) : error ? (
            <div className="flex-1 p-6 flex flex-col items-center justify-center text-center">
              <AlertCircle className="w-10 h-10 text-rose-400 mb-2" />
              <p className="text-sm text-rose-300">{error}</p>
            </div>
          ) : pages.length === 0 ? (
            <div className="flex-1 p-6 flex flex-col items-center justify-center text-center">
              <p className="text-sm text-slate-400">No text content found for this document.</p>
            </div>
          ) : (
            <>
              {/* Sidebar: Page List */}
              <div className="w-full sm:w-64 border-b sm:border-b-0 sm:border-r border-slate-800 bg-slate-950/60 p-3 overflow-y-auto max-h-48 sm:max-h-none shrink-0 space-y-1">
                <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-2 py-1 mb-1">
                  Pages ({pages.length})
                </div>
                {pages.map((p, idx) => (
                  <button
                    key={p.pageNumber}
                    onClick={() => setCurrentPageIndex(idx)}
                    className={`w-full text-left px-3 py-2 rounded-xl text-xs transition flex items-center justify-between ${
                      currentPageIndex === idx
                        ? 'bg-sky-500 text-white font-semibold shadow-md shadow-sky-500/20'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                    }`}
                  >
                    <span>Page {p.pageNumber}</span>
                    <span className="text-[10px] opacity-75">{p.text.length} chars</span>
                  </button>
                ))}
              </div>

              {/* Page Text Viewer */}
              <div className="flex-1 flex flex-col overflow-hidden bg-slate-950/20">
                {/* Page Navigation Toolbar */}
                <div className="p-3 border-b border-slate-800/80 flex items-center justify-between shrink-0 bg-slate-900/40">
                  <div className="flex items-center space-x-2">
                    <button
                      disabled={currentPageIndex === 0}
                      onClick={() => setCurrentPageIndex((prev) => Math.max(0, prev - 1))}
                      className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-40 transition"
                      title="Previous Page"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="text-xs font-semibold text-slate-200">
                      Page {currentPage?.pageNumber} of {pages.length}
                    </span>
                    <button
                      disabled={currentPageIndex === pages.length - 1}
                      onClick={() => setCurrentPageIndex((prev) => Math.min(pages.length - 1, prev + 1))}
                      className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-40 transition"
                      title="Next Page"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="text-[11px] text-slate-400">
                    Characters on this page: <strong className="text-sky-400">{currentPage?.text.length || 0}</strong>
                  </div>
                </div>

                {/* Text View Area */}
                <div className="flex-1 p-5 overflow-y-auto">
                  <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-5 font-mono text-xs text-slate-200 leading-relaxed whitespace-pre-wrap select-text">
                    {currentPage?.text || (
                      <span className="text-slate-500 italic">No text content detected on this page.</span>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
