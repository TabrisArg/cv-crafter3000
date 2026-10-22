import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ShieldAlert, Copy, Check, ExternalLink, X, ArrowRight, UserCheck, RefreshCw, Key, Globe } from "lucide-react";

interface UnauthorizedDomainModalProps {
  isOpen: boolean;
  onClose: () => void;
  onContinueGuest: () => void;
  showToast: (message: string, type?: "success" | "error") => void;
}

export function UnauthorizedDomainModal({
  isOpen,
  onClose,
  onContinueGuest,
  showToast,
}: UnauthorizedDomainModalProps) {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"checklist" | "guest">("checklist");
  const currentDomain = typeof window !== "undefined" ? window.location.hostname : "";
  const currentOrigin = typeof window !== "undefined" ? window.location.origin : "";

  if (!isOpen) return null;

  const copyDomain = () => {
    navigator.clipboard.writeText(currentDomain).then(() => {
      setCopied(true);
      showToast("Domain copied to clipboard!");
      setTimeout(() => setCopied(false), 2500);
    });
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-xl w-full overflow-hidden flex flex-col max-h-[90vh]"
        >
          {/* Header */}
          <div className="p-6 bg-slate-900 text-white flex items-start justify-between relative shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-400/30 text-amber-400 flex items-center justify-center shrink-0">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-lg text-white">Google Login Authorization Setup</h3>
                <p className="text-xs text-slate-400">Firebase &amp; Google Cloud domain check required</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Quick Tab Switcher */}
          <div className="flex border-b border-slate-200 bg-slate-50 px-6 shrink-0">
            <button
              onClick={() => setActiveTab("checklist")}
              className={`py-3 px-4 text-xs font-bold border-b-2 transition-all flex items-center gap-2 ${
                activeTab === "checklist"
                  ? "border-indigo-600 text-indigo-600 bg-white"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              <Globe className="w-4 h-4" />
              <span>Full Setup Checklist (4 Steps)</span>
            </button>
            <button
              onClick={() => setActiveTab("guest")}
              className={`py-3 px-4 text-xs font-bold border-b-2 transition-all flex items-center gap-2 ${
                activeTab === "guest"
                  ? "border-emerald-600 text-emerald-600 bg-white"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              <UserCheck className="w-4 h-4 text-emerald-600" />
              <span>Use App without Login (Guest Mode)</span>
            </button>
          </div>

          {/* Body */}
          <div className="p-6 space-y-4 text-slate-700 text-sm overflow-y-auto flex-1">
            {activeTab === "checklist" ? (
              <>
                <p className="text-xs leading-relaxed text-slate-600">
                  If you already added the domain to Firebase Console and still receive this error, Google OAuth requires completing <strong>both</strong> the Firebase settings and the Google Cloud Credentials origins list:
                </p>

                {/* Domain & Project Info */}
                <div className="bg-indigo-50/60 border border-indigo-200/80 p-3.5 rounded-xl space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="overflow-hidden">
                      <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider block mb-0.5">
                        Domain to Add
                      </span>
                      <span className="font-mono text-xs font-bold text-indigo-800 truncate block">
                        {currentDomain}
                      </span>
                    </div>
                    <button
                      onClick={copyDomain}
                      className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 shadow-sm shadow-indigo-200"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copied ? "Copied" : "Copy"}</span>
                    </button>
                  </div>

                  <div className="pt-2 border-t border-indigo-200/60 flex items-center justify-between text-xs">
                    <span className="text-indigo-600 font-medium">Firebase Project ID:</span>
                    <span className="font-mono font-bold text-slate-800 bg-white/80 border border-indigo-200 px-2 py-0.5 rounded">
                      gen-lang-client-0096063843
                    </span>
                  </div>
                </div>

                {/* 4 Steps Checklist */}
                <div className="space-y-3">
                  <span className="text-xs font-bold text-slate-900 uppercase tracking-wider block">
                    Complete 4-Step Checklist:
                  </span>
                  
                  <div className="space-y-2.5 text-xs text-slate-600">
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                      <div className="font-bold text-slate-900 flex items-center gap-1.5">
                        <span className="w-4 h-4 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px]">1</span>
                        Check Firebase Authorized Domains Format
                      </div>
                      <p className="text-slate-600 pl-5">
                        In <a href="https://console.firebase.google.com/project/gen-lang-client-0096063843/authentication/settings" target="_blank" rel="noopener noreferrer" className="text-indigo-600 font-bold hover:underline inline-flex items-center gap-1">Firebase Auth Settings <ExternalLink className="w-3 h-3" /></a>, verify the entry is strictly <code className="bg-slate-200 text-slate-900 px-1 py-0.5 rounded font-bold">{currentDomain}</code>. Ensure it does <strong>NOT</strong> have <code className="text-rose-600 font-semibold">https://</code> or trailing <code className="text-rose-600 font-semibold">/</code>.
                      </p>
                    </div>

                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                      <div className="font-bold text-slate-900 flex items-center gap-1.5">
                        <span className="w-4 h-4 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px]">2</span>
                        Add to Google Cloud OAuth Client Credentials
                      </div>
                      <p className="text-slate-600 pl-5">
                        Open <a href="https://console.cloud.google.com/apis/credentials?project=gen-lang-client-0096063843" target="_blank" rel="noopener noreferrer" className="text-indigo-600 font-bold hover:underline inline-flex items-center gap-1">Google Cloud Credentials <ExternalLink className="w-3 h-3" /></a>, click your <strong>OAuth 2.0 Web Client ID</strong>, and under <strong>Authorized JavaScript origins</strong> add <code className="bg-slate-200 text-slate-900 px-1 py-0.5 rounded font-bold">{currentOrigin}</code>.
                      </p>
                    </div>

                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                      <div className="font-bold text-slate-900 flex items-center gap-1.5">
                        <span className="w-4 h-4 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px]">3</span>
                        Allow 5-10 Minutes for Global Propagation
                      </div>
                      <p className="text-slate-600 pl-5">
                        Google&apos;s authentication edge servers update authorized origin lists globally. Changes take up to 10 minutes to take effect worldwide.
                      </p>
                    </div>

                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                      <div className="font-bold text-slate-900 flex items-center gap-1.5">
                        <span className="w-4 h-4 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px]">4</span>
                        Clear Browser Cache or Test in Incognito
                      </div>
                      <p className="text-slate-600 pl-5">
                        Firebase caches domain authorization status in session storage. Open a new Incognito window or clear browser cookies to test.
                      </p>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="space-y-4 py-2">
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl space-y-2">
                  <div className="flex items-center gap-2 text-emerald-900 font-bold">
                    <UserCheck className="w-5 h-5 text-emerald-600" />
                    <span>No Login Required (Guest / Local Mode)</span>
                  </div>
                  <p className="text-xs text-emerald-800 leading-relaxed">
                    You do not need to sign in with Google to use CV Crafter! Our application supports complete local offline persistence.
                  </p>
                </div>

                <div className="space-y-2">
                  <span className="text-xs font-bold text-slate-900 uppercase tracking-wider block">
                    What works in Guest Mode:
                  </span>
                  <ul className="text-xs text-slate-600 space-y-2 list-disc pl-5">
                    <li><strong>AI CV Builder &amp; Generator</strong>: Full access to Gemini AI quick generation and tailoring.</li>
                    <li><strong>ATS / ATO CV Scanner</strong>: Deterministic parser, keyword extraction, and issue breakdown.</li>
                    <li><strong>Exporting &amp; Printing</strong>: Download PDF, Word (.docx), JSON backup, or plain text.</li>
                    <li><strong>Automatic Storage</strong>: All created CVs are saved locally in your browser.</li>
                  </ul>
                </div>

                <button
                  onClick={onContinueGuest}
                  className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition-all shadow-md shadow-emerald-200 flex items-center justify-center gap-2"
                >
                  <UserCheck className="w-4 h-4" />
                  <span>Start Using App in Guest Mode Now</span>
                </button>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
            <button
              onClick={onContinueGuest}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-slate-700 hover:bg-slate-200 text-xs font-bold transition-colors flex items-center justify-center gap-1.5"
            >
              <UserCheck className="w-4 h-4 text-emerald-600" />
              <span>Use App in Guest Mode</span>
            </button>
            <button
              onClick={onClose}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md shadow-indigo-100 transition-all flex items-center justify-center gap-2"
            >
              <span>Dismiss &amp; Continue</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

