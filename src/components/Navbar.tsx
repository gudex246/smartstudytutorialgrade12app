import React, { useState, useEffect } from 'react';
import {
  BookOpen,
  Video,
  FileText,
  Bot,
  ShieldAlert,
  Sparkles,
  User as UserIcon,
  Wifi,
  WifiOff,
  Download,
  CreditCard,
  Layers,
  ChevronDown,
  LogOut
} from 'lucide-react';
import { User } from '../types';
import { ADMIN_EMAIL, INITIAL_STUDENT_USER } from '../data/initialData';

interface NavbarProps {
  activeTab: 'questions' | 'videos' | 'notes' | 'ai-tutor' | 'admin' | 'subscription' | 'profile';
  setActiveTab: (tab: 'questions' | 'videos' | 'notes' | 'ai-tutor' | 'admin' | 'subscription' | 'profile') => void;
  currentUser: User;
  onOpenAuthModal: () => void;
  onOpenSubscriptionModal: () => void;
  onOpenInstallModal: () => void;
  onSignOut: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  currentUser,
  onOpenAuthModal,
  onOpenSubscriptionModal,
  onOpenInstallModal,
  onSignOut
}) => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const user = currentUser || INITIAL_STUDENT_USER;
  const isAdmin = Boolean(user.email && user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase());
  const hasActiveSub = isAdmin || user.subscription?.status === 'active';

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 text-slate-100">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-2 sm:gap-4">
          
          {/* Logo & Brand */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setActiveTab(isAdmin ? 'admin' : 'questions')}
              className="flex items-center gap-2.5 text-left group cursor-pointer"
            >
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-md shadow-indigo-600/30 group-hover:scale-105 transition-transform">
                <BookOpen className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-display font-extrabold text-base sm:text-lg text-white tracking-tight">
                    Smart Study
                  </span>
                  <span className="text-[10px] uppercase font-bold tracking-widest px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                    PWA
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 font-medium hidden sm:block">Tutorial & Practice Portal</p>
              </div>
            </button>
          </div>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center gap-1 bg-slate-950/50 p-1 rounded-xl border border-slate-800">
            <button
              id="nav-questions"
              onClick={() => setActiveTab('questions')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'questions'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Questions</span>
            </button>

            <button
              id="nav-videos"
              onClick={() => setActiveTab('videos')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'videos'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Video className="w-3.5 h-3.5" />
              <span>Videos</span>
            </button>

            <button
              id="nav-notes"
              onClick={() => setActiveTab('notes')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'notes'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Notes</span>
            </button>

            <button
              id="nav-ai-tutor"
              onClick={() => setActiveTab('ai-tutor')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'ai-tutor'
                  ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Bot className="w-3.5 h-3.5 text-violet-300" />
              <span>AI Tutor</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            </button>

            {/* Admin Dashboard Tab (Admin only) */}
            {isAdmin && (
              <button
                id="nav-admin"
                onClick={() => setActiveTab('admin')}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'admin'
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                    : 'text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 border border-amber-500/20'
                }`}
              >
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>Admin Panel</span>
                <span className="text-[9px] bg-amber-400/30 text-amber-200 px-1.5 py-0.2 rounded font-bold">
                  ADMIN
                </span>
              </button>
            )}
          </nav>

          {/* Right Action Bar */}
          <div className="flex items-center gap-2 sm:gap-3">
            
            {/* Online / Offline status indicator */}
            <div
              className={`hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-medium border ${
                isOnline
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                  : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
              }`}
              title={isOnline ? 'Online - Full features active' : 'Offline - PWA cached materials accessible'}
            >
              {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
              <span>{isOnline ? 'Online' : 'Offline'}</span>
            </div>

            {/* Install PWA Button with Badge & Questions trigger */}
            <button
              id="header-install-app-btn"
              onClick={onOpenInstallModal}
              className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600/25 hover:bg-indigo-600/40 text-indigo-200 border border-indigo-500/40 transition-all cursor-pointer shadow-xs"
              title="Install App & View Questions"
            >
              <Download className="w-3.5 h-3.5 text-indigo-400" />
              <span className="hidden sm:inline">Install App</span>
              <span className="sm:hidden">Install</span>
              <span className="text-[9px] bg-indigo-500 text-white font-black px-1 rounded-xs">
                PWA
              </span>
            </button>

            {/* Subscription Button (for Students) */}
            {!isAdmin && (
              <button
                id="header-subscription-btn"
                onClick={onOpenSubscriptionModal}
                className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  hasActiveSub
                    ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/25'
                    : 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20 animate-pulse'
                }`}
              >
                <CreditCard className="w-3.5 h-3.5" />
                <span className="hidden xs:inline">
                  {hasActiveSub ? 'Pro Active' : 'Subscribe'}
                </span>
                {!hasActiveSub && (
                  <span className="text-[10px] px-1 rounded bg-slate-950/20 text-slate-900 font-extrabold ml-0.5">
                    FEE
                  </span>
                )}
              </button>
            )}

            {/* User Account / Role Switcher Profile */}
            <button
              id="user-account-btn"
              onClick={onOpenAuthModal}
              className="flex items-center gap-2 p-1 sm:px-2.5 sm:py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 transition-all text-left group"
            >
              <div className="relative">
                <img
                  src={currentUser.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80'}
                  alt={currentUser.name}
                  className="w-7 h-7 rounded-lg object-cover border border-slate-600"
                />
                {isAdmin && (
                  <span className="absolute -top-1 -right-1 w-3 h-3 bg-amber-500 rounded-full border-2 border-slate-900"></span>
                )}
              </div>
              
              <div className="hidden lg:block">
                <div className="flex items-center gap-1.5">
                  <p className="text-xs font-semibold text-white max-w-[120px] truncate">
                    {currentUser.name}
                  </p>
                  {isAdmin && (
                    <span className="text-[9px] px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 font-bold border border-amber-500/40">
                      ADMIN
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-slate-400 truncate max-w-[120px]">
                  {currentUser.email}
                </p>
              </div>

              <ChevronDown className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-200 ml-0.5 hidden sm:block" />
            </button>

            {/* Sign Out Button */}
            <button
              id="header-signout-btn"
              onClick={onSignOut}
              className="flex items-center gap-1 px-2 sm:px-2.5 py-1.5 rounded-xl bg-slate-800/80 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 border border-slate-700/80 hover:border-rose-500/30 transition-all cursor-pointer text-xs"
              title="Sign Out"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline font-medium">Sign Out</span>
            </button>
          </div>
        </div>

        {/* Mobile Top Sub-Navigation Bar */}
        <div className="flex md:hidden items-center justify-around py-1.5 border-t border-slate-800/80 text-[11px] font-medium gap-1">
          <button
            type="button"
            onClick={() => setActiveTab('questions')}
            className={`flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-xl transition-all cursor-pointer touch-manipulation active:scale-95 flex-1 ${
              activeTab === 'questions'
                ? 'bg-indigo-600 text-white font-bold shadow-md shadow-indigo-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Questions</span>
          </button>
          
          <button
            type="button"
            onClick={() => setActiveTab('videos')}
            className={`flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-xl transition-all cursor-pointer touch-manipulation active:scale-95 flex-1 ${
              activeTab === 'videos'
                ? 'bg-indigo-600 text-white font-bold shadow-md shadow-indigo-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Video className="w-3.5 h-3.5" />
            <span>Videos</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('notes')}
            className={`flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-xl transition-all cursor-pointer touch-manipulation active:scale-95 flex-1 ${
              activeTab === 'notes'
                ? 'bg-indigo-600 text-white font-bold shadow-md shadow-indigo-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Notes</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('ai-tutor')}
            className={`flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-xl transition-all cursor-pointer touch-manipulation active:scale-95 flex-1 ${
              activeTab === 'ai-tutor'
                ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-bold shadow-md shadow-violet-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Bot className="w-3.5 h-3.5" />
            <span>AI Tutor</span>
          </button>

          {isAdmin && (
            <button
              type="button"
              onClick={() => setActiveTab('admin')}
              className={`flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-xl transition-all cursor-pointer touch-manipulation active:scale-95 flex-1 ${
                activeTab === 'admin'
                  ? 'bg-amber-500 text-slate-950 font-black shadow-md shadow-amber-500/30'
                  : 'text-amber-400 hover:text-amber-300 hover:bg-amber-500/10'
              }`}
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Admin</span>
            </button>
          )}
        </div>
      </div>

      {/* Mobile Fixed Bottom Navigation Bar (Persistent Thumb-Friendly Access) */}
      <nav
        aria-label="Mobile Navigation"
        className="fixed bottom-0 inset-x-0 z-40 md:hidden bg-slate-900/95 backdrop-blur-xl border-t border-slate-800/90 shadow-2xl py-1.5 px-2 pb-[calc(0.4rem+env(safe-area-inset-bottom,0px))]"
      >
        <div className="flex items-center justify-around gap-1 max-w-md mx-auto">
          <button
            type="button"
            id="mobile-bottom-nav-questions"
            onClick={() => setActiveTab('questions')}
            className={`flex flex-col items-center justify-center py-1.5 px-2 rounded-xl transition-all flex-1 cursor-pointer touch-manipulation active:scale-95 ${
              activeTab === 'questions'
                ? 'bg-indigo-600 text-white font-bold shadow-lg shadow-indigo-600/30 ring-1 ring-indigo-400'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Layers className={`w-4 h-4 ${activeTab === 'questions' ? 'text-white' : 'text-slate-400'}`} />
            <span className="text-[10px] mt-0.5">Questions</span>
          </button>

          <button
            type="button"
            id="mobile-bottom-nav-videos"
            onClick={() => setActiveTab('videos')}
            className={`flex flex-col items-center justify-center py-1.5 px-2 rounded-xl transition-all flex-1 cursor-pointer touch-manipulation active:scale-95 ${
              activeTab === 'videos'
                ? 'bg-indigo-600 text-white font-bold shadow-lg shadow-indigo-600/30 ring-1 ring-indigo-400'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Video className={`w-4 h-4 ${activeTab === 'videos' ? 'text-white' : 'text-slate-400'}`} />
            <span className="text-[10px] mt-0.5">Videos</span>
          </button>

          <button
            type="button"
            id="mobile-bottom-nav-notes"
            onClick={() => setActiveTab('notes')}
            className={`flex flex-col items-center justify-center py-1.5 px-2 rounded-xl transition-all flex-1 cursor-pointer touch-manipulation active:scale-95 ${
              activeTab === 'notes'
                ? 'bg-indigo-600 text-white font-bold shadow-lg shadow-indigo-600/30 ring-1 ring-indigo-400'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <FileText className={`w-4 h-4 ${activeTab === 'notes' ? 'text-white' : 'text-slate-400'}`} />
            <span className="text-[10px] mt-0.5">Notes</span>
          </button>

          <button
            type="button"
            id="mobile-bottom-nav-ai"
            onClick={() => setActiveTab('ai-tutor')}
            className={`flex flex-col items-center justify-center py-1.5 px-2 rounded-xl transition-all flex-1 cursor-pointer touch-manipulation active:scale-95 ${
              activeTab === 'ai-tutor'
                ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-bold shadow-lg shadow-violet-600/30 ring-1 ring-violet-400'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Bot className={`w-4 h-4 ${activeTab === 'ai-tutor' ? 'text-white' : 'text-violet-400'}`} />
            <span className="text-[10px] mt-0.5">AI Tutor</span>
          </button>

          {isAdmin && (
            <button
              type="button"
              id="mobile-bottom-nav-admin"
              onClick={() => setActiveTab('admin')}
              className={`flex flex-col items-center justify-center py-1.5 px-2 rounded-xl transition-all flex-1 cursor-pointer touch-manipulation active:scale-95 ${
                activeTab === 'admin'
                  ? 'bg-amber-500 text-slate-950 font-black shadow-lg shadow-amber-500/30 ring-1 ring-amber-300'
                  : 'text-amber-400 hover:text-amber-300 hover:bg-amber-500/10'
              }`}
            >
              <ShieldAlert className="w-4 h-4" />
              <span className="text-[10px] mt-0.5">Admin</span>
            </button>
          )}
        </div>
      </nav>
    </header>
  );
};
