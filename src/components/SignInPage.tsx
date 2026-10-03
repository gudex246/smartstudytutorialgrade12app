import React, { useState } from 'react';
import {
  BookOpen,
  Mail,
  User as UserIcon,
  ArrowRight,
  AlertCircle,
  Download,
  Smartphone,
  HelpCircle,
  Share2,
  Lock,
  Layers
} from 'lucide-react';
import { User } from '../types';
import { authenticateUser } from '../utils/storage';
import { ADMIN_EMAIL } from '../data/constants';

interface SignInPageProps {
  onSignInSuccess: (user: User) => void;
  deferredPrompt?: any;
  onOpenInstallModal?: () => void;
  isStandalone?: boolean;
}

export const SignInPage: React.FC<SignInPageProps> = ({
  onSignInSuccess,
  deferredPrompt,
  onOpenInstallModal,
  isStandalone = false
}) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [stream, setStream] = useState<'Natural Science' | 'Social Science'>('Natural Science');
  const [errorMsg, setErrorMsg] = useState('');
  const [isInstalling, setIsInstalling] = useState(false);
  const [showIOSHint, setShowIOSHint] = useState(false);

  const isIOS = typeof window !== 'undefined' && /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase());

  const handleInstallClick = async () => {
    const promptEvent = deferredPrompt || (typeof window !== 'undefined' ? (window as any).__pwaInstallPrompt : null);

    if (promptEvent && typeof promptEvent.prompt === 'function') {
      setIsInstalling(true);
      try {
        await promptEvent.prompt();
        const choice = await promptEvent.userChoice;
        if (choice.outcome === 'accepted') {
          // Installed
        }
      } catch (err) {
        console.error('Install prompt error:', err);
        if (onOpenInstallModal) onOpenInstallModal();
      } finally {
        setIsInstalling(false);
      }
    } else if (isIOS) {
      setShowIOSHint(true);
      if (onOpenInstallModal) onOpenInstallModal();
    } else {
      if (onOpenInstallModal) onOpenInstallModal();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim();

    if (!cleanEmail) {
      setErrorMsg('Please enter your email address');
      return;
    }

    if (!cleanEmail.includes('@') || !cleanEmail.includes('.')) {
      setErrorMsg('Please enter a valid email address (e.g. name@gmail.com)');
      return;
    }

    // 1. Admin login: triggered exclusively by email gudurualemayehu29@gmail.com
    if (cleanEmail === ADMIN_EMAIL.toLowerCase()) {
      const validAdminPasswords = ['admin123', 'guduru2025', 'guduru2026', 'guduru123', 'admin'];
      if (!cleanPassword || !validAdminPasswords.includes(cleanPassword)) {
        setErrorMsg('Incorrect password. Please enter the valid administrator password.');
        return;
      }
      try {
        const adminUser = authenticateUser(ADMIN_EMAIL, cleanPassword, name.trim() || 'Guduru Alemayehu');
        onSignInSuccess(adminUser);
      } catch (err: any) {
        setErrorMsg(err?.message || 'Incorrect password.');
      }
      return;
    }

    // 2. Any other email logs in as student (locked content like before until subscription verified)
    if (!name.trim()) {
      setErrorMsg('Please enter your full name');
      return;
    }

    try {
      const studentUser = authenticateUser(
        cleanEmail,
        cleanPassword || undefined,
        name.trim(),
        stream
      );
      onSignInSuccess(studentUser);
    } catch {
      setErrorMsg('Sign-in failed. Please try again.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center py-6 sm:py-12 px-3 sm:px-6 lg:px-8 relative overflow-hidden selection:bg-indigo-500 selection:text-white">
      {/* Background Ambience */}
      <div className="absolute -top-32 -left-32 w-80 h-80 bg-indigo-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -right-32 w-80 h-80 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="sm:mx-auto sm:w-full sm:max-w-xl z-10 space-y-4">
        
        {/* Brand Header */}
        <div className="text-center space-y-1.5">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-500 shadow-xl shadow-indigo-500/25 border border-indigo-400/30 mb-1">
            <BookOpen className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold font-display tracking-tight text-white">
            Smart Study Tutorial
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 max-w-md mx-auto">
            Grade 12 & Ethiopian University Entrance Exam (EUEE) Prep, Trilingual Video Lessons & Offline Practice
          </p>
        </div>

        {/* PWA Install Notice Banner */}
        {!isStandalone && (
          <div
            id="signin-install-card"
            className="p-4 rounded-2xl bg-gradient-to-r from-indigo-900/90 via-slate-900/95 to-violet-900/90 border border-indigo-500/40 shadow-xl shadow-indigo-950/50 backdrop-blur-md"
          >
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-3 text-center sm:text-left">
                <div className="w-11 h-11 rounded-xl bg-indigo-600 flex items-center justify-center text-white shrink-0 shadow-md shadow-indigo-600/40">
                  <Smartphone className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center justify-center sm:justify-start gap-1.5 flex-wrap">
                    <span className="font-bold text-white text-sm">Install App on Phone / PC</span>
                    <span className="text-[10px] uppercase font-extrabold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      PWA Fast
                    </span>
                  </div>
                  <p className="text-xs text-indigo-200 mt-0.5">
                    1-tap home screen launch, full screen view & offline practice questions without internet data!
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
                <button
                  type="button"
                  id="signin-direct-install-btn"
                  onClick={handleInstallClick}
                  disabled={isInstalling}
                  className="flex-1 sm:flex-none px-4 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-400 active:scale-95 text-white font-bold text-xs shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>{isInstalling ? 'Installing...' : 'Install App'}</span>
                </button>

                {onOpenInstallModal && (
                  <button
                    type="button"
                    onClick={onOpenInstallModal}
                    className="px-3 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-medium border border-slate-700/80 transition-colors cursor-pointer flex items-center gap-1"
                    title="Install instructions"
                  >
                    <HelpCircle className="w-3.5 h-3.5 text-indigo-400" />
                    <span className="hidden xs:inline">Guide</span>
                  </button>
                )}
              </div>
            </div>

            {isIOS && showIOSHint && (
              <div className="mt-3 pt-3 border-t border-indigo-500/30 text-xs text-indigo-200 flex items-start gap-2 bg-indigo-950/40 p-2 rounded-xl">
                <Share2 className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                <span>
                  <strong>On iPhone / iPad:</strong> Tap the <strong>Share</strong> icon (⎋) in Safari bottom bar, then tap <strong>&quot;Add to Home Screen&quot;</strong>.
                </span>
              </div>
            )}
          </div>
        )}

        {/* Single Unified Sign In Card */}
        <div className="bg-slate-900/90 border border-slate-800/90 rounded-3xl p-5 sm:p-7 shadow-2xl backdrop-blur-md">
          
          <div className="mb-5 pb-3 border-b border-slate-800/80">
            <h2 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-indigo-400" />
              <span>Sign In to Smart Study Tutorial</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Enter your details to sign in and access Ethiopian University Entrance Exam preparation.
            </p>
          </div>

          {/* Error Message */}
          {errorMsg && (
            <div className="mb-4 p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Single Form for Both */}
          <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
            
            {/* Full Name */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Full Name
              </label>
              <div className="relative">
                <UserIcon className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                <input
                  id="signin-name-input"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Samuel Kebede"
                  className="w-full pl-10 pr-3.5 py-2.5 bg-slate-800/80 border border-slate-700/80 rounded-xl text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>
            </div>

            {/* Email Address */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Email Address <span className="text-rose-400">*</span>
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                <input
                  id="signin-email-input"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. yourname@gmail.com"
                  className="w-full pl-10 pr-3.5 py-2.5 bg-slate-800/80 border border-slate-700/80 rounded-xl text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                <input
                  id="signin-password-input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full pl-10 pr-3.5 py-2.5 bg-slate-800/80 border border-slate-700/80 rounded-xl text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>
            </div>

            {/* Academic Stream */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Grade 12 Academic Stream
              </label>
              <div className="relative">
                <select
                  id="signin-stream-select"
                  value={stream}
                  onChange={(e) => setStream(e.target.value as any)}
                  className="w-full px-3.5 py-2.5 bg-slate-800/80 border border-slate-700/80 rounded-xl text-xs sm:text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors cursor-pointer"
                >
                  <option value="Natural Science">Natural Science (Maths, Physics, Chem, Bio)</option>
                  <option value="Social Science">Social Science (Maths, Economics, History, Geog)</option>
                </select>
              </div>
            </div>

            {/* Universal Sign In Button */}
            <button
              type="submit"
              id="auth-submit-btn"
              className="w-full mt-4 py-3 bg-gradient-to-r from-indigo-600 via-indigo-500 to-violet-600 hover:from-indigo-500 hover:to-violet-500 active:scale-98 text-white font-bold text-sm rounded-xl shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 cursor-pointer transition-all"
            >
              <span>Sign In to Smart Study</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {/* Access Note */}
          <div className="mt-5 p-3 rounded-2xl bg-slate-950/70 border border-slate-800 text-[11px] text-slate-400 space-y-1">
            <div className="flex items-center gap-1.5 text-indigo-300 font-semibold">
              <Layers className="w-3.5 h-3.5" />
              <span>Entrance Exam Tutorial Access:</span>
            </div>
            <p>
              Free Review access includes preview questions. Full 80+ entrance exam full solutions, videos, and study notes unlock with 1-semester pass upon payment verification.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
