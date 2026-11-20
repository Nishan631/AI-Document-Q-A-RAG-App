import React, { useState } from 'react';
import { FileText, Eye, Trash2, Calendar, FileBox, AlertCircle, CheckCircle, Clock, MessageSquare } from 'lucide-react';
import { api } from '../services/api';

export default function DocumentList({ documents, onRefresh, onInspectPages }) {
  const [deletingId, setDeletingId] = useState(null);

  const handleDelete = async (id, title) => {
    if (!window.confirm(`Are you sure you want to delete "${title}"?`)) return;
    try {
      setDeletingId(id);
      await api.deleteDocument(id);
      onRefresh();
    } catch (err) {
      alert(err.message || 'Failed to delete document');
    } finally {
      setDeletingId(null);
    }
  };

  if (!documents || documents.length === 0) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center">
        <div className="w-16 h-16 rounded-2xl bg-slate-800/80 mx-auto flex items-center justify-center text-slate-500 mb-4">
          <FileBox className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-bold text-white mb-1">No documents uploaded yet</h3>
        <p className="text-sm text-slate-400 max-w-sm mx-auto">
          Upload your first PDF above. The system will extract text page-by-page ready for RAG vectorization.
        </p>
      </div>
    );
  }

  const getStatusBadge = (status) => {
    switch (status) {
      case 'ready':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle className="w-3 h-3" />
            <span>Ready</span>
          </span>
        );
      case 'processing':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Clock className="w-3 h-3 animate-spin" />
            <span>Processing</span>
          </span>
        );
      case 'failed':
      default:
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <AlertCircle className="w-3 h-3" />
            <span>Failed</span>
          </span>
        );
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-white tracking-tight">
          My Ingested Documents ({documents.length})
        </h3>
        <button
          onClick={onRefresh}
          className="text-xs text-sky-400 hover:text-sky-300 font-medium"
        >
          Refresh List
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {documents.map((doc) => (
          <div
            key={doc._id}
            className="bg-slate-900 border border-slate-800 hover:border-slate-700/80 rounded-2xl p-5 flex flex-col justify-between transition shadow-md group"
          >
            <div>
              <div className="flex items-start justify-between space-x-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20 flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5" />
                </div>
                <div>{getStatusBadge(doc.status)}</div>
              </div>

              <h4 className="text-base font-semibold text-white tracking-tight line-clamp-1 mb-1" title={doc.title}>
                {doc.title}
              </h4>
              <p className="text-xs text-slate-400 truncate mb-4" title={doc.fileName}>
                {doc.fileName}
              </p>

              <div className="grid grid-cols-2 gap-2 text-xs text-slate-400 py-3 border-t border-b border-slate-800/80 mb-4">
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase font-semibold">Pages</span>
                  <span className="text-slate-200 font-medium">{doc.pageCount} pages</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase font-semibold">Size</span>
                  <span className="text-slate-200 font-medium">
                    {(doc.fileSize / (1024 * 1024)).toFixed(2)} MB
                  </span>
                </div>
              </div>

              {doc.errorMessage && (
                <div className="mb-4 p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
                  {doc.errorMessage}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                onClick={() => onInspectPages(doc._id)}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-sky-400 transition"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Inspect Pages</span>
              </button>

              <button
                disabled={deletingId === doc._id}
                onClick={() => handleDelete(doc._id, doc.title)}
                className="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition disabled:opacity-50"
                title="Delete Document"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
