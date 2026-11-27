import React, { useState, useEffect, useRef } from 'react';
import Navbar from './components/Navbar';
import AuthModal from './components/AuthModal';
import UploadSection from './components/UploadSection';
import DocumentList from './components/DocumentList';
import PagesViewerModal from './components/PagesViewerModal';
import ChatModal from './components/ChatModal';
import { api } from './services/api';
import { Database, Sparkles, CheckCircle2, FileCheck, ArrowRight, Cpu, Layers } from 'lucide-react';

export default function App() {
  const [user, setUser] = useState(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [inspectingDocId, setInspectingDocId] = useState(null);
  const [activeChatDoc, setActiveChatDoc] = useState(null);

  const pollingRef = useRef(null);

  useEffect(() => {
    const token = localStorage.getItem('docu_token');
    if (token) {
      api
        .getMe()
        .then((res) => {
          setUser(res.user);
          loadDocuments();
        })
        .catch(() => {
          localStorage.removeItem('docu_token');
          setUser(null);
        })
        .finally(() => setLoadingUser(false));
    } else {
      setLoadingUser(false);
    }
  }, []);

  // Poll for status updates if any document is processing
  useEffect(() => {
    const hasProcessing = documents.some((d) => d.status === 'processing');
    if (hasProcessing) {
      pollingRef.current = setInterval(() => {
        loadDocuments(true);
      }, 3000);
    } else {
      if (pollingRef.current) clearInterval(pollingRef.current);
    }
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [documents]);

  const loadDocuments = async (isSilent = false) => {
    try {
      if (!isSilent) setLoadingDocs(true);
      const res = await api.getDocuments();
      setDocuments(res.documents || []);
    } catch (err) {
      console.error('Failed to load documents:', err);
    } finally {
      if (!isSilent) setLoadingDocs(false);
    }
  };

  const handleAuthSuccess = (authenticatedUser) => {
    setUser(authenticatedUser);
    loadDocuments();
  };

  const handleLogout = () => {
    localStorage.removeItem('docu_token');
    setUser(null);
    setDocuments([]);
    setActiveChatDoc(null);
  };

  const handleUploadSuccess = () => {
    loadDocuments();
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <Navbar
        user={user}
        onOpenAuth={() => setIsAuthOpen(true)}
        onLogout={handleLogout}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Phase 2 Architecture Banner */}
        <section className="bg-gradient-to-r from-sky-950/70 via-slate-900 to-indigo-950/70 border border-sky-500/20 rounded-3xl p-6 sm:p-8 relative overflow-hidden shadow-2xl">
          <div className="relative z-10 max-w-3xl">
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-semibold uppercase tracking-wider mb-3">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Phase 2 Live &bull; Core RAG Pipeline Active</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              AI Document Q&A (RAG) Platform
            </h1>
            <p className="mt-2 text-sm sm:text-base text-slate-300 leading-relaxed">
              Upload any document. It is parsed, chunked with sliding token overlap, embedded into 768-dimensional vectors, and indexed in MongoDB Atlas. Ask questions with real-time SSE streaming and strict factual citations.
            </p>

            <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="flex items-center space-x-2.5 p-3 rounded-2xl bg-slate-900/80 border border-slate-800">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="text-slate-200">Sliding Window Chunking (~600 words)</span>
              </div>
              <div className="flex items-center space-x-2.5 p-3 rounded-2xl bg-slate-900/80 border border-slate-800">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="text-slate-200">Atlas Vector Search & Fallback Engine</span>
              </div>
              <div className="flex items-center space-x-2.5 p-3 rounded-2xl bg-slate-900/80 border border-slate-800">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="text-slate-200">SSE Streaming & Grounded Citations</span>
              </div>
            </div>
          </div>
        </section>

        {/* Auth Guard or Ingestion Dashboard */}
        {!user ? (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-10 text-center max-w-xl mx-auto my-12 shadow-xl">
            <div className="w-16 h-16 rounded-3xl bg-sky-500/10 text-sky-400 mx-auto flex items-center justify-center mb-4">
              <Database className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Sign in to Start Asking Questions</h2>
            <p className="text-sm text-slate-400 mb-6">
              Create an account or log in to upload documents, vectorize them in Atlas, and ask questions with live streaming citations.
            </p>
            <button
              onClick={() => setIsAuthOpen(true)}
              className="inline-flex items-center space-x-2 px-6 py-3 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-semibold text-sm transition shadow-lg shadow-sky-500/20"
            >
              <span>Get Started</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="space-y-8 animate-in fade-in duration-200">
            {/* Upload PDF Section */}
            <UploadSection onUploadSuccess={handleUploadSuccess} />

            {/* Ingested Documents List */}
            <DocumentList
              documents={documents}
              onRefresh={() => loadDocuments()}
              onInspectPages={(id) => setInspectingDocId(id)}
              onOpenChat={(doc) => setActiveChatDoc(doc)}
            />
          </div>
        )}
      </main>

      {/* Pages Inspector Modal */}
      <PagesViewerModal
        documentId={inspectingDocId}
        onClose={() => setInspectingDocId(null)}
      />

      {/* RAG Chat & Q&A Modal */}
      <ChatModal
        document={activeChatDoc}
        isOpen={Boolean(activeChatDoc)}
        onClose={() => setActiveChatDoc(null)}
      />

      {/* Auth Modal */}
      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onAuthSuccess={handleAuthSuccess}
      />

      {/* Footer */}
      <footer className="border-t border-slate-800 py-6 text-center text-xs text-slate-500">
        AI Document Q&A (RAG) Platform &bull; Built with MERN, PDF.js, and Atlas Vector Search
      </footer>
    </div>
  );
}
