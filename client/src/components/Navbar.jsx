import React from 'react';
import { BookOpen, User as UserIcon, LogOut, Sparkles } from 'lucide-react';

export default function Navbar({ user, onOpenAuth, onLogout }) {
  return (
    <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-sky-500/20">
            <BookOpen className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-bold text-lg tracking-tight text-white">DocuRAG</span>
              <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20">
                Phase 1 Active
              </span>
            </div>
            <p className="text-xs text-slate-400 hidden sm:block">AI-Powered Document Ingestion & Q&A</p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          {user ? (
            <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-sm">
                <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
                <span className="text-slate-300 font-medium">{user.email}</span>
              </div>
              <button
                onClick={onLogout}
                className="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-900 border border-transparent hover:border-slate-800 transition"
                title="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={onOpenAuth}
              className="flex items-center space-x-2 px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-white font-medium text-sm transition shadow-lg shadow-sky-500/20"
            >
              <UserIcon className="w-4 h-4" />
              <span>Sign In / Register</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
