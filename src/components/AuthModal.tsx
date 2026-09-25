import React, { useState } from 'react';
import { X, User as UserIcon, ArrowRight } from 'lucide-react';
import { User } from '../types';
import { ADMIN_EMAIL, INITIAL_ADMIN_USER } from '../data/initialData';
import { setCurrentUser, getStudents, saveStudents } from '../utils/storage';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  onUserChange: (user: User) => void;
  onSignOut: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onUserChange,
  onSignOut
}) => {
  const [emailInput, setEmailInput] = useState('');
  const [nameInput, setNameInput] = useState('');

  if (!isOpen) return null;

  const handleCustomLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput.trim()) return;

    const email = emailInput.trim().toLowerCase();
    const isAdmin = email === ADMIN_EMAIL.toLowerCase();

    const newUser: User = {
      id: 'user-' + Date.now(),
      email,
      name: nameInput.trim() || (isAdmin ? 'Guduru Alemayehu (Admin)' : email.split('@')[0]),
      role: isAdmin ? 'admin' : 'student',
      subscription: isAdmin
        ? {
            status: 'active',
            planName: 'Super Admin Lifetime Pass',
            activatedAt: '2025-01-01',
            expiresAt: '2099-12-31'
          }
        : {
            status: 'none'
          },
      createdAt: new Date().toISOString().split('T')[0]
    };

    if (!isAdmin) {
      const existingStudents = getStudents();
      const existing = existingStudents.find((s) => s.email.toLowerCase() === email);
      if (existing) {
        setCurrentUser(existing);
        onUserChange(existing);
        onClose();
        return;
      }
      saveStudents([newUser, ...existingStudents]);
    }

    setCurrentUser(newUser);
    onUserChange(newUser);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-md w-full p-6 text-slate-100 shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center">
            <UserIcon className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold font-display text-white">Switch User / Account</h2>
            <p className="text-xs text-slate-400">Enter your email and name to sign into your account</p>
          </div>
        </div>

        {/* Custom Login Form */}
        <form onSubmit={handleCustomLogin} className="space-y-3.5" autoComplete="off">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Email Address</label>
            <input
              type="email"
              required
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              placeholder="e.g. yourname@gmail.com"
              className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Full Name</label>
            <input
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder="e.g. Samuel Kebede"
              className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>

          <button
            type="submit"
            className="w-full py-2.5 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white font-medium rounded-xl text-sm flex items-center justify-center gap-2 transition-all shadow-md shadow-indigo-600/30 cursor-pointer"
          >
            <span>Continue to App</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        {/* Sign Out Option */}
        <div className="pt-4 mt-4 border-t border-slate-800 flex justify-between items-center text-xs">
          <span className="text-slate-400 truncate max-w-[200px]">Active: {currentUser.email}</span>
          <button
            type="button"
            onClick={() => {
              onClose();
              onSignOut();
            }}
            className="text-rose-400 hover:text-rose-300 font-semibold cursor-pointer hover:underline"
          >
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
};
