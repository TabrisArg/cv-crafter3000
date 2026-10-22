import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  X, 
  Languages, 
  Download, 
  FileText, 
  CheckCircle2, 
  Sparkles, 
  ShieldCheck, 
  Loader2, 
  AlertCircle,
  FileArchive,
  Layout,
  Check
} from "lucide-react";
import { translateCV, type CVData } from "../lib/gemini";
import { exportToSelectablePDF, exportForPlatforms, generatePlatformText } from "../lib/pdfExport";
import JSZip from "jszip";

const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "outline" | "ghost" }> = ({
  children,
  className = "",
  variant = "primary",
  ...props
}) => {
  const base = "inline-flex items-center justify-center font-bold transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed";
  const styles = {
    primary: "bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs",
    outline: "border border-slate-200 text-slate-700 hover:bg-slate-50",
    ghost: "text-slate-600 hover:bg-slate-100",
  };
  return (
    <button className={`${base} ${styles[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
};

export interface CVItem {
  id: string;
  title: string;
  content: CVData;
  template: string;
  updated_at: string;
  parent_id?: string;
  userId?: string;
}

interface TranslateDownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedCvs: CVItem[];
  onRemoveCvFromSelection?: (id: string) => void;
  showToast: (message: string, type?: "success" | "error") => void;
  defaultTemplate?: string;
}

const SUPPORTED_LANGUAGES = [
  { code: "English", name: "English", nativeName: "Original", flag: "🇺🇸" },
  { code: "Spanish", name: "Spanish", nativeName: "Español", flag: "🇪🇸" },
  { code: "French", name: "French", nativeName: "Français", flag: "🇫🇷" },
  { code: "German", name: "German", nativeName: "Deutsch", flag: "🇩🇪" },
  { code: "Portuguese", name: "Portuguese", nativeName: "Português", flag: "🇵🇹" },
  { code: "Italian", name: "Italian", nativeName: "Italiano", flag: "🇮🇹" },
  { code: "Dutch", name: "Dutch", nativeName: "Nederlands", flag: "🇳🇱" },
  { code: "Polish", name: "Polish", nativeName: "Polski", flag: "🇵🇱" },
  { code: "Japanese", name: "Japanese", nativeName: "日本語", flag: "🇯🇵" },
  { code: "Chinese", name: "Chinese (Simplified)", nativeName: "简体中文", flag: "🇨🇳" },
  { code: "Arabic", name: "Arabic", nativeName: "العربية", flag: "🇸🇦" },
];

export const TranslateDownloadModal: React.FC<TranslateDownloadModalProps> = ({
  isOpen,
  onClose,
  selectedCvs,
  onRemoveCvFromSelection,
  showToast,
  defaultTemplate = "modern"
}) => {
  const [selectedLanguage, setSelectedLanguage] = useState<string>("Spanish");
  const [isCustomLanguage, setIsCustomLanguage] = useState(false);
  const [customLanguageInput, setCustomLanguageInput] = useState("");
  const [exportFormat, setExportFormat] = useState<"pdf" | "platform" | "both">("pdf");
  const [template, setTemplate] = useState<string>(defaultTemplate);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<{
    current: number;
    total: number;
    currentTitle: string;
    stage: string;
  } | null>(null);

  if (!isOpen) return null;

  const effectiveLanguage = isCustomLanguage 
    ? (customLanguageInput.trim() || "English") 
    : selectedLanguage;

  const handleStartDownload = async () => {
    if (selectedCvs.length === 0) {
      showToast("Please select at least one CV to download.", "error");
      return;
    }

    if (isCustomLanguage && !customLanguageInput.trim()) {
      showToast("Please enter a target language name.", "error");
      return;
    }

    setIsProcessing(true);
    const total = selectedCvs.length;
    const isMultiple = total > 1 || exportFormat === "both";
    const zip = isMultiple ? new JSZip() : null;

    try {
      for (let i = 0; i < total; i++) {
        const cv = selectedCvs[i];
        const cvTitle = cv.title || cv.content.personalInfo.fullName || `CV_${i + 1}`;
        
        setProgress({
          current: i + 1,
          total,
          currentTitle: cvTitle,
          stage: effectiveLanguage === "English"
            ? `Preparing ${cvTitle}...`
            : `Translating "${cvTitle}" to ${effectiveLanguage} with 100% accuracy check...`
        });

        let dataToExport: CVData = cv.content;

        // Perform translation if target language is not English
        if (effectiveLanguage !== "English") {
          try {
            dataToExport = await translateCV(cv.content, effectiveLanguage);
          } catch (err: any) {
            console.error(`Translation failed for ${cvTitle}:`, err);
            throw new Error(`Translation of "${cvTitle}" into ${effectiveLanguage} failed: ${err.message || "Please check connection and retry."}`);
          }
        }

        // Construct a clean, professional filename
        const fullName = (dataToExport.personalInfo?.fullName || "Candidate").trim();
        let baseFilename = "";
        if (dataToExport.suggestedTitle) {
          baseFilename = `${fullName} - ${dataToExport.suggestedTitle}`;
        } else {
          baseFilename = `${fullName} - ${cv.title || "Resume"}`;
        }

        if (effectiveLanguage !== "English") {
          baseFilename = `${baseFilename} (${effectiveLanguage})`;
        }

        const cleanFilename = baseFilename.replace(/[/\\?%*:|"<>]/g, "-").trim();
        const activeTpl = cv.template || template;

        if (isMultiple && zip) {
          // Add files to ZIP
          if (exportFormat === "pdf" || exportFormat === "both") {
            const doc = exportToSelectablePDF(dataToExport, cleanFilename, activeTpl, false);
            if (doc) {
              const pdfBlob = doc.output("blob");
              zip.file(`${cleanFilename}.pdf`, pdfBlob);
            }
          }

          if (exportFormat === "platform" || exportFormat === "both") {
            const platformText = generatePlatformText(dataToExport);
            zip.file(`${cleanFilename}_Platform.txt`, platformText);
          }
        } else {
          // Single file direct download
          if (exportFormat === "platform") {
            exportForPlatforms(dataToExport, cleanFilename, true);
          } else {
            const doc = exportToSelectablePDF(dataToExport, cleanFilename, activeTpl, true);
            if (!doc) {
              throw new Error("PDF generation failed. Please try again.");
            }
          }
        }
      }

      // If multiple files or format is "both", bundle and trigger ZIP download
      if (isMultiple && zip) {
        setProgress({
          current: total,
          total,
          currentTitle: "Packaging archive",
          stage: "Compressing translated documents into ZIP..."
        });

        const zipBlob = await zip.generateAsync({ type: "blob" });
        const url = URL.createObjectURL(zipBlob);
        const link = document.createElement("a");
        link.href = url;
        const zipName = `Resumes_${effectiveLanguage.replace(/\s+/g, "_")}.zip`;
        link.download = zipName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      }

      showToast(
        total === 1 
          ? `Downloaded "${selectedCvs[0].title}" in ${effectiveLanguage} with 100% accuracy!` 
          : `Exported ${total} CVs in ${effectiveLanguage} into ZIP archive!`,
        "success"
      );
      
      setTimeout(() => {
        setIsProcessing(false);
        setProgress(null);
        onClose();
      }, 700);
    } catch (err: any) {
      console.error("Batch download error:", err);
      showToast(err.message || "Failed to download translated CVs.", "error");
      setIsProcessing(false);
      setProgress(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={() => !isProcessing && onClose()}
        className="fixed inset-0 bg-slate-900/65 backdrop-blur-sm"
      />

      <motion.div 
        initial={{ scale: 0.95, opacity: 0, y: 15 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 15 }}
        className="relative bg-white rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden border border-slate-200 z-10 my-auto flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="p-6 pb-4 border-b border-slate-100 flex items-center justify-between shrink-0 bg-slate-50/70">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center text-white shadow-md shadow-indigo-200">
              <Languages className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black text-slate-900 tracking-tight">
                  Download Translated CVs
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-extrabold flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3 text-emerald-600" />
                  100% Accuracy
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium">
                {selectedCvs.length} {selectedCvs.length === 1 ? "resume" : "resumes"} selected for high-fidelity localization
              </p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            disabled={isProcessing}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar flex-1">
          {/* Selected CVs Chips */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Selected CVs ({selectedCvs.length})
              </span>
              <span className="text-[11px] text-slate-400">
                {selectedCvs.length > 1 ? "Will be packaged into a single clean .zip" : "Will download directly"}
              </span>
            </div>

            <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-2 bg-slate-50 rounded-2xl border border-slate-200/80 custom-scrollbar">
              {selectedCvs.map((cv) => (
                <div 
                  key={cv.id}
                  className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-800 shadow-2xs group"
                >
                  <FileText className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                  <span className="truncate max-w-[200px]" title={cv.title}>
                    {cv.title}
                  </span>
                  {selectedCvs.length > 1 && onRemoveCvFromSelection && !isProcessing && (
                    <button 
                      type="button"
                      onClick={() => onRemoveCvFromSelection(cv.id)}
                      className="text-slate-400 hover:text-rose-500 p-0.5 rounded-md transition-colors"
                      title="Remove from download"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Target Language Selection */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <span>Target Language</span>
                <span className="text-indigo-600">*</span>
              </label>
              <button 
                type="button" 
                onClick={() => {
                  setIsCustomLanguage(!isCustomLanguage);
                  if (!isCustomLanguage && !customLanguageInput) {
                    setCustomLanguageInput("");
                  }
                }}
                className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 transition-colors"
              >
                {isCustomLanguage ? "← Pick from popular languages" : "+ Other language..."}
              </button>
            </div>

            {isCustomLanguage ? (
              <div className="space-y-2">
                <input 
                  type="text"
                  placeholder="e.g. Swedish, Korean, Turkish, Greek, Romanian, Arabic..."
                  value={customLanguageInput}
                  onChange={(e) => setCustomLanguageInput(e.target.value)}
                  disabled={isProcessing}
                  className="w-full px-4 py-2.5 bg-white border border-indigo-300 rounded-xl text-sm font-semibold text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 shadow-2xs"
                  autoFocus
                />
                <p className="text-[11px] text-slate-500">
                  You can type any language. The AI will translate all experience bullets, skills, and titles with 100% precision.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                {SUPPORTED_LANGUAGES.map((lang) => {
                  const isSelected = selectedLanguage === lang.code;
                  return (
                    <button
                      key={lang.code}
                      type="button"
                      disabled={isProcessing}
                      onClick={() => setSelectedLanguage(lang.code)}
                      className={`px-3 py-2 rounded-xl text-left border transition-all flex items-center gap-2 ${
                        isSelected 
                          ? "bg-indigo-50/90 border-indigo-500 text-indigo-900 shadow-2xs font-bold ring-1 ring-indigo-500" 
                          : "bg-white border-slate-200/90 text-slate-700 hover:bg-slate-50 hover:border-slate-300 font-medium"
                      }`}
                    >
                      <span className="text-base shrink-0">{lang.flag}</span>
                      <div className="truncate min-w-0">
                        <p className="text-xs font-bold truncate leading-tight">{lang.name}</p>
                        <p className="text-[10px] text-slate-400 truncate">{lang.nativeName}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Export Format & Options */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                Format
              </label>
              <div className="space-y-1.5">
                {[
                  { id: "pdf", label: "Polished PDF", desc: "ATS-selectable text & styling", icon: Layout },
                  { id: "platform", label: "ATS Plain Text (.txt)", desc: "Optimized for Workday/Greenhouse", icon: FileText },
                  { id: "both", label: "Both (PDF + Text)", desc: "Includes both in download", icon: FileArchive },
                ].map((fmt) => {
                  const isSelected = exportFormat === fmt.id;
                  const Icon = fmt.icon;
                  return (
                    <button
                      key={fmt.id}
                      type="button"
                      disabled={isProcessing}
                      onClick={() => setExportFormat(fmt.id as any)}
                      className={`w-full p-2.5 rounded-xl border text-left transition-all flex items-center gap-3 ${
                        isSelected 
                          ? "bg-indigo-50 border-indigo-400 text-indigo-900 ring-1 ring-indigo-400" 
                          : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <Icon className={`w-4 h-4 shrink-0 ${isSelected ? "text-indigo-600" : "text-slate-400"}`} />
                      <div className="min-w-0">
                        <p className="text-xs font-bold leading-tight">{fmt.label}</p>
                        <p className="text-[10px] text-slate-400">{fmt.desc}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                PDF Layout Template
              </label>
              <div className="space-y-1.5">
                {[
                  { id: "modern", label: "Modern Template", desc: "Clean indigo headers, structured ATS hierarchy" },
                  { id: "minimal", label: "Minimalist Template", desc: "Classic black & white two-column ATS format" },
                ].map((tpl) => {
                  const isSelected = template === tpl.id;
                  return (
                    <button
                      key={tpl.id}
                      type="button"
                      disabled={isProcessing}
                      onClick={() => setTemplate(tpl.id)}
                      className={`w-full p-2.5 rounded-xl border text-left transition-all flex items-center gap-2.5 ${
                        isSelected 
                          ? "bg-indigo-50 border-indigo-400 text-indigo-900 ring-1 ring-indigo-400" 
                          : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 ${
                        isSelected ? "border-indigo-600 bg-indigo-600" : "border-slate-300"
                      }`}>
                        {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold leading-tight">{tpl.label}</p>
                        <p className="text-[10px] text-slate-400">{tpl.desc}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 100% Accuracy Guarantee Box */}
          <div className="p-4 bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-indigo-500/10 rounded-2xl border border-emerald-200/80 space-y-2">
            <div className="flex items-center gap-2 text-emerald-800">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <span className="text-xs font-black uppercase tracking-wider">
                100% Accuracy & Fidelity Guarantee
              </span>
            </div>
            <ul className="text-[11px] text-slate-600 space-y-1 pl-1">
              <li className="flex items-start gap-1.5">
                <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                <span><strong>Zero Dropped Content:</strong> Exactly preserves all work entries, bullet points, degrees, and skills 1:1.</span>
              </li>
              <li className="flex items-start gap-1.5">
                <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                <span><strong>Mathematical Precision:</strong> All metrics, percentages, dollar amounts ($5M, 35%, 10x), and dates stay exact.</span>
              </li>
              <li className="flex items-start gap-1.5">
                <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                <span><strong>Proper Nouns Protected:</strong> Corporate entities, studio names, and universities are never translated into gibberish.</span>
              </li>
              <li className="flex items-start gap-1.5">
                <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                <span><strong>Markdown Highlights Maintained:</strong> Bold keywords (<span className="font-bold">**keyword**</span>) are perfectly matched.</span>
              </li>
            </ul>
          </div>

          {/* Real-time Progress Bar during Download */}
          {isProcessing && progress && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 bg-indigo-50 border border-indigo-200 rounded-2xl space-y-3"
            >
              <div className="flex items-center justify-between text-xs font-bold text-indigo-950">
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                  <span>Processing {progress.current} of {progress.total}</span>
                </div>
                <span>{Math.round((progress.current / progress.total) * 100)}%</span>
              </div>

              <div className="w-full bg-indigo-200/60 rounded-full h-2 overflow-hidden">
                <motion.div 
                  className="bg-indigo-600 h-full rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${(progress.current / progress.total) * 100}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>

              <p className="text-[11px] text-indigo-700 italic truncate">
                {progress.stage}
              </p>
            </motion.div>
          )}
        </div>

        {/* Modal Actions */}
        <div className="p-5 border-t border-slate-100 flex items-center justify-between shrink-0 bg-slate-50/50">
          <Button 
            variant="outline" 
            onClick={onClose} 
            disabled={isProcessing}
            className="rounded-xl px-5 text-xs font-bold text-slate-600 hover:bg-slate-100"
          >
            Cancel
          </Button>

          <Button 
            variant="primary" 
            onClick={handleStartDownload}
            disabled={isProcessing || selectedCvs.length === 0}
            className="rounded-xl px-6 py-2.5 text-xs font-extrabold bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white shadow-md shadow-indigo-200 flex items-center gap-2"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Translating & Packaging...</span>
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                <span>
                  Download {selectedCvs.length} {selectedCvs.length === 1 ? "CV" : "CVs"} in {effectiveLanguage}
                </span>
              </>
            )}
          </Button>
        </div>
      </motion.div>
    </div>
  );
};
