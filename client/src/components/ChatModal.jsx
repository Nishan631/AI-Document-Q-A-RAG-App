import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Send,
  Bot,
  User,
  Sparkles,
  BookOpen,
  FileText,
  AlertCircle,
  Loader2,
  Bookmark,
  ChevronRight,
  ShieldCheck,
  Zap,
  Columns,
  MessageSquare,
  SlidersHorizontal,
} from 'lucide-react';
import { api } from '../services/api';
import PdfViewerPane from './PdfViewerPane';

export default function ChatModal({ document, isOpen, onClose }) {
  const [messages, setMessages] = useState([]);
  const [inputQuestion, setInputQuestion] = useState('');
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentStreamTokens, setCurrentStreamTokens] = useState('');
  const [currentStreamSources, setCurrentStreamSources] = useState([]);
  const [currentTopScore, setCurrentTopScore] = useState(null);
  const [wasCached, setWasCached] = useState(false);
  const [searchMode, setSearchMode] = useState('hybrid'); // 'hybrid' | 'vector' | 'keyword'
  const [error, setError] = useState('');

  // PDF Viewer State
  const [targetPage, setTargetPage] = useState(1);
  const [activeCitation, setActiveCitation] = useState(null);
  const [activeTab, setActiveTab] = useState('split'); // 'split' | 'pdf' | 'chat'

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen && document) {
      loadHistory();
      setInputQuestion('');
      setActiveCitation(null);
      setTargetPage(1);
      setError('');
      setWasCached(false);
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen, document]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, currentStreamTokens]);

  const loadHistory = async () => {
    try {
      setLoadingHistory(true);
      const res = await api.getConversations(document._id);
      setMessages(res.messages || []);
    } catch (err) {
      console.error('Failed to load chat history:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleCitationClick = (source) => {
    setActiveCitation(source);
    if (source.pageNumber) {
      setTargetPage(source.pageNumber);
      if (window.innerWidth < 768) {
        setActiveTab('pdf');
      }
    }
  };

  const handleSend = async (questionToSend) => {
    const q = (questionToSend || inputQuestion).trim();
    if (!q || isGenerating) return;

    setError('');
    setInputQuestion('');
    setIsGenerating(true);
    setCurrentStreamTokens('');
    setCurrentStreamSources([]);
    setCurrentTopScore(null);
    setWasCached(false);

    // Optimistic user message
    const tempUserMsg = {
      role: 'user',
      content: q,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);

    let accumulatedAnswer = '';
    let sourcesReceived = [];
    let isHitCache = false;

    await api.askQuestionStream(document._id, q, null, {
      onMeta: (meta) => {
        sourcesReceived = meta.sources || [];
        setCurrentStreamSources(sourcesReceived);
        if (meta.topScore) setCurrentTopScore(meta.topScore);
        if (meta.cached) {
          isHitCache = true;
          setWasCached(true);
        }
        if (sourcesReceived.length > 0) {
          setTargetPage(sourcesReceived[0].pageNumber);
          setActiveCitation(sourcesReceived[0]);
        }
      },
      onToken: (token) => {
        accumulatedAnswer += token;
        setCurrentStreamTokens((prev) => prev + token);
      },
      onDone: (doneEvent) => {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: doneEvent.fullAnswer || accumulatedAnswer,
            sources: sourcesReceived,
            isGrounded: doneEvent.isGrounded !== false,
            cached: doneEvent.cached || isHitCache,
            createdAt: new Date().toISOString(),
          },
        ]);
        setCurrentStreamTokens('');
        setCurrentStreamSources([]);
        setIsGenerating(false);
      },
      onError: (err) => {
        setError(err.message || 'Error generating answer');
        setIsGenerating(false);
      },
    });
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!isOpen || !document) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-1 sm:p-3 bg-black/90 backdrop-blur-md animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full h-[96vh] max-w-[1700px] flex flex-col shadow-2xl overflow-hidden">
        {/* Top Header Bar */}
        <div className="p-3 sm:p-4 border-b border-slate-800 bg-slate-950/80 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3 overflow-hidden">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-sky-500 to-indigo-600 text-white flex items-center justify-center shrink-0 shadow-lg shadow-sky-500/20">
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="overflow-hidden">
              <div className="flex items-center space-x-2">
                <h3 className="text-sm sm:text-base font-bold text-white truncate max-w-sm sm:max-w-md">
                  {document.title}
                </h3>
                <span className="hidden sm:inline-flex items-center space-x-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Hybrid RAG (Vector + BM25)</span>
                </span>
              </div>
              <p className="text-xs text-slate-400 truncate hidden sm:block">
                {document.pageCount} pages &bull; Auto-cached in Redis &bull; Citations jump to PDF page
              </p>
            </div>
          </div>

          {/* View Mode & Retrieval Mode Switcher */}
          <div className="flex items-center space-x-2">
            <div className="hidden lg:flex items-center space-x-1 bg-slate-950 px-2 py-1 rounded-xl border border-slate-800 text-xs">
              <span className="text-slate-500 text-[10px] uppercase font-semibold">Mode:</span>
              <button
                onClick={() => setSearchMode('hybrid')}
                className={`px-2 py-0.5 rounded-lg text-xs font-medium transition ${
                  searchMode === 'hybrid'
                    ? 'bg-sky-500 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Hybrid (RRF)
              </button>
              <button
                onClick={() => setSearchMode('vector')}
                className={`px-2 py-0.5 rounded-lg text-xs font-medium transition ${
                  searchMode === 'vector'
                    ? 'bg-sky-500 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Vector
              </button>
              <button
                onClick={() => setSearchMode('keyword')}
                className={`px-2 py-0.5 rounded-lg text-xs font-medium transition ${
                  searchMode === 'keyword'
                    ? 'bg-sky-500 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Keyword
              </button>
            </div>

            <div className="flex items-center space-x-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
              <button
                onClick={() => setActiveTab('split')}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg transition ${
                  activeTab === 'split'
                    ? 'bg-sky-500 text-white font-semibold shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Side-by-side Dual Pane"
              >
                <Columns className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Split View</span>
              </button>
              <button
                onClick={() => setActiveTab('pdf')}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg transition ${
                  activeTab === 'pdf'
                    ? 'bg-sky-500 text-white font-semibold shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="PDF Only"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>PDF</span>
              </button>
              <button
                onClick={() => setActiveTab('chat')}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg transition ${
                  activeTab === 'chat'
                    ? 'bg-sky-500 text-white font-semibold shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Chat Only"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Chat</span>
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition"
              title="Close Workspace"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Dual-Pane Body */}
        <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
          {/* LEFT PANE: Interactive PDF Viewer */}
          {(activeTab === 'split' || activeTab === 'pdf') && (
            <div
              className={`h-full overflow-hidden ${
                activeTab === 'split' ? 'w-full md:w-1/2 lg:w-[55%]' : 'w-full'
              }`}
            >
              <PdfViewerPane
                fileUrl={document.fileUrl}
                title={document.title}
                targetPage={targetPage}
                activeCitation={activeCitation}
                onClearCitation={() => setActiveCitation(null)}
                onPageChange={(p) => setTargetPage(p)}
              />
            </div>
          )}

          {/* RIGHT PANE: Chat & Grounded Citations */}
          {(activeTab === 'split' || activeTab === 'chat') && (
            <div
              className={`h-full flex flex-col overflow-hidden bg-slate-950/40 ${
                activeTab === 'split' ? 'w-full md:w-1/2 lg:w-[45%]' : 'w-full'
              }`}
            >
              {/* Messages Area */}
              <div className="flex-1 p-4 sm:p-6 overflow-y-auto space-y-6">
                {loadingHistory ? (
                  <div className="h-full flex flex-col items-center justify-center space-y-2 text-slate-400">
                    <Loader2 className="w-6 h-6 animate-spin text-sky-400" />
                    <p className="text-xs">Loading conversation history...</p>
                  </div>
                ) : messages.length === 0 && !isGenerating ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-4">
                    <div className="w-14 h-14 rounded-2xl bg-sky-500/10 text-sky-400 border border-sky-500/20 flex items-center justify-center">
                      <BookOpen className="w-7 h-7" />
                    </div>
                    <div className="max-w-md">
                      <h4 className="text-base font-bold text-white">Hybrid Semantic & Keyword Search</h4>
                      <p className="text-xs text-slate-400 mt-1">
                        Combines dense embeddings with keyword indexing using Reciprocal Rank Fusion. Repeated questions are served in &lt;10ms via Redis caching.
                      </p>
                    </div>

                    {/* Quick questions */}
                    <div className="flex flex-wrap gap-2 justify-center max-w-lg pt-1">
                      {[
                        'What is the refund or return policy?',
                        'Summarize the core requirements.',
                        'What are the key terms in this document?',
                      ].map((sample) => (
                        <button
                          key={sample}
                          onClick={() => handleSend(sample)}
                          className="text-xs px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 transition"
                        >
                          {sample}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <>
                    {messages.map((msg, idx) => (
                      <div
                        key={idx}
                        className={`flex items-start space-x-3 ${
                          msg.role === 'user' ? 'justify-end' : 'justify-start'
                        }`}
                      >
                        {msg.role === 'assistant' && (
                          <div className="w-8 h-8 rounded-xl bg-sky-500/20 text-sky-400 border border-sky-500/30 flex items-center justify-center shrink-0 mt-0.5">
                            <Bot className="w-4 h-4" />
                          </div>
                        )}

                        <div
                          className={`max-w-[88%] rounded-2xl p-4 shadow-sm text-sm leading-relaxed ${
                            msg.role === 'user'
                              ? 'bg-sky-600 text-white font-medium rounded-br-sm'
                              : 'bg-slate-900 border border-slate-800 text-slate-200 rounded-bl-sm'
                          }`}
                        >
                          {/* Cache badge */}
                          {msg.cached && (
                            <div className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-300 border border-amber-500/20 text-[10px] font-semibold mb-2">
                              <Zap className="w-3 h-3 text-amber-400" />
                              <span>Served from Cache (0ms API cost)</span>
                            </div>
                          )}

                          <div className="whitespace-pre-wrap">{msg.content}</div>

                          {/* Grounded Sources with clickable page jumps */}
                          {msg.sources && msg.sources.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-slate-800">
                              <span className="text-[10px] font-semibold uppercase text-slate-400 tracking-wider block mb-1.5 flex items-center space-x-1">
                                <Bookmark className="w-3 h-3 text-sky-400" />
                                <span>Verified Document Citations (Click to jump PDF):</span>
                              </span>
                              <div className="flex flex-wrap gap-1.5">
                                {msg.sources.map((src, sIdx) => {
                                  const isSelected = activeCitation?.chunkId === src.chunkId;
                                  return (
                                    <button
                                      key={sIdx}
                                      onClick={() => handleCitationClick({ ...src, sourceIndex: sIdx + 1 })}
                                      className={`inline-flex items-center space-x-1.5 px-3 py-1 rounded-xl text-xs font-medium transition ${
                                        isSelected
                                          ? 'bg-sky-500 text-white shadow-md shadow-sky-500/30 ring-2 ring-sky-300'
                                          : 'bg-slate-800 hover:bg-slate-700 text-sky-400 border border-slate-700/80'
                                      }`}
                                      title={`Jump PDF to Page ${src.pageNumber}`}
                                    >
                                      <FileText className="w-3 h-3" />
                                      <span>
                                        [{sIdx + 1}] Page {src.pageNumber}
                                      </span>
                                      {src.retrievalType && (
                                        <span className="text-[9px] uppercase px-1 rounded bg-slate-900/60 opacity-80">
                                          {src.retrievalType}
                                        </span>
                                      )}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>

                        {msg.role === 'user' && (
                          <div className="w-8 h-8 rounded-xl bg-slate-800 text-slate-300 flex items-center justify-center shrink-0 mt-0.5">
                            <User className="w-4 h-4" />
                          </div>
                        )}
                      </div>
                    ))}

                    {/* Active Streaming Token Indicator */}
                    {isGenerating && (
                      <div className="flex items-start space-x-3 justify-start animate-in fade-in duration-100">
                        <div className="w-8 h-8 rounded-xl bg-sky-500/20 text-sky-400 border border-sky-500/30 flex items-center justify-center shrink-0 mt-0.5">
                          <Loader2 className="w-4 h-4 animate-spin" />
                        </div>

                        <div className="max-w-[88%] rounded-2xl rounded-bl-sm p-4 bg-slate-900 border border-slate-800 text-slate-200 text-sm leading-relaxed shadow-sm">
                          {currentStreamTokens ? (
                            <div className="whitespace-pre-wrap">
                              {currentStreamTokens}
                              <span className="inline-block w-1.5 h-4 ml-1 bg-sky-400 animate-pulse align-middle" />
                            </div>
                          ) : (
                            <div className="flex items-center space-x-2 text-slate-400 text-xs">
                              <Sparkles className="w-3.5 h-3.5 text-sky-400 animate-spin" />
                              <span>Hybrid searching (vector + keyword) & synthesizing answer...</span>
                            </div>
                          )}

                          {currentStreamSources.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-slate-800">
                              <span className="text-[10px] font-semibold uppercase text-slate-400 tracking-wider block mb-1">
                                Matching Passages Found:
                              </span>
                              <div className="flex flex-wrap gap-1.5">
                                {currentStreamSources.map((s, sIdx) => (
                                  <button
                                    key={sIdx}
                                    onClick={() => handleCitationClick({ ...s, sourceIndex: sIdx + 1 })}
                                    className="text-[11px] px-2.5 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-400 border border-slate-700 cursor-pointer"
                                  >
                                    [{sIdx + 1}] Page {s.pageNumber}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Error Alert */}
              {error && (
                <div className="mx-4 mb-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center space-x-2 shrink-0">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Chat Input Bar */}
              <div className="p-4 border-t border-slate-800 bg-slate-950/90 shrink-0">
                <div className="relative flex items-center">
                  <input
                    ref={inputRef}
                    type="text"
                    value={inputQuestion}
                    onChange={(e) => setInputQuestion(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={`Ask a question about "${document.title}"...`}
                    disabled={isGenerating}
                    className="w-full bg-slate-900 border border-slate-800 focus:border-sky-500 rounded-2xl pl-4 pr-12 py-3.5 text-sm text-white placeholder-slate-500 focus:outline-none transition shadow-inner"
                  />
                  <button
                    onClick={() => handleSend()}
                    disabled={!inputQuestion.trim() || isGenerating}
                    className="absolute right-2 p-2 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-40 disabled:hover:bg-sky-500 text-white transition shadow-md shadow-sky-500/20"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-500 mt-2 px-1">
                  <span>Press Enter to send</span>
                  <span className="flex items-center space-x-1 text-sky-400/80">
                    <Zap className="w-3 h-3 text-amber-400" />
                    <span>Rate-limited &amp; Redis cached</span>
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
