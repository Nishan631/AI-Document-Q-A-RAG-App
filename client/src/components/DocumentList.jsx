import React, { useState } from 'react';
import {
  FileText,
  Eye,
  Trash2,
  AlertCircle,
  CheckCircle,
  Clock,
  MessageSquare,
  Sparkles,
  RefreshCw,
  Columns,
  Cpu,
} from 'lucide-react';
import { api } from '../services/api';

export default function DocumentList({
  documents,
  onRefresh,
  onInspectPages,
  onOpenChat,
}) {
  const [deletingId, setDeletingId] = useState(null);
  const [reindexingId, setReindexingId] = useState(null);

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

  const handleReindex = async (id) => {
    try {
      setReindexingId(id);
      await api.reindexDocument(id);
      onRefresh();
    } catch (err) {
      alert(err.message || 'Failed to reindex document');
    } finally {
      setReindexingId(null);
    }
  };

  if (!documents || documents.length === 0) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-12 text-center">
        <div className="w-16 h-16 rounded-3xl bg-slate-800/80 mx-auto flex items-center justify-center text-slate-500 mb-4">
          <FileText className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-bold text-white mb-1">No documents uploaded yet</h3>
        <p className="text-sm text-slate-400 max-w-sm mx-auto">
          Upload your first PDF above. The system will chunk and vectorize it in MongoDB Atlas, ready for instant Q&A.
        </p>
      </div>
    );
  }

  const getStatusBadge = (doc) => {
    switch (doc.status) {
      case 'ready':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle className="w-3 h-3" />
            <span>Ready for Q&A</span>
          </span>
        );
      case 'processing':
        return (
          <span className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Clock className="w-3 h-3 animate-spin" />
            <span>{doc.ingestionProgress ? `${doc.ingestionProgress}%` : 'Ingesting...'}</span>
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
        <h3 className="text-lg font-bold text-white tracking-tight flex items-center space-x-2">
          <span>My Ingested Documents</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400">
            {documents.length}
          </span>
        </h3>
        <button
          onClick={onRefresh}
          className="text-xs text-sky-400 hover:text-sky-300 font-medium flex items-center space-x-1"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {documents.map((doc) => {
          const isReady = doc.status === 'ready';
          const isProcessing = doc.status === 'processing';
          const isFailed = doc.status === 'failed';

          return (
            <div
              key={doc._id}
              className="bg-slate-900 border border-slate-800 hover:border-slate-700/80 rounded-3xl p-5 flex flex-col justify-between transition shadow-md group relative overflow-hidden"
            >
              <div>
                <div className="flex items-start justify-between space-x-3 mb-3">
                  <div className="w-10 h-10 rounded-2xl bg-sky-500/10 text-sky-400 border border-sky-500/20 flex items-center justify-center shrink-0">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>{getStatusBadge(doc)}</div>
                </div>

                <h4
                  className="text-base font-semibold text-white tracking-tight line-clamp-1 mb-1"
                  title={doc.title}
                >
                  {doc.title}
                </h4>
                <p className="text-xs text-slate-400 truncate mb-3" title={doc.fileName}>
                  {doc.fileName}
                </p>

                {/* Live Progress Bar for Ingesting Documents */}
                {isProcessing && (
                  <div className="my-3 p-3 rounded-2xl bg-slate-950/80 border border-amber-500/20 space-y-1.5 animate-pulse">
                    <div className="flex items-center justify-between text-[11px] text-amber-300">
                      <span className="truncate max-w-[200px]">
                        {doc.ingestionStep || 'Vectorizing in MongoDB Atlas...'}
                      </span>
                      <span className="font-mono">{doc.ingestionProgress || 15}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-amber-400 to-sky-500 transition-all duration-300"
                        style={{ width: `${doc.ingestionProgress || 15}%` }}
                      />
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2 text-xs text-slate-400 py-3 border-t border-b border-slate-800/80 mb-4">
                  <div>
                    <span className="text-slate-500 block text-[10px] uppercase font-semibold">
                      Pages
                    </span>
                    <span className="text-slate-200 font-medium">{doc.pageCount || '-'} pages</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px] uppercase font-semibold">
                      Size
                    </span>
                    <span className="text-slate-200 font-medium">
                      {(doc.fileSize / (1024 * 1024)).toFixed(2)} MB
                    </span>
                  </div>
                </div>

                {doc.errorMessage && (
                  <div className="mb-4 p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
                    {doc.errorMessage}
                  </div>
                )}
              </div>

              <div className="pt-2 flex items-center justify-between space-x-2">
                <div className="flex items-center space-x-2">
                  {isReady && (
                    <button
                      onClick={() => onOpenChat(doc)}
                      className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-sky-500 hover:bg-sky-400 text-white transition shadow-lg shadow-sky-500/20"
                    >
                      <Columns className="w-3.5 h-3.5" />
                      <span>Split View Q&A</span>
                    </button>
                  )}

                  {isFailed && (
                    <button
                      disabled={reindexingId === doc._id}
                      onClick={() => handleReindex(doc._id)}
                      className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border border-amber-500/30 transition"
                    >
                      <RefreshCw
                        className={`w-3.5 h-3.5 ${reindexingId === doc._id ? 'animate-spin' : ''}`}
                      />
                      <span>Retry</span>
                    </button>
                  )}

                  <button
                    onClick={() => onInspectPages(doc._id)}
                    className="flex items-center space-x-1 px-3 py-2 rounded-xl text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
                    title="View Extracted Pages"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Pages</span>
                  </button>
                </div>

                <button
                  disabled={deletingId === doc._id}
                  onClick={() => handleDelete(doc._id, doc.title)}
                  className="p-2 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition disabled:opacity-50"
                  title="Delete Document"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
