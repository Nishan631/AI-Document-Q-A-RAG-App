import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import AuthModal from './components/AuthModal';
import UploadSection from './components/UploadSection';
import DocumentList from './components/DocumentList';
import PagesViewerModal from './components/PagesViewerModal';
import { api } from './services/api';
import { Layers, Database, Cpu, CheckCircle2, FileCheck, ArrowRight } from 'lucide-react';

export default function App() {
  const [user, setUser] = useState(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [inspectingDocId, setInspectingDocId] = useState(null);

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

  const loadDocuments = async () => {
    try {
      setLoadingDocs(true);
      const res = await api.getDocuments();
      setDocuments(res.documents || []);
    } catch (err) {
      console.error('Failed to load documents:', err);
    } finally {
      setLoadingDocs(false);
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
        {/* Phase 1 Overview Banner */}
        <section className="bg-gradient-to-r from-sky-950/60 via-slate-900 to-indigo-950/60 border border-sky-500/20 rounded-3xl p-6 sm:p-8 relative overflow-hidden shadow-2xl">
          <div className="relative z-10 max-w-3xl">
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20 text-xs font-semibold uppercase tracking-wider mb-3">
              <FileCheck className="w-3.5 h-3.5" />
              <span>Phase 1 Completed & Active</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              AI Document Q&A (RAG) Architecture
            </h1>
            <p className="mt-2 text-sm sm:text-base text-slate-300 leading-relaxed">
              Upload any PDF (research paper, policy, or syllabus). The system extracts and indexes text <strong>per-page</strong> with exact page tracking to prepare for semantic chunking, vector search, and grounded citations.
            </p>

            <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="flex items-center space-x-2.5 p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="text-slate-200">JWT Auth & Multi-Tenant Isolation</span>
              </div>
              <div className="flex items-center space-x-2.5 p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="text-slate-200">Mozilla PDF.js Page-by-Page Extraction</span>
              </div>
              <div className="flex items-center space-x-2.5 p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="text-slate-200">Scanned PDF Detection & Verification UI</span>
              </div>
            </div>
          </div>
        </section>

        {/* Auth Guard or Content */}
        {!user ? (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-10 text-center max-w-xl mx-auto my-12 shadow-xl">
            <div className="w-16 h-16 rounded-2xl bg-sky-500/10 text-sky-400 mx-auto flex items-center justify-center mb-4">
              <Database className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Sign in to start Phase 1 Ingestion</h2>
            <p className="text-sm text-slate-400 mb-6">
              Create an account or log in with your credentials to upload and inspect your documents.
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
            {/* Upload Component */}
            <UploadSection onUploadSuccess={handleUploadSuccess} />

            {/* Ingested Documents List */}
            <DocumentList
              documents={documents}
              onRefresh={loadDocuments}
              onInspectPages={(id) => setInspectingDocId(id)}
            />
          </div>
        )}
      </main>

      {/* Pages Inspector Modal */}
      <PagesViewerModal
        documentId={inspectingDocId}
        onClose={() => setInspectingDocId(null)}
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
