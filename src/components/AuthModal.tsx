import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Mail, Lock, User, ArrowRight, Sparkles, ShieldAlert, Globe, Check, Copy, ExternalLink, LogIn, UserPlus } from "lucide-react";
import { signInWithEmail, signUpWithEmail, loginWithGoogle } from "../lib/firebase";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  showToast: (message: string, type?: "success" | "error") => void;
  onSuccess: (user: any) => void;
}

export function AuthModal({ isOpen, onClose, showToast, onSuccess }: AuthModalProps) {
  const [mode, setMode] = useState<"signin" | "signup" | "domain-help">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const currentDomain = typeof window !== "undefined" ? window.location.hostname : "";
  const currentOrigin = typeof window !== "undefined" ? window.location.origin : "";

  if (!isOpen) return null;

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email || !password) {
      setError("Please fill in all required fields.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }

    setLoading(true);
    try {
      if (mode === "signup") {
        const newUser = await signUpWithEmail(email, password, name);
        showToast("Account created successfully!");
        onSuccess(newUser);
        onClose();
      } else {
        const user = await signInWithEmail(email, password);
        showToast("Signed in successfully!");
        onSuccess(user);
        onClose();
      }
    } catch (err: any) {
      console.error("Email auth error:", err);
      let errMsg = "Authentication failed. Please check your credentials.";
      if (err?.code === "auth/email-already-in-use") {
        errMsg = "An account with this email already exists. Try signing in instead.";
      } else if (err?.code === "auth/invalid-email") {
        errMsg = "Please enter a valid email address.";
      } else if (err?.code === "auth/wrong-password" || err?.code === "auth/invalid-credential" || err?.code === "auth/user-not-found") {
        errMsg = "Incorrect email or password.";
      } else if (err?.code === "auth/operation-not-allowed") {
        errMsg = "Email/Password sign-in is disabled in Firebase Console. Please enable it under Auth -> Sign-in method.";
      } else if (err?.message) {
        errMsg = err.message;
      }
      setError(errMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    setError(null);
    setLoading(true);
    try {
      const user = await loginWithGoogle();
      showToast("Signed in with Google!");
      onSuccess(user);
      onClose();
    } catch (err: any) {
      console.error("Google auth error:", err);
      if (err?.code === "auth/unauthorized-domain" || (err?.message && err.message.includes("unauthorized-domain"))) {
        setMode("domain-help");
        showToast("Google OAuth requires domain authorization in Firebase Console.", "error");
      } else if (err?.code === "auth/popup-blocked") {
        setMode("domain-help");
        showToast("Sign-in popup was blocked by your browser.", "error");
      } else if (err?.code === "auth/popup-closed-by-user") {
        setError("Sign-in popup was closed before completing.");
      } else {
        setError(err?.message || "Google sign-in failed.");
      }
    } finally {
      setLoading(false);
    }
  };

  const copyDomain = () => {
    navigator.clipboard.writeText(currentDomain).then(() => {
      setCopied(true);
      showToast("Domain copied to clipboard!");
      setTimeout(() => setCopied(false), 2500);
    });
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 12 }}
          className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-md w-full overflow-hidden flex flex-col relative"
        >
          {/* Top Header */}
          <div className="p-6 bg-slate-900 text-white relative">
            <button
              onClick={onClose}
              className="absolute top-5 right-5 text-slate-400 hover:text-white p-1.5 rounded-full hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 bg-indigo-500/20 border border-indigo-400/30 rounded-lg text-amber-300">
                <Sparkles className="w-4 h-4" />
              </div>
              <span className="text-xs font-bold uppercase tracking-widest text-indigo-300">CV Crafter Auth</span>
            </div>

            <h3 className="text-xl font-extrabold text-white">
              {mode === "signin" && "Sign In to Your Account"}
              {mode === "signup" && "Create Your Account"}
              {mode === "domain-help" && "Google Auth Domain Setup"}
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              {mode === "signin" && "Access your saved resumes and Cloud sync"}
              {mode === "signup" && "Sign up for free Cloud storage and ATS tools"}
              {mode === "domain-help" && "Authorize your domain or use Email/Password Sign-In"}
            </p>
          </div>

          {/* Mode Switcher Tabs */}
          {mode !== "domain-help" && (
            <div className="flex border-b border-slate-200 bg-slate-50/80 px-6 pt-2">
              <button
                type="button"
                onClick={() => { setMode("signin"); setError(null); }}
                className={`flex-1 py-3 text-xs font-extrabold border-b-2 transition-all flex items-center justify-center gap-2 ${
                  mode === "signin"
                    ? "border-indigo-600 text-indigo-600 bg-white rounded-t-xl"
                    : "border-transparent text-slate-500 hover:text-slate-900"
                }`}
              >
                <LogIn className="w-4 h-4" />
                <span>Sign In</span>
              </button>
              <button
                type="button"
                onClick={() => { setMode("signup"); setError(null); }}
                className={`flex-1 py-3 text-xs font-extrabold border-b-2 transition-all flex items-center justify-center gap-2 ${
                  mode === "signup"
                    ? "border-indigo-600 text-indigo-600 bg-white rounded-t-xl"
                    : "border-transparent text-slate-500 hover:text-slate-900"
                }`}
              >
                <UserPlus className="w-4 h-4" />
                <span>Create Account</span>
              </button>
            </div>
          )}

          {/* Body Content */}
          <div className="p-6 space-y-4">
            {error && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-semibold flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {mode !== "domain-help" ? (
              <>
                {/* Email Form */}
                <form onSubmit={handleEmailAuth} className="space-y-3">
                  {mode === "signup" && (
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Full Name</label>
                      <div className="relative">
                        <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          placeholder="John Doe"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:border-indigo-500 outline-none transition-all"
                        />
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Email Address</label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="email"
                        required
                        placeholder="you@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:border-indigo-500 outline-none transition-all"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Password</label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="password"
                        required
                        minLength={6}
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:border-indigo-500 outline-none transition-all"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs rounded-xl shadow-md shadow-indigo-100 transition-all flex items-center justify-center gap-2 disabled:opacity-50 mt-2"
                  >
                    {loading ? (
                      <span>Processing...</span>
                    ) : (
                      <>
                        <span>{mode === "signin" ? "Sign In with Email" : "Create Account"}</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </form>

                <div className="flex items-center my-4">
                  <div className="h-px flex-1 bg-slate-200" />
                  <span className="px-3 text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">OR</span>
                  <div className="h-px flex-1 bg-slate-200" />
                </div>

                {/* Google Sign-In Option */}
                <button
                  type="button"
                  onClick={handleGoogleAuth}
                  disabled={loading}
                  className="w-full py-2.5 px-4 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-xl transition-all shadow-2xs flex items-center justify-center gap-2.5"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                  </svg>
                  <span>Sign in with Google</span>
                </button>
              </>
            ) : (
              /* Google Authorized Domain Help */
              <div className="space-y-4">
                <div className="p-3.5 bg-indigo-50 border border-indigo-200 rounded-2xl space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-indigo-900">Active Domain:</span>
                    <button
                      onClick={copyDomain}
                      className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold text-[10px] flex items-center gap-1 shadow-2xs"
                    >
                      {copied ? <Check className="w-3 h-3 text-emerald-300" /> : <Copy className="w-3 h-3" />}
                      <span>{copied ? "Copied" : "Copy Domain"}</span>
                    </button>
                  </div>
                  <div className="bg-white p-2 rounded-xl border border-indigo-200 font-mono text-indigo-900 font-bold truncate">
                    {currentDomain}
                  </div>
                  <p className="text-slate-600 text-[11px] leading-relaxed">
                    Google OAuth popup requires adding <code className="font-bold text-indigo-800">{currentDomain}</code> to <strong>Firebase Console -&gt; Authentication -&gt; Settings -&gt; Authorized domains</strong>.
                  </p>
                </div>

                <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl space-y-2">
                  <span className="font-extrabold text-xs text-emerald-900 block">Instant Alternative (No Setup Required):</span>
                  <p className="text-xs text-emerald-800 leading-relaxed">
                    You can use <strong>Email &amp; Password</strong> sign in right now without any domain authorization restrictions!
                  </p>
                  <button
                    type="button"
                    onClick={() => { setMode("signin"); setError(null); }}
                    className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl transition-all shadow-xs flex items-center justify-center gap-2"
                  >
                    <Mail className="w-4 h-4" />
                    <span>Switch to Email &amp; Password Sign-In</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
