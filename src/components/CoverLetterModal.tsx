import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  FileText, 
  Building2, 
  Briefcase, 
  UserCheck, 
  Sparkles, 
  Copy, 
  Download, 
  RefreshCw, 
  X, 
  Check, 
  Edit3, 
  Eye, 
  FileDown, 
  Wand2,
  CheckCircle2,
  AlertCircle
} from "lucide-react";
import Markdown from "react-markdown";
import { generateCoverLetter, CoverLetterOutput, CVData } from "../lib/gemini";
import { exportCoverLetterToPDF } from "../lib/pdfExport";

interface CoverLetterModalProps {
  isOpen: boolean;
  onClose: () => void;
  cv: CVData;
  showToast: (msg: string, type?: "success" | "error" | "info") => void;
}

const TONE_OPTIONS = [
  { id: "Professional & Direct", label: "Professional & Direct", desc: "Balanced, concise, and business-focused" },
  { id: "Enthusiastic & Startup", label: "Enthusiastic & Startup", desc: "High energy, mission-driven, and forward-thinking" },
  { id: "Executive & Leadership", label: "Executive & Leadership", desc: "Strategic tone emphasizing ownership and ROI" },
  { id: "Confident & Persuasive", label: "Confident & Persuasive", desc: "Bold focus on proven track record and impact" },
];

export const CoverLetterModal: React.FC<CoverLetterModalProps> = ({
  isOpen,
  onClose,
  cv,
  showToast,
}) => {
  const [companyName, setCompanyName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [hiringManager, setHiringManager] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [tone, setTone] = useState("Professional & Direct");

  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<CoverLetterOutput | null>(null);
  const [editedText, setEditedText] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  if (!isOpen) return null;

  const handleGenerate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!companyName.trim() || !jobTitle.trim()) {
      setErrorMsg("Please fill in both Company Name and Target Job Title.");
      return;
    }

    setErrorMsg("");
    setIsGenerating(true);

    try {
      const res = await generateCoverLetter({
        cv,
        companyName: companyName.trim(),
        jobTitle: jobTitle.trim(),
        jobDescription: jobDescription.trim(),
        hiringManager: hiringManager.trim(),
        tone,
      });

      setResult(res);
      setEditedText(res.coverLetterText);
      setIsEditing(false);
      showToast("Cover Letter generated successfully!", "success");
    } catch (err: any) {
      console.error("Cover Letter Error:", err);
      setErrorMsg(err.message || "Failed to generate cover letter. Please try again.");
      showToast("Failed to generate Cover Letter", "error");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = () => {
    if (!editedText) return;
    navigator.clipboard.writeText(editedText);
    setCopied(true);
    showToast("Cover letter copied to clipboard!", "success");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExportPDF = () => {
    if (!editedText) return;
    const cleanFilename = `${companyName || "Company"}_${jobTitle || "Cover_Letter"}`.replace(/[^a-zA-Z0-9_-]/g, "_");
    exportCoverLetterToPDF(editedText, cleanFilename);
    showToast("Downloaded Cover Letter PDF", "success");
  };

  const handleExportTXT = () => {
    if (!editedText) return;
    const blob = new Blob([editedText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const cleanFilename = `${companyName || "Company"}_${jobTitle || "Cover_Letter"}`.replace(/[^a-zA-Z0-9_-]/g, "_");
    link.download = `${cleanFilename}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast("Downloaded plain text file", "success");
  };

  const handleReset = () => {
    setResult(null);
    setEditedText("");
    setIsEditing(false);
    setErrorMsg("");
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto bg-slate-900/60 backdrop-blur-xs">
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 10 }}
          className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-3xl overflow-hidden my-auto flex flex-col max-h-[90vh]"
        >
          {/* Modal Header */}
          <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-200">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <span>AI Cover Letter Generator</span>
                  <span className="text-[10px] font-black uppercase tracking-wider bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-md">
                    CV Grounded
                  </span>
                </h2>
                <p className="text-xs text-slate-500">
                  Target your open CV experience ({cv.personalInfo.fullName || "Candidate"}) directly to your dream company.
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-xl transition-colors"
              title="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Modal Content */}
          <div className="p-6 overflow-y-auto flex-1 space-y-6">
            {errorMsg && (
              <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 flex items-start gap-3 text-rose-800 text-sm">
                <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-semibold">Generation Notice</p>
                  <p className="text-xs text-rose-700 mt-0.5">{errorMsg}</p>
                </div>
              </div>
            )}

            {!result && !isGenerating && (
              <form onSubmit={handleGenerate} className="space-y-5">
                {/* Information Banner */}
                <div className="p-4 rounded-2xl bg-indigo-50/70 border border-indigo-100 flex items-start gap-3 text-indigo-900">
                  <Wand2 className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
                  <div className="text-xs leading-relaxed">
                    <p className="font-bold text-indigo-950">How it works:</p>
                    <p className="text-indigo-800/90 mt-0.5">
                      Enter the target company and position details. Our AI extracts your actual past roles, metrics, key skills, and accomplishments from your current CV to craft an authentic, persuasive cover letter.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Company Name */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-indigo-600" />
                      Company Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Stripe, Acme Corp, Google"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all placeholder:text-slate-400"
                    />
                  </div>

                  {/* Target Job Title */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <Briefcase className="w-3.5 h-3.5 text-indigo-600" />
                      Target Position Title <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Senior Frontend Engineer"
                      value={jobTitle}
                      onChange={(e) => setJobTitle(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all placeholder:text-slate-400"
                    />
                  </div>
                </div>

                {/* Hiring Manager Name */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <UserCheck className="w-3.5 h-3.5 text-slate-500" />
                    Hiring Manager or Department <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Sarah Jenkins or Engineering Hiring Team"
                    value={hiringManager}
                    onChange={(e) => setHiringManager(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all placeholder:text-slate-400"
                  />
                </div>

                {/* Company / Job Description */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                    <span>Job Description or Company Overview</span>
                    <span className="text-slate-400 font-normal text-[11px]">(Recommended for best match)</span>
                  </label>
                  <textarea
                    rows={4}
                    placeholder="Paste the job posting description, key responsibilities, required tech stack, or what the company does..."
                    value={jobDescription}
                    onChange={(e) => setJobDescription(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all placeholder:text-slate-400 resize-none"
                  />
                </div>

                {/* Tone Options */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700 block">
                    Writing Tone & Persona
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {TONE_OPTIONS.map((t) => (
                      <button
                        type="button"
                        key={t.id}
                        onClick={() => setTone(t.id)}
                        className={`p-3 rounded-2xl border text-left transition-all flex flex-col justify-between ${
                          tone === t.id
                            ? "border-indigo-600 bg-indigo-50/60 ring-2 ring-indigo-500/20"
                            : "border-slate-200 hover:border-slate-300 bg-white"
                        }`}
                      >
                        <div className="flex items-center justify-between w-full">
                          <span className="text-xs font-bold text-slate-900">{t.label}</span>
                          {tone === t.id && <CheckCircle2 className="w-4 h-4 text-indigo-600" />}
                        </div>
                        <span className="text-[11px] text-slate-500 mt-1 leading-snug">{t.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Submit Action */}
                <div className="pt-2">
                  <button
                    type="submit"
                    className="w-full py-3.5 px-6 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow-lg shadow-indigo-200 transition-all flex items-center justify-center gap-2 group cursor-pointer"
                  >
                    <Sparkles className="w-4 h-4 group-hover:rotate-12 transition-transform" />
                    <span>Generate Tailored Cover Letter</span>
                  </button>
                </div>
              </form>
            )}

            {/* Generating State */}
            {isGenerating && (
              <div className="py-16 text-center space-y-4">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
                  className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full mx-auto"
                />
                <div className="space-y-1">
                  <h3 className="text-base font-bold text-slate-900">Crafting Cover Letter...</h3>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    Matching your accomplishments from {cv.personalInfo.fullName || "your CV"} with {companyName}'s goals.
                  </p>
                </div>
              </div>
            )}

            {/* Result Preview & Editor */}
            {result && !isGenerating && (
              <div className="space-y-5">
                {/* Key Highlights Banner */}
                {result.keyHighlightsUsed && result.keyHighlightsUsed.length > 0 && (
                  <div className="p-4 rounded-2xl bg-emerald-50/80 border border-emerald-200 space-y-2">
                    <div className="flex items-center gap-2 text-emerald-900 font-bold text-xs">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>CV Experiences Highlighted for {result.companyName}:</span>
                    </div>
                    <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs text-emerald-800 font-medium">
                      {result.keyHighlightsUsed.map((h, i) => (
                        <li key={i} className="flex items-start gap-1.5 bg-white/70 px-2.5 py-1.5 rounded-lg border border-emerald-100">
                          <span className="text-emerald-600 font-bold">•</span>
                          <span className="line-clamp-2">{h}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Toolbar */}
                <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setIsEditing(!isEditing)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                        isEditing
                          ? "bg-indigo-600 text-white"
                          : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                      }`}
                    >
                      {isEditing ? <Eye className="w-3.5 h-3.5" /> : <Edit3 className="w-3.5 h-3.5" />}
                      <span>{isEditing ? "Preview Formatting" : "Edit Letter Text"}</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleCopy}
                      className="px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center gap-1.5 transition-all"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-500" />}
                      <span>{copied ? "Copied!" : "Copy Text"}</span>
                    </button>

                    <button
                      onClick={handleExportPDF}
                      className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download PDF</span>
                    </button>

                    <button
                      onClick={handleExportTXT}
                      className="px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center gap-1.5 transition-all"
                      title="Download plain text file"
                    >
                      <FileDown className="w-3.5 h-3.5 text-slate-500" />
                      <span>TXT</span>
                    </button>
                  </div>
                </div>

                {/* Letter Content Display / Editor */}
                {isEditing ? (
                  <textarea
                    rows={14}
                    value={editedText}
                    onChange={(e) => setEditedText(e.target.value)}
                    className="w-full p-5 rounded-2xl border border-slate-200 text-sm font-mono text-slate-800 leading-relaxed focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-slate-50/50"
                  />
                ) : (
                  <div className="p-6 sm:p-8 bg-slate-50/70 border border-slate-200/80 rounded-2xl text-slate-800 text-sm leading-relaxed max-h-[420px] overflow-y-auto space-y-4 shadow-inner">
                    <div className="prose prose-slate max-w-none text-slate-800 text-sm leading-relaxed font-sans">
                      <Markdown>{editedText}</Markdown>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Modal Footer */}
          <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/80 flex items-center justify-between shrink-0">
            {result ? (
              <button
                onClick={handleReset}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 transition-all flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Create Another Letter</span>
              </button>
            ) : (
              <span className="text-xs text-slate-400">All data generated strictly from open CV</span>
            )}

            <button
              onClick={onClose}
              className="px-5 py-2 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-bold transition-all"
            >
              Close
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
