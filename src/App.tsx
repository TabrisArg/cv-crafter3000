import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { diffWords } from "diff";
import { 
  Plus, 
  FileText, 
  Layout, 
  Download, 
  Save, 
  Trash2, 
  ChevronRight, 
  Briefcase, 
  GraduationCap, 
  User, 
  Wand2, 
  LogOut,
  Settings,
  Eye,
  Edit3,
  CheckCircle2,
  Sparkles,
  FileUp,
  X,
  AlertCircle,
  Copy,
  RefreshCw,
  Check,
  Scan,
  Target,
  Languages,
  CheckSquare,
  Square,
  GripVertical,
  ChevronUp,
  ChevronDown
} from "lucide-react";
import { ATSScanner } from "./components/ATSScanner";
import { UnauthorizedDomainModal } from "./components/UnauthorizedDomainModal";
import { AuthModal } from "./components/AuthModal";
import { CoverLetterModal } from "./components/CoverLetterModal";
import { TranslateDownloadModal } from "./components/TranslateDownloadModal";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { generateCVFromText, optimizeCVForJob, adaptCVForRole, type CVData, generateCVFromMultimodal, translateCV, identifyMissingSkills, type MissingSkill, normalizeCVData, repairBrokenMarkdown } from "./lib/gemini";
import mammoth from "mammoth";
import { exportToSelectablePDF, exportForPlatforms, tokenizeMarkdown, stripMarkdown, type MarkdownToken } from "./lib/pdfExport";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import ReactMarkdown from "react-markdown";
import { auth, db, loginWithGoogle, logout, handleAuthRedirectResult, type AppUser, type FirebaseUser, handleFirestoreError, OperationType } from "./lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, setDoc, collection, query, where, onSnapshot, deleteDoc } from "firebase/firestore";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---

interface CV {
  id: string;
  title: string;
  content: CVData;
  template: string;
  updated_at: string;
  parent_id?: string;
  userId?: string;
}

interface UserProfile {
  id: string;
  email: string;
  name: string;
  picture?: string;
}

const BACKEND_URL = ""; // Use relative paths for Netlify proxying
console.log(`[DEBUG] Backend URL: ${BACKEND_URL || "Relative (Netlify Proxy)"}`);

const renderTokens = (tokens: MarkdownToken[], darkTheme = false) => {
  return tokens.map((token, i) => {
    if (token.bold && token.italic) {
      return (
        <strong key={i} className={cn("font-bold italic", darkTheme ? "text-white shadow-sm" : "text-slate-900")}>
          {token.text}
        </strong>
      );
    }
    if (token.bold) {
      return (
        <strong key={i} className={cn("font-bold", darkTheme ? "text-white shadow-sm" : "text-slate-900")}>
          {token.text}
        </strong>
      );
    }
    if (token.italic) {
      return (
        <em key={i} className={cn("italic", darkTheme ? "text-slate-200" : "text-slate-800")}>
          {token.text}
        </em>
      );
    }
    if (token.code) {
      return (
        <code key={i} className={cn("font-mono text-xs px-1 py-0.5 rounded", darkTheme ? "bg-slate-800 text-slate-100" : "bg-slate-100 text-slate-800")}>
          {token.text}
        </code>
      );
    }
    if (token.strikethrough) {
      return <span key={i} className="line-through">{token.text}</span>;
    }
    if (token.link) {
      return (
        <a key={i} href={token.link} target="_blank" rel="noopener noreferrer" className={cn("underline", darkTheme ? "text-indigo-300" : "text-indigo-600")}>
          {token.text}
        </a>
      );
    }
    return <span key={i}>{token.text}</span>;
  });
};

const renderInlineMarkdown = (str: string, darkTheme = false) => {
  if (!str) return null;
  const tokens = tokenizeMarkdown(str);
  return renderTokens(tokens, darkTheme);
};

const DiffText = ({ oldText, newText, className }: { oldText?: string, newText?: string, className?: string }) => {
  if (!newText) return null;

  const newTokens = tokenizeMarkdown(newText);
  const plainNew = newTokens.map((t) => t.text).join("");

  // If oldText is undefined, we are not in diff mode, just render normally
  if (oldText === undefined) {
    return (
      <span className={className}>
        {renderTokens(newTokens)}
      </span>
    );
  }

  const oldTokens = tokenizeMarkdown(oldText);
  const plainOld = oldTokens.map((t) => t.text).join("");

  // Case 1: Pure Addition (Entirely new block in diff mode)
  if (!plainOld.trim()) {
    return (
      <span className={cn("relative group inline", className)}>
        <span className="text-emerald-600 bg-emerald-50/90 rounded px-1 border border-emerald-200 italic inline font-medium">
          {renderTokens(newTokens)}
        </span>
        <span className="absolute bottom-full left-0 mb-2 hidden group-hover:block bg-slate-900 text-white text-[11px] p-3 rounded-xl shadow-2xl z-50 min-w-[180px] border border-slate-700 ring-4 ring-black/10">
          <span className="flex items-center gap-2 text-emerald-400 uppercase font-black tracking-widest text-[9px]">
            <Sparkles className="w-3.5 h-3.5" />
            <span>New Addition</span>
          </span>
          <span className="block mt-1 text-slate-300">This content was added to better match the job requirements.</span>
          <span className="absolute -bottom-1.5 left-6 w-3 h-3 bg-slate-900 rotate-45 border-r border-b border-slate-700" />
        </span>
      </span>
    );
  }

  // Case 2: No structural text change (ignoring markdown formatting differences)
  if (plainOld.trim().toLowerCase() === plainNew.trim().toLowerCase()) {
    return (
      <span className={className}>
        {renderTokens(newTokens)}
      </span>
    );
  }
  
  // Case 3: Modification (Granular diff aligned with pre-tokenized markdown spans)
  const diff = diffWords(plainOld, plainNew);
  let tokenIdx = 0;
  let charOffset = 0;

  const takeTokensForLength = (length: number): MarkdownToken[] => {
    const subTokens: MarkdownToken[] = [];
    let remaining = length;
    while (remaining > 0 && tokenIdx < newTokens.length) {
      const current = newTokens[tokenIdx];
      const available = current.text.length - charOffset;
      const take = Math.min(remaining, available);
      if (take > 0) {
        subTokens.push({
          ...current,
          text: current.text.slice(charOffset, charOffset + take),
        });
      }
      remaining -= take;
      charOffset += take;
      if (charOffset >= current.text.length) {
        tokenIdx++;
        charOffset = 0;
      }
    }
    return subTokens;
  };
  
  return (
    <span className={cn("relative group inline", className)}>
      <span className="inline">
        {diff.map((part, index) => {
          if (part.removed) return null; // Don't show removed text in main view
          const subTokens = takeTokensForLength(part.value.length);

          if (part.added) {
            // Check if it's a modification (adjacent to a removal) or a pure addition within text
            const isModification = diff[index - 1]?.removed || diff[index + 1]?.removed;
            
            return (
              <span 
                key={index} 
                className={cn(
                  "rounded px-0.5 border italic font-medium mx-0.5 inline",
                  isModification 
                    ? "text-rose-600 bg-rose-50/90 border-rose-200" 
                    : "text-emerald-600 bg-emerald-50/90 border-emerald-200"
                )}
              >
                {renderTokens(subTokens)}
              </span>
            );
          }
          return <span key={index} className="inline">{renderTokens(subTokens)}</span>;
        })}
      </span>
      
      <span className="absolute bottom-full left-0 mb-2 hidden group-hover:block bg-slate-900 text-white text-[11px] p-4 rounded-2xl shadow-2xl z-50 min-w-[240px] max-w-sm border border-slate-700 ring-4 ring-black/10">
        <span className="flex items-center gap-2 mb-2 text-indigo-300 uppercase font-black tracking-widest text-[9px]">
          <FileText className="w-3.5 h-3.5" />
          <span>Original Version</span>
        </span>
        <span className="block leading-relaxed text-slate-100 font-medium">
          {renderTokens(oldTokens, true)}
        </span>
        <span className="absolute -bottom-1.5 left-6 w-3 h-3 bg-slate-900 rotate-45 border-r border-b border-slate-700" />
      </span>
    </span>
  );
};

const Button = ({ 
  children, 
  className, 
  variant = "primary", 
  size = "md", 
  ...props 
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { 
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
}) => {
  const variants = {
    primary: "bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm",
    secondary: "bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm",
    outline: "border border-slate-200 text-slate-700 hover:bg-slate-50",
    ghost: "text-slate-600 hover:bg-slate-100",
    danger: "bg-rose-500 text-white hover:bg-rose-600 shadow-sm",
  };
  const sizes = {
    sm: "px-3 py-1.5 text-xs",
    md: "px-4 py-2 text-sm",
    lg: "px-6 py-3 text-base",
  };

  return (
    <button 
      className={cn(
        "inline-flex items-center justify-center rounded-xl font-medium transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
};

const Input = ({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input 
    className={cn(
      "w-full px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all",
      className
    )}
    {...props}
  />
);

const TextArea = ({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea 
    className={cn(
      "w-full px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all min-h-[100px]",
      className
    )}
    {...props}
  />
);

// --- Templates ---

const ModernTemplate = ({ data, oldData }: { data: CVData, oldData?: CVData }) => (
  <div id="cv-preview" className="bg-white p-12 shadow-2xl min-h-[1100px] w-full max-w-[800px] mx-auto text-slate-800 font-sans">
    <header data-pdf-block className="border-b-2 border-indigo-600 pb-6 mb-8">
      <h1 className="text-4xl font-bold tracking-tight text-slate-900 leading-tight pt-1">
        <DiffText oldText={oldData?.personalInfo?.fullName} newText={data.personalInfo.fullName} />
      </h1>
      <div className="flex flex-wrap gap-4 mt-3 text-sm text-slate-500">
        <a href={`mailto:${data.personalInfo.email}`} className="hover:text-indigo-600 transition-colors">{data.personalInfo.email}</a>
        <span>{data.personalInfo.phone}</span>
        <span>{data.personalInfo.location}</span>
        {data.customLinks?.filter(link => link.position === "header" || (!link.position && data.linksPlacement === "header"))?.map((link, i) => (
          link.title && link.url && (
            <a key={i} href={link.url.startsWith('http') ? link.url : `https://${link.url}`} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">
              {link.title}
            </a>
          )
        ))}
      </div>
    </header>

    <section data-pdf-block className="mb-8">
      <h2 className="text-lg font-bold uppercase tracking-wider text-indigo-600 mb-3">Professional Summary</h2>
      <div className="text-sm leading-relaxed text-slate-600">
        <DiffText oldText={oldData?.summary} newText={data.summary} />
      </div>
    </section>

    <section className="mb-8">
      <h2 data-pdf-block className="text-lg font-bold uppercase tracking-wider text-indigo-600 mb-4">Experience</h2>
      <div className="space-y-6">
        {data.experience?.map((exp, i) => (
          <div key={i} data-pdf-block>
            <div className="flex justify-between items-baseline">
              <h3 className="font-bold text-slate-900">
                <DiffText oldText={oldData?.experience?.[i]?.position} newText={exp.position} />
              </h3>
              <span className="text-xs font-medium text-slate-400">{exp.startDate} — {exp.endDate}</span>
            </div>
            <div className="flex justify-between items-baseline mb-2">
              <span className="text-sm font-semibold text-slate-700">
                <DiffText oldText={oldData?.experience?.[i]?.company} newText={exp.company} />
              </span>
              <span className="text-xs text-slate-400">{exp.location}</span>
            </div>
            <ul className="space-y-2">
              {exp.highlights?.map((h, j) => (
                <li key={j} className="text-sm text-slate-600 leading-relaxed flex gap-3">
                  <span className="text-indigo-400 font-bold">•</span>
                  <div className="inline">
                    <DiffText oldText={oldData?.experience?.[i]?.highlights?.[j]} newText={h} />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>

    <div className="grid grid-cols-2 gap-8">
      <section data-pdf-block>
        <h2 className="text-lg font-bold uppercase tracking-wider text-indigo-600 mb-4">Education</h2>
        <div className="space-y-4">
          {data.education?.map((edu, i) => (
            <div key={i}>
              <h3 className="font-bold text-slate-900 text-sm">
                <DiffText oldText={oldData?.education?.[i]?.degree} newText={edu.degree} />
              </h3>
              <p className="text-sm text-slate-700">
                <DiffText oldText={oldData?.education?.[i]?.school} newText={edu.school} />
              </p>
              <p className="text-xs text-slate-400">{edu.graduationDate}</p>
            </div>
          ))}
        </div>
      </section>
      <section data-pdf-block>
        <h2 className="text-lg font-bold uppercase tracking-wider text-indigo-600 mb-4">Skills</h2>
        <div className="flex flex-wrap gap-2">
          {data.skills?.map((skill, i) => {
            const isNew = oldData && !oldData.skills?.includes(skill);
            return (
              <span 
                key={i} 
                className={cn(
                  "px-2 py-1 rounded text-xs font-medium transition-all",
                  isNew 
                    ? "bg-emerald-100 text-emerald-700 border border-emerald-200 italic shadow-sm" 
                    : "bg-slate-100 text-slate-700"
                )}
              >
                {skill}
                {isNew && <Sparkles className="w-3 h-3 inline ml-1 animate-pulse" />}
              </span>
            );
          })}
        </div>
      </section>
    </div>

    {data.customLinks?.some(link => link.position === "bottom" || (!link.position && data.linksPlacement === "bottom")) && (
      <section data-pdf-block className="mt-8 pt-8 border-t border-slate-100">
        <h2 className="text-lg font-bold uppercase tracking-wider text-indigo-600 mb-4">Links</h2>
        <div className="flex flex-wrap gap-6">
          {data.customLinks?.filter(link => link.position === "bottom" || (!link.position && data.linksPlacement === "bottom"))?.map((link, i) => (
            link.title && link.url && (
              <a key={i} href={link.url.startsWith('http') ? link.url : `https://${link.url}`} target="_blank" rel="noopener noreferrer" className="text-sm text-indigo-600 hover:underline font-medium">
                {link.title}
              </a>
            )
          ))}
        </div>
      </section>
    )}
  </div>
);

const MinimalTemplate = ({ data, oldData }: { data: CVData, oldData?: CVData }) => (
  <div id="cv-preview" className="bg-white p-16 shadow-2xl min-h-[1100px] w-full max-w-[800px] mx-auto text-slate-900 font-sans">
    <div data-pdf-block className="text-center mb-12">
      <h1 className="text-5xl font-light tracking-tighter mb-4 leading-tight pt-2">
        <DiffText oldText={oldData?.personalInfo?.fullName} newText={data.personalInfo.fullName} />
      </h1>
      <div className="flex justify-center flex-wrap gap-x-4 gap-y-2 text-xs uppercase tracking-widest text-slate-500">
        <a href={`mailto:${data.personalInfo.email}`} className="hover:text-indigo-600 transition-colors">{data.personalInfo.email}</a>
        <span>•</span>
        <span>{data.personalInfo.phone}</span>
        <span>•</span>
        <span>{data.personalInfo.location}</span>
        {data.customLinks?.filter(link => link.position === "header" || (!link.position && data.linksPlacement === "header"))?.map((link, i) => (
          link.title && link.url && (
            <React.Fragment key={i}>
              <span>•</span>
              <a href={link.url.startsWith('http') ? link.url : `https://${link.url}`} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">
                {link.title}
              </a>
            </React.Fragment>
          )
        ))}
      </div>
    </div>

    <div className="max-w-2xl mx-auto">
      <section data-pdf-block className="mb-12">
        <div className="italic text-lg text-slate-600 leading-relaxed text-center">
          <DiffText oldText={oldData?.summary} newText={data.summary} />
        </div>
      </section>

      <section className="mb-12">
        <h2 data-pdf-block className="text-xs font-bold uppercase tracking-[0.2em] border-b border-slate-200 pb-2 mb-6">Experience</h2>
        <div className="space-y-10">
          {data.experience?.map((exp, i) => (
            <div key={i} data-pdf-block>
              <div className="flex justify-between items-baseline mb-1">
                <h3 className="text-lg font-medium">
                  <DiffText oldText={oldData?.experience?.[i]?.company} newText={exp.company} />
                </h3>
                <span className="text-xs italic text-slate-400">{exp.startDate} — {exp.endDate}</span>
              </div>
              <p className="text-sm font-bold text-slate-500 mb-3 uppercase tracking-wide">
                <DiffText oldText={oldData?.experience?.[i]?.position} newText={exp.position} />
              </p>
              <ul className="space-y-2">
                {exp.highlights?.map((h, j) => (
                  <li key={j} className="text-sm text-slate-600 leading-relaxed flex gap-3">
                    <span className="text-slate-400 font-bold">•</span>
                    <div className="inline">
                      <DiffText oldText={oldData?.experience?.[i]?.highlights?.[j]} newText={h} />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-2 gap-12">
        <section data-pdf-block>
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] border-b border-slate-200 pb-2 mb-6">Education</h2>
          <div className="space-y-6">
            {data.education?.map((edu, i) => (
              <div key={i}>
                <h3 className="text-sm font-medium">
                  <DiffText oldText={oldData?.education?.[i]?.school} newText={edu.school} />
                </h3>
                <p className="text-xs text-slate-500">
                  <DiffText oldText={oldData?.education?.[i]?.degree} newText={edu.degree} />
                </p>
                <p className="text-[10px] italic text-slate-400">{edu.graduationDate}</p>
              </div>
            ))}
          </div>
        </section>
        <section data-pdf-block>
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] border-b border-slate-200 pb-2 mb-6">Expertise</h2>
          <div className="grid grid-cols-1 gap-y-1">
            {data.skills?.map((skill, i) => {
              const isNew = oldData && !oldData.skills?.includes(skill);
              return (
                <span 
                  key={i} 
                  className={cn(
                    "text-sm transition-all",
                    isNew ? "text-emerald-600 font-medium italic" : "text-slate-600"
                  )}
                >
                  {skill}
                  {isNew && <Sparkles className="w-3 h-3 inline ml-1 text-emerald-400" />}
                </span>
              );
            })}
          </div>
        </section>
      </div>

      {data.customLinks?.some(link => link.position === "bottom" || (!link.position && data.linksPlacement === "bottom")) && (
        <section data-pdf-block className="mt-12">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] border-b border-slate-200 pb-2 mb-6">Links</h2>
          <div className="flex flex-wrap gap-x-8 gap-y-3">
            {data.customLinks?.filter(link => link.position === "bottom" || (!link.position && data.linksPlacement === "bottom"))?.map((link, i) => (
              link.title && link.url && (
                <a key={i} href={link.url.startsWith('http') ? link.url : `https://${link.url}`} target="_blank" rel="noopener noreferrer" className="text-sm text-indigo-600 hover:underline">
                  {link.title}
                </a>
              )
            ))}
          </div>
        </section>
      )}
    </div>
  </div>
);

// --- Main App ---

const LOADING_MESSAGES = [
  "Reading your document...",
  "Performing high-fidelity OCR...",
  "Analyzing your professional experience...",
  "Scraping job requirements...",
  "Analyzing job description...",
  "Matching your skills to the role...",
  "Optimizing for ATS compatibility...",
  "Crafting a powerful summary...",
  "Polishing the final layout...",
  "Large files or URLs may take up to 3 minutes...",
  "Almost there, finalizing details..."
];

export default function App() {
  const [view, setView] = useState<"dashboard" | "editor" | "cv-list" | "ats-scanner">("dashboard");
  const [cvs, setCvs] = useState<CV[]>([]);
  const [user, setUser] = useState<AppUser | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [currentCv, setCurrentCv] = useState<CV | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [isIdentifyingSkills, setIsIdentifyingSkills] = useState(false);
  const [missingSkills, setMissingSkills] = useState<MissingSkill[]>([]);
  const [showSkillsModal, setShowSkillsModal] = useState(false);
  const [currentSkillIndex, setCurrentSkillIndex] = useState(0);
  const [confirmedSkills, setConfirmedSkills] = useState<Array<{ skill: string, placement: "skills" | string, company?: string, position?: string }>>([]);
  const [selectingExperienceFor, setSelectingExperienceFor] = useState<string | null>(null);

  const [rawText, setRawText] = useState("");
  const [jobDesc, setJobDesc] = useState("");
  const [jobUrl, setJobUrl] = useState("");
  const [targetRole, setTargetRole] = useState("");
  const [focusAreas, setFocusAreas] = useState("");
  const [optimizeTab, setOptimizeTab] = useState<"pivot" | "manual" | "link">("pivot");
  const [showJobModal, setShowJobModal] = useState(false);
  const [showCoverLetterModal, setShowCoverLetterModal] = useState(false);
  const [activeTemplate, setActiveTemplate] = useState("modern");
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [pendingOptimizedCv, setPendingOptimizedCv] = useState<CV | null>(null);
  const [isDiffMode, setIsDiffMode] = useState(false);
  const [showCompanyPosModal, setShowCompanyPosModal] = useState(false);
  const [pendingCvForNaming, setPendingCvForNaming] = useState<CV | null>(null);
  const [companyPosInput, setCompanyPosInput] = useState<{ company: string; position: string; baseCvTitle: string }>({
    company: "",
    position: "",
    baseCvTitle: ""
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showDomainModal, setShowDomainModal] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState<string>("English");
  const [isTranslating, setIsTranslating] = useState(false);
  const [toast, setToast] = useState<{ message: string, type: "success" | "error" } | null>(null);
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<{
    id: string;
    title: string;
    isBaseWithChildren?: boolean;
  } | null>(null);
  const [showMatchRateModal, setShowMatchRateModal] = useState(false);
  const [activeMatchRateCv, setActiveMatchRateCv] = useState<CV | null>(null);
  const [selectedCvIds, setSelectedCvIds] = useState<string[]>([]);
  const [showTranslateModal, setShowTranslateModal] = useState(false);
  const [translateTargetCvs, setTranslateTargetCvs] = useState<CV[]>([]);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  // Drag-and-drop state for editor sections
  const [draggedLinkIndex, setDraggedLinkIndex] = useState<number | null>(null);
  const [draggedExpIndex, setDraggedExpIndex] = useState<number | null>(null);
  const [draggedHighlight, setDraggedHighlight] = useState<{ expIndex: number; highlightIndex: number } | null>(null);
  const [draggedEduIndex, setDraggedEduIndex] = useState<number | null>(null);
  const [draggedSkillIndex, setDraggedSkillIndex] = useState<number | null>(null);

  const reorderList = <T,>(list: T[], from: number, to: number): T[] => {
    if (to < 0 || to >= list.length || from === to) return list;
    const next = [...list];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    return next;
  };

  const moveCustomLink = (from: number, to: number) => {
    if (!currentCv?.content.customLinks) return;
    const customLinks = reorderList(currentCv.content.customLinks, from, to);
    setCurrentCv({
      ...currentCv,
      content: { ...currentCv.content, customLinks }
    });
  };

  const moveExperience = (from: number, to: number) => {
    if (!currentCv?.content.experience) return;
    const experience = reorderList(currentCv.content.experience, from, to);
    setCurrentCv({
      ...currentCv,
      content: { ...currentCv.content, experience }
    });
  };

  const moveHighlight = (expIndex: number, from: number, to: number) => {
    if (!currentCv?.content.experience) return;
    const experience = [...currentCv.content.experience];
    if (!experience[expIndex]?.highlights) return;
    const highlights = reorderList(experience[expIndex].highlights, from, to);
    experience[expIndex] = { ...experience[expIndex], highlights };
    setCurrentCv({
      ...currentCv,
      content: { ...currentCv.content, experience }
    });
  };

  const moveEducation = (from: number, to: number) => {
    if (!currentCv?.content.education) return;
    const education = reorderList(currentCv.content.education, from, to);
    setCurrentCv({
      ...currentCv,
      content: { ...currentCv.content, education }
    });
  };

  const moveSkill = (from: number, to: number) => {
    if (!currentCv?.content.skills) return;
    const skills = reorderList(currentCv.content.skills, from, to);
    setCurrentCv({
      ...currentCv,
      content: { ...currentCv.content, skills }
    });
  };

  const toggleCvSelection = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedCvIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleSelectAllCvs = () => {
    if (selectedCvIds.length === cvs.length) {
      setSelectedCvIds([]);
    } else {
      setSelectedCvIds(cvs.map(c => c.id));
    }
  };

  const openTranslateModalForSelected = () => {
    if (selectedCvIds.length === 0) {
      showToast("Please select at least one CV using the checkboxes.", "error");
      return;
    }
    const targets = cvs.filter(c => selectedCvIds.includes(c.id));
    setTranslateTargetCvs(targets);
    setShowTranslateModal(true);
  };

  const openTranslateModalForSingle = (cv: CV, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setTranslateTargetCvs([cv]);
    setShowTranslateModal(true);
  };

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const copyToClipboardATS = () => {
    const data = isDiffMode && pendingOptimizedCv ? pendingOptimizedCv.content : currentCv?.content;
    if (!data) return;

    let text = `${data.personalInfo.fullName.toUpperCase()}\n`;
    text += `${data.personalInfo.email} | ${data.personalInfo.phone} | ${data.personalInfo.location}\n\n`;
    
    if (data.summary) {
      text += `PROFESSIONAL SUMMARY\n${stripMarkdown(data.summary)}\n\n`;
    }

    if (data.experience?.length > 0) {
      text += `PROFESSIONAL EXPERIENCE\n`;
      data.experience.forEach(exp => {
        text += `${stripMarkdown(exp.company)}\n`;
        text += `${stripMarkdown(exp.position)} | ${exp.startDate} - ${exp.endDate}\n`;
        if (exp.location) text += `${stripMarkdown(exp.location)}\n`;
        exp.highlights.forEach(h => {
          text += `- ${stripMarkdown(h)}\n`;
        });
        text += `\n`;
      });
    }

    if (data.education?.length > 0) {
      text += `EDUCATION\n`;
      data.education.forEach(edu => {
        text += `${stripMarkdown(edu.school)}\n`;
        text += `${stripMarkdown(edu.degree)} | ${edu.graduationDate}\n`;
        if (edu.location) text += `${stripMarkdown(edu.location)}\n`;
        text += `\n`;
      });
    }

    if (data.skills?.length > 0) {
      text += `SKILLS\n${data.skills.join(", ")}\n`;
    }

    navigator.clipboard.writeText(text).then(() => {
      showToast("ATS-friendly text copied to clipboard!");
    }).catch(err => {
      console.error("Failed to copy:", err);
      showToast("Failed to copy to clipboard", "error");
    });
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setShowExportMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (currentCv) {
      setActiveTemplate(currentCv.template || "modern");
    }
  }, [currentCv?.id]);

  const playChime = () => {
    const audio = new Audio("https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3");
    audio.volume = 0.5;
    audio.play().catch(e => console.log("Audio play failed", e));
  };

  useEffect(() => {
    let interval: any;
    if (isGenerating || isOptimizing) {
      let i = 0;
      setLoadingMessage(LOADING_MESSAGES[0]);
      interval = setInterval(() => {
        i = (i + 1) % LOADING_MESSAGES.length;
        setLoadingMessage(LOADING_MESSAGES[i]);
      }, 3000);
    } else {
      setLoadingMessage("");
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isGenerating, isOptimizing]);

  const generateId = () => {
    try {
      return crypto.randomUUID();
    } catch (e) {
      return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    }
  };

  useEffect(() => {
    handleAuthRedirectResult()
      .then((redirectUser) => {
        if (redirectUser) setUser(redirectUser);
      })
      .catch((err) => console.info("Redirect notice:", err));

    const unsubscribe = onAuthStateChanged(auth, (fbUser) => {
      if (fbUser) {
        setUser({
          uid: fbUser.uid,
          displayName: fbUser.displayName || fbUser.email?.split('@')[0] || "User",
          email: fbUser.email,
          photoURL: fbUser.photoURL || "",
        });
      } else {
        setUser(null);
      }
      setIsAuthReady(true);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    
    const setupCvs = async () => {
      if (isAuthReady) {
        // Always load from local storage first for instant response
        const localCvsStr = localStorage.getItem("cv_crafter_cvs");
        let localCvs: CV[] = [];
        if (localCvsStr) {
          try {
            localCvs = JSON.parse(localCvsStr).map((c: CV) => ({ ...c, content: normalizeCVData(c.content) }));
            localCvs.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
            setCvs(localCvs);
          } catch (e) {
            console.error("Failed to parse local CVs:", e);
          }
        }

        if (user) {
          try {
            // Then sync with Firestore if logged in with Google
            const q = query(collection(db, "cvs"), where("userId", "==", user.uid));
            unsubscribe = onSnapshot(q, (snapshot) => {
              const firestoreCvs = snapshot.docs.map(doc => {
                const c = doc.data() as CV;
                return { ...c, content: normalizeCVData(c.content) };
              });
              firestoreCvs.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
              
              setCvs(() => {
                const localCvsRaw = localStorage.getItem("cv_crafter_cvs");
                let localCvsList: CV[] = [];
                if (localCvsRaw) {
                  try {
                    localCvsList = JSON.parse(localCvsRaw).map((c: CV) => ({ ...c, content: normalizeCVData(c.content) }));
                  } catch (e) {
                    console.error("Failed to parse local storage in sync:", e);
                  }
                }
                
                const firestoreIds = new Set(firestoreCvs.map(f => f.id));
                // Only keep local items if they were not deleted from local storage and not already in Firestore
                const remainingLocal = localCvsList.filter(l => !l.userId && !firestoreIds.has(l.id));
                
                const finalCvs = [...firestoreCvs, ...remainingLocal].sort(
                  (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
                );
                
                localStorage.setItem("cv_crafter_cvs", JSON.stringify(finalCvs));
                return finalCvs;
              });
            }, (error) => {
              console.info("Firestore listener notice (using local storage):", error?.message);
            });
          } catch (e) {
            console.info("Firestore setup notice:", e);
          }
        }
      }
    };

    setupCvs();

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [isAuthReady, user?.uid]);

  const saveCvsLocally = async (updatedCvs: CV[]) => {
    localStorage.setItem("cv_crafter_cvs", JSON.stringify(updatedCvs));
    setCvs(updatedCvs);
  };

  const saveCvToFirestore = async (cv: CV) => {
    if (user) {
      const cvToSave = { ...cv, userId: user.uid };
      try {
        await setDoc(doc(db, "cvs", cv.id), cvToSave);
        return true;
      } catch (error) {
        console.info("Firestore save fallback to local storage:", error);
        return false;
      }
    }
    return false;
  };

  const handleLogin = async () => {
    try {
      const loggedUser = await loginWithGoogle();
      setUser(loggedUser);
      showToast(`Welcome, ${loggedUser.displayName || 'User'}!`);
    } catch (err: any) {
      console.error("[Auth] Google Login Error:", err);
      setUser(null);
      if (err?.code === "auth/unauthorized-domain" || (err?.message && err.message.includes("unauthorized-domain"))) {
        setShowDomainModal(true);
        showToast("Domain requires authorization in Firebase Console", "error");
      } else if (err?.code === "auth/popup-blocked") {
        setShowDomainModal(true);
        showToast("Login popup was blocked by browser", "error");
      } else if (err?.code === "auth/popup-closed-by-user") {
        showToast("Sign-in popup was closed", "error");
      } else {
        showToast(err?.message || "Google sign-in failed", "error");
      }
    }
  };

  const handleConfirmCompanyPosition = () => {
    if (!pendingCvForNaming) return;
    const comp = companyPosInput.company.trim();
    const pos = companyPosInput.position.trim();
    if (!comp || !pos) return;

    const finalTitle = `${comp} - ${pos} - ${companyPosInput.baseCvTitle}`;
    const finalCv: CV = {
      ...pendingCvForNaming,
      title: finalTitle
    };

    setPendingOptimizedCv(finalCv);
    setPendingCvForNaming(null);
    setShowCompanyPosModal(false);
    setIsDiffMode(true);
    setJobDesc("");
    setJobUrl("");
  };

  const renderModals = () => (
    <>
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        showToast={showToast}
        onSuccess={(loggedUser) => {
          setUser(loggedUser);
          setShowAuthModal(false);
        }}
      />

      <UnauthorizedDomainModal
        isOpen={showDomainModal}
        onClose={() => setShowDomainModal(false)}
        onContinueGuest={() => {
          setShowDomainModal(false);
          showToast("Continuing in Guest Mode using local storage persistence.");
        }}
        showToast={showToast}
      />

      {/* Modal for Prompting Missing Target Company & Position */}
      <AnimatePresence>
        {showCompanyPosModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
              onClick={() => setShowCompanyPosModal(false)}
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl overflow-hidden border border-slate-100"
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
                    <Briefcase className="text-indigo-600 w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">Name Optimized CV</h2>
                    <p className="text-slate-500 text-xs">Specify target company & position</p>
                  </div>
                </div>
                <button onClick={() => setShowCompanyPosModal(false)} className="text-slate-400 hover:text-slate-600">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <p className="text-xs text-slate-600 mb-5 leading-relaxed">
                Could not automatically detect both the target company and position name. Please provide them to name your optimized CV.
              </p>

              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Target Company Name <span className="text-rose-500">*</span>
                  </label>
                  <Input 
                    placeholder="e.g. Fishlabs GmbH, Google" 
                    value={companyPosInput.company}
                    onChange={(e) => setCompanyPosInput(prev => ({ ...prev, company: e.target.value }))}
                    className="h-11 rounded-xl"
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Target Position Name <span className="text-rose-500">*</span>
                  </label>
                  <Input 
                    placeholder="e.g. Senior Producer, Product Manager" 
                    value={companyPosInput.position}
                    onChange={(e) => setCompanyPosInput(prev => ({ ...prev, position: e.target.value }))}
                    className="h-11 rounded-xl"
                  />
                </div>

                {companyPosInput.company.trim() && companyPosInput.position.trim() && (
                  <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-xl text-xs">
                    <span className="font-bold text-indigo-700 block mb-0.5">Title Preview:</span>
                    <span className="font-medium text-slate-800 break-words">
                      {companyPosInput.company.trim()} - {companyPosInput.position.trim()} - {companyPosInput.baseCvTitle}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex gap-3">
                <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setShowCompanyPosModal(false)}>
                  Cancel
                </Button>
                <Button 
                  variant="primary" 
                  className="flex-1 rounded-xl"
                  disabled={!companyPosInput.company.trim() || !companyPosInput.position.trim()}
                  onClick={handleConfirmCompanyPosition}
                >
                  Confirm & Save
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Custom Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteConfirmTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
              onClick={() => setDeleteConfirmTarget(null)}
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              className="relative bg-white rounded-3xl p-6 md:p-8 max-w-md w-full shadow-2xl border border-slate-100 flex flex-col gap-6 z-10"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-rose-100 flex items-center justify-center shrink-0">
                  <Trash2 className="w-6 h-6 text-rose-600" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-900 leading-tight">Delete Resume</h3>
                  <p className="text-xs text-slate-500 font-medium">This action cannot be undone.</p>
                </div>
              </div>

              <p className="text-sm text-slate-600 leading-relaxed">
                Are you sure you want to delete <strong className="text-slate-900">"{deleteConfirmTarget.title}"</strong>
                {deleteConfirmTarget.isBaseWithChildren ? (
                  <span className="text-rose-600 font-semibold"> and all its optimized versions</span>
                ) : null}
                ?
              </p>

              <div className="flex items-center justify-end gap-3 pt-2">
                <Button 
                  variant="outline" 
                  onClick={() => setDeleteConfirmTarget(null)}
                  className="rounded-xl px-5 py-2 text-slate-600 hover:bg-slate-100 font-semibold"
                >
                  Cancel
                </Button>
                <Button 
                  variant="primary" 
                  onClick={() => {
                    const targetId = deleteConfirmTarget.id;
                    setDeleteConfirmTarget(null);
                    handleDelete(targetId);
                  }}
                  className="bg-rose-600 hover:bg-rose-700 text-white rounded-xl px-5 py-2 font-semibold shadow-lg shadow-rose-200"
                >
                  Delete
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Job Match Analysis Modal */}
      <AnimatePresence>
        {showMatchRateModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
              onClick={() => setShowMatchRateModal(false)}
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              className="relative bg-white rounded-3xl p-6 md:p-8 max-w-lg w-full shadow-2xl border border-slate-100 flex flex-col gap-6 z-10 overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center shrink-0">
                    <Target className="w-6 h-6 text-indigo-600" />
                  </div>
                  <div>
                    <h3 className="text-xl font-extrabold text-slate-900 leading-tight">Job Match Score & Analysis</h3>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">
                      {activeMatchRateCv?.content.targetPosition || activeMatchRateCv?.content.targetCompany ? (
                        <span className="text-indigo-600 font-semibold">
                          {[activeMatchRateCv?.content.targetPosition, activeMatchRateCv?.content.targetCompany].filter(Boolean).join(" @ ")}
                        </span>
                      ) : (
                        <span>Real-time evaluation against target job requirements</span>
                      )}
                    </p>
                  </div>
                </div>
                <button onClick={() => setShowMatchRateModal(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-xl">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Score comparison grid */}
              {(() => {
                const targetCv = activeMatchRateCv || currentCv;
                const matchData = targetCv?.content.matchRate;
                if (!matchData) {
                  return (
                    <div className="p-6 bg-slate-50 border border-dashed border-slate-200 rounded-2xl text-center">
                      <Target className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                      <p className="text-xs font-bold text-slate-500">No Job Match Score Available</p>
                      <p className="text-[11px] text-slate-400 mt-1 max-w-xs mx-auto">Tailor this CV to a job posting to generate an uninflated match score analysis.</p>
                      <Button 
                        size="sm"
                        className="mt-4 rounded-xl bg-indigo-600 text-white font-bold text-xs px-4"
                        onClick={() => {
                          setShowMatchRateModal(false);
                          setShowJobModal(true);
                        }}
                      >
                        Tailor for Job Now
                      </Button>
                    </div>
                  );
                }

                const scoreColor = matchData.optimized >= 8 
                  ? "emerald" 
                  : matchData.optimized >= 5 
                  ? "amber" 
                  : "rose";

                return (
                  <div className="space-y-5">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 flex flex-col items-center justify-center text-center">
                        <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-1">Original CV Fit</span>
                        <div className="flex items-baseline gap-1">
                          <span className="text-3xl font-black text-slate-500">{matchData.original}</span>
                          <span className="text-xs font-bold text-slate-400">/ 10</span>
                        </div>
                        <span className="text-[10px] font-medium text-slate-400 mt-1">Before tailoring</span>
                      </div>

                      <div className={cn(
                        "border rounded-2xl p-4 flex flex-col items-center justify-center text-center relative overflow-hidden",
                        scoreColor === "emerald" ? "bg-emerald-50/70 border-emerald-200 text-emerald-950" :
                        scoreColor === "amber" ? "bg-amber-50/70 border-amber-200 text-amber-950" :
                        "bg-rose-50/70 border-rose-200 text-rose-950"
                      )}>
                        <Sparkles className={cn(
                          "w-4 h-4 absolute top-2 right-2",
                          scoreColor === "emerald" ? "text-emerald-500" :
                          scoreColor === "amber" ? "text-amber-500" : "text-rose-500"
                        )} />
                        <span className="text-[10px] font-extrabold uppercase tracking-wider opacity-70 mb-1">Tailored Match Score</span>
                        <div className="flex items-baseline gap-1">
                          <span className={cn(
                            "text-3xl font-black",
                            scoreColor === "emerald" ? "text-emerald-600" :
                            scoreColor === "amber" ? "text-amber-600" : "text-rose-600"
                          )}>
                            {matchData.optimized}
                          </span>
                          <span className="text-xs font-bold opacity-60">/ 10</span>
                        </div>
                        <span className="text-[10px] font-bold mt-1">
                          {scoreColor === "emerald" ? "Strong Fit" : scoreColor === "amber" ? "Moderate Fit" : "Gaps Remain"}
                        </span>
                      </div>
                    </div>

                    {/* Honest Feedback Box */}
                    <div className="bg-slate-900 text-slate-100 rounded-2xl p-4 border border-slate-800 space-y-2">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span className="text-xs font-bold text-white uppercase tracking-wider">Uninflated Evaluation & Gap Analysis</span>
                      </div>
                      <p className="text-xs leading-relaxed text-slate-300">
                        {matchData.explanation}
                      </p>
                    </div>

                    <div className="flex items-center justify-between pt-2">
                      <Button 
                        variant="outline" 
                        onClick={() => setShowMatchRateModal(false)}
                        className="rounded-xl px-5 py-2 text-slate-600 hover:bg-slate-100 font-semibold text-xs"
                      >
                        Close
                      </Button>
                      <Button 
                        variant="primary" 
                        onClick={() => {
                          setShowMatchRateModal(false);
                          setShowJobModal(true);
                        }}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl px-5 py-2 font-bold text-xs shadow-md shadow-indigo-100 flex items-center gap-2"
                      >
                        <Wand2 className="w-4 h-4" />
                        Re-Tailor for Job
                      </Button>
                    </div>
                  </div>
                );
              })()}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {showCoverLetterModal && currentCv && (
        <CoverLetterModal
          isOpen={showCoverLetterModal}
          onClose={() => setShowCoverLetterModal(false)}
          cv={currentCv.content}
          showToast={showToast}
        />
      )}

      <TranslateDownloadModal
        isOpen={showTranslateModal}
        onClose={() => setShowTranslateModal(false)}
        selectedCvs={translateTargetCvs}
        onRemoveCvFromSelection={(id) => {
          setTranslateTargetCvs(prev => prev.filter(c => c.id !== id));
          setSelectedCvIds(prev => prev.filter(item => item !== id));
        }}
        showToast={showToast}
        defaultTemplate={activeTemplate}
      />
    </>
  );

  const handleLogout = async () => {
    try {
      if (view === "editor" && currentCv) {
        await handleSave();
      }
      await logout();
      setUser(null);
      showToast("Logged out successfully!");
      setView("dashboard");
      setCurrentCv(null);
    } catch (err) {
      setUser(null);
      showToast("Logged out successfully");
    }
  };

  const handleCreateNew = async () => {
    const newCv: CV = {
      id: generateId(),
      title: "Untitled CV",
      content: {
        personalInfo: { fullName: "", email: "", phone: "", location: "" },
        summary: "",
        experience: [],
        education: [],
        skills: [],
      },
      template: "modern",
      updated_at: new Date().toISOString(),
      userId: user?.uid
    };
    
    if (user) {
      await saveCvToFirestore(newCv);
    }
    
    // Always update local state for immediate feedback
    const updatedCvs = [newCv, ...cvs];
    await saveCvsLocally(updatedCvs);
    
    setCurrentCv(newCv);
    setView("editor");
  };

  const handleOpenInEditor = async (cvContent: CVData, title: string = "Scanned CV") => {
    const newCv: CV = {
      id: generateId(),
      title,
      content: cvContent,
      template: "modern",
      updated_at: new Date().toISOString(),
      userId: user?.uid
    };
    if (user) {
      await saveCvToFirestore(newCv);
    }
    const updatedCvs = [newCv, ...cvs];
    await saveCvsLocally(updatedCvs);
    setCurrentCv(newCv);
    setView("editor");
  };

  const handleGenerate = async () => {
    if (isGenerating || (!rawText.trim() && !uploadedFile)) return;
    
    setIsGenerating(true);
    setError(null);
    console.log("Starting CV generation process...");
    
    try {
      let content: CVData;
      
      if (uploadedFile) {
        if (uploadedFile.size > 15 * 1024 * 1024) {
          throw new Error("File is too large (max 15MB). Please try a smaller file or paste the text manually.");
        }
        
        const fileType = uploadedFile.type;
        const fileName = uploadedFile.name.toLowerCase();
        
        if (fileName.endsWith(".txt")) {
          const text = await uploadedFile.text();
          content = await generateCVFromText(text);
        } else if (fileName.endsWith(".docx") || fileName.endsWith(".doc")) {
          const arrayBuffer = await uploadedFile.arrayBuffer();
          const result = await mammoth.extractRawText({ arrayBuffer });
          content = await generateCVFromText(result.value);
        } else {
          // Handle PDF, Images, etc. via Multimodal Gemini
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              const result = reader.result as string;
              resolve(result.split(",")[1]);
            };
            reader.onerror = () => reject(new Error("Failed to read the uploaded file."));
            reader.readAsDataURL(uploadedFile);
          });
          
          content = await generateCVFromMultimodal([
            {
              inlineData: {
                data: base64,
                mimeType: fileType || "application/pdf"
              }
            }
          ]);
        }
      } else {
        content = await generateCVFromText(rawText);
      }

      console.log("CV generation successful");
      
      const newCv: CV = {
        id: generateId(),
        title: content.personalInfo?.fullName || "Untitled CV",
        content,
        template: "modern",
        updated_at: new Date().toISOString(),
        userId: user?.uid
      };
      
      if (user) {
        const savedToCloud = await saveCvToFirestore(newCv);
        if (!savedToCloud) {
          showToast("Saved locally (Cloud sync failed)", "error");
        } else {
          showToast("CV saved to cloud!");
        }
      }
      
      // Always update local state for immediate feedback
      const updatedCvs = [newCv, ...cvs];
      await saveCvsLocally(updatedCvs);
      
      playChime();

      setCurrentCv(newCv);
      setView("editor");
      setRawText("");
      setUploadedFile(null);
    } catch (err: any) {
      console.error("CV Generation failed:", err);
      setError(err.message || "An unexpected error occurred. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const resolveCompanyAndPosition = (optimized: CVData, jobDescText: string, jobUrlText: string) => {
    let company = (optimized.targetCompany || "").trim();
    let position = (optimized.targetPosition || "").trim();

    const isInvalid = (val: string) => {
      if (!val) return true;
      const lower = val.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (!lower) return true;
      return [
        "unknown", "na", "none", "company", "position", "targetcompany",
        "targetposition", "notprovided", "notspecified", "job", "role",
        "companyname", "positionname", "undefined", "null", "tbd"
      ].includes(lower);
    };

    if (isInvalid(company)) company = "";
    if (isInvalid(position)) position = "";

    // Fallback 1: suggestedTitle (e.g., "Senior Producer - Fishlabs GmbH" or "Senior Producer at Fishlabs GmbH")
    if ((!company || !position) && optimized.suggestedTitle) {
      const parts = optimized.suggestedTitle.split(/\s+at\s+|\s+-\s+/i);
      if (parts.length >= 2) {
        if (!position && !isInvalid(parts[0])) position = parts[0].trim();
        if (!company && !isInvalid(parts[1])) company = parts[1].trim();
      }
    }

    // Fallback 2: jobUrl parsing
    if ((!company || !position) && jobUrlText) {
      const match = jobUrlText.match(/(?:view|jobs)\/([a-z0-9\-]+)/i);
      if (match && match[1]) {
        const parts = match[1].split("-at-");
        if (parts.length === 2) {
          if (!position && !isInvalid(parts[0])) position = parts[0].replace(/-/g, " ").replace(/\b\w/g, l => l.toUpperCase()).trim();
          if (!company && !isInvalid(parts[1])) company = parts[1].replace(/-/g, " ").replace(/\b\w/g, l => l.toUpperCase()).trim();
        }
      }
    }

    return { company, position };
  };

  const runFinalOptimization = async (additionalSkills: Array<{ skill: string, placement: "skills" | string, company?: string, position?: string }>) => {
    if (!currentCv) return;
    setIsOptimizing(true);
    setError(null);
    try {
      let optimized: CVData;
      if (optimizeTab === "pivot") {
        optimized = await adaptCVForRole(
          currentCv.content,
          targetRole.trim(),
          focusAreas.trim() || undefined,
          additionalSkills
        );
      } else {
        optimized = await optimizeCVForJob(
          currentCv.content, 
          jobDesc, 
          optimizeTab === "link" ? jobUrl : undefined,
          additionalSkills
        );
      }
      
      // Force preserve ALL original custom links
      const originalLinks = currentCv.content.customLinks || [];
      const aiLinks = optimized.customLinks || [];
      
      // Merge: keep original links and add any new ones the AI might have found
      const mergedLinks = [...originalLinks];
      aiLinks.forEach(aiLink => {
        // Only add if URL is truly new
        if (!mergedLinks.some(l => l.url?.toLowerCase() === aiLink.url?.toLowerCase())) {
          mergedLinks.push({
            ...aiLink,
            position: aiLink.position || currentCv.content.linksPlacement || "header"
          });
        }
      });
      
      optimized.customLinks = mergedLinks;
      optimized.linksPlacement = currentCv.content.linksPlacement || "header";

      // Root Base CV Title
      let baseCvTitle = currentCv.title;
      if (currentCv.parent_id) {
        const rootCv = cvs.find(c => c.id === currentCv.parent_id);
        if (rootCv && rootCv.title) {
          baseCvTitle = rootCv.title;
        }
      }

      const newCv: CV = {
        id: generateId(),
        title: "",
        content: optimized,
        template: currentCv.template,
        updated_at: new Date().toISOString(),
        parent_id: currentCv.parent_id || currentCv.id, // Link to the base CV
        userId: user?.uid
      };
      
      if (optimizeTab === "pivot") {
        newCv.title = `${targetRole.trim()} - Pivot - ${baseCvTitle}`;
        setPendingOptimizedCv(newCv);
        setIsDiffMode(true);
        setShowJobModal(false);
        setShowSkillsModal(false);
        playChime();
      } else {
        const { company, position } = resolveCompanyAndPosition(
          optimized,
          jobDesc,
          optimizeTab === "link" ? jobUrl : ""
        );

        if (company && position) {
          newCv.title = `${company} - ${position} - ${baseCvTitle}`;
          setPendingOptimizedCv(newCv);
          setIsDiffMode(true);
          setShowJobModal(false);
          setShowSkillsModal(false);
          setJobDesc("");
          setJobUrl("");
          playChime();
        } else {
          // Ask user for company and/or position
          setPendingCvForNaming(newCv);
          setCompanyPosInput({
            company: company || "",
            position: position || "",
            baseCvTitle
          });
          setShowCompanyPosModal(true);
          setShowJobModal(false);
          setShowSkillsModal(false);
          playChime();
        }
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to adapt CV. Please try again.");
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleOptimize = async () => {
    if (!currentCv) return;
    if (optimizeTab === "pivot" && !targetRole.trim()) return;
    if (optimizeTab === "manual" && !jobDesc.trim()) return;
    if (optimizeTab === "link" && !jobUrl.trim()) return;
    
    setIsIdentifyingSkills(true);
    setError(null);
    try {
      const missing = await identifyMissingSkills(
        currentCv.content,
        optimizeTab === "pivot" ? focusAreas : jobDesc,
        optimizeTab === "link" ? jobUrl : undefined,
        optimizeTab === "pivot" ? targetRole : undefined
      );
      if (missing && missing.length > 0) {
        const uniqueMissing: MissingSkill[] = [];
        const seenNames = new Set<string>();
        missing.forEach((m) => {
          const norm = (m.skill || "").toLowerCase().trim();
          if (norm && !seenNames.has(norm)) {
            seenNames.add(norm);
            uniqueMissing.push(m);
          }
        });

        if (uniqueMissing.length > 0) {
          setMissingSkills(uniqueMissing);
          setCurrentSkillIndex(0);
          setConfirmedSkills([]);
          setShowSkillsModal(true);
          setShowJobModal(false);
        } else {
          await runFinalOptimization([]);
        }
      } else {
        // No missing skills, proceed to direct optimization
        await runFinalOptimization([]);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to analyze target competencies. Please try again.");
      // Fallback to standard optimization if identification fails
      await runFinalOptimization([]);
    } finally {
      setIsIdentifyingSkills(false);
    }
  };

  const handleCommitOptimization = async () => {
    if (!pendingOptimizedCv) return;
    setIsSaving(true);
    try {
      const updatedCvs = [pendingOptimizedCv, ...cvs.filter(c => c.id !== pendingOptimizedCv.id)];
      await saveCvsLocally(updatedCvs);
      if (user) {
        await saveCvToFirestore(pendingOptimizedCv);
      }
      
      setCurrentCv(pendingOptimizedCv);
      setPendingOptimizedCv(null);
      setIsDiffMode(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error(err);
      setError("Failed to save optimized CV.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDiscardOptimization = () => {
    setPendingOptimizedCv(null);
    setIsDiffMode(false);
  };

  // Auto-save effect
  useEffect(() => {
    if (!currentCv || view !== "editor") return;

    const timer = setTimeout(async () => {
      setIsSaving(true);
      try {
        const now = new Date().toISOString();
        const cvToSave = { ...currentCv, updated_at: now, userId: user?.uid };
        
        let success = false;
        if (user) {
          success = await saveCvToFirestore(cvToSave);
        }
        
        // Always save locally as a backup/cache
        const updatedCvs = [...cvs];
        const index = updatedCvs.findIndex(c => c.id === cvToSave.id);
        if (index >= 0) {
          updatedCvs[index] = cvToSave;
        } else {
          updatedCvs.unshift(cvToSave);
        }
        await saveCvsLocally(updatedCvs);
        
        if (!user || success) {
          setSaveSuccess(true);
          setTimeout(() => setSaveSuccess(false), 2000);
        } else {
          showToast("Cloud save failed, work cached locally", "error");
        }
      } catch (err) {
        console.error("Auto-save failed:", err);
      } finally {
        setIsSaving(false);
      }
    }, 2000); // 2 second debounce

    return () => clearTimeout(timer);
  }, [currentCv?.content, currentCv?.title, currentCv?.template, user?.uid]);

  const handleSave = async () => {
    if (!currentCv) return;
    setIsSaving(true);
    try {
      const now = new Date().toISOString();
      const cvToSave = { ...currentCv, updated_at: now, userId: user?.uid };
      
      let success = false;
      if (user) {
        success = await saveCvToFirestore(cvToSave);
      }
      
      // Always save locally as a backup/cache
      const updatedCvs = [...cvs];
      const index = updatedCvs.findIndex(c => c.id === cvToSave.id);
      if (index >= 0) {
        updatedCvs[index] = cvToSave;
      } else {
        updatedCvs.unshift(cvToSave);
      }
      await saveCvsLocally(updatedCvs);
      
      setCurrentCv(cvToSave);
      
      if (!user || success) {
        setSaveSuccess(true);
        showToast("CV saved successfully", "success");
        setTimeout(() => setSaveSuccess(false), 3000);
      } else {
        showToast("Cloud save failed, work cached locally", "error");
      }
    } catch (err) {
      console.error("Manual save failed:", err);
      setError("Failed to save CV.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    // Collect ID to delete and any child optimized CVs linked to it
    const idsToDelete = [id, ...cvs.filter(c => c.parent_id === id).map(c => c.id)];
    const updatedCvs = cvs.filter(c => !idsToDelete.includes(c.id));
    
    // Save updated list locally first
    await saveCvsLocally(updatedCvs);
    
    // Reset currentCv if it was one of the deleted items
    if (currentCv && idsToDelete.includes(currentCv.id)) {
      const remaining = updatedCvs.find(c => !c.parent_id) || updatedCvs[0] || null;
      setCurrentCv(remaining);
      if (!remaining && view === "editor") {
        setView("dashboard");
      }
    }
    
    if (user) {
      try {
        for (const deleteId of idsToDelete) {
          try {
            await deleteDoc(doc(db, "cvs", deleteId));
          } catch (err) {
            console.warn(`Cloud doc ${deleteId} delete notice:`, err);
          }
        }
        showToast("CV deleted");
      } catch (error) {
        console.error("Failed to delete from cloud:", error);
        handleFirestoreError(error, OperationType.DELETE, `cvs/${id}`);
      }
    } else {
      showToast("CV deleted locally");
    }
  };

  const handleDownload = async (mode: "standard" | "platform" = "standard") => {
    let dataToExport = isDiffMode && pendingOptimizedCv ? pendingOptimizedCv.content : currentCv?.content;
    if (!dataToExport) return;

    if (selectedLanguage !== "English") {
      setIsTranslating(true);
      showToast(`Translating CV to ${selectedLanguage}...`);
      try {
        dataToExport = await translateCV(dataToExport, selectedLanguage);
      } catch (err: any) {
        showToast(err.message || "Translation failed", "error");
        setIsTranslating(false);
        return;
      } finally {
        setIsTranslating(false);
      }
    }
    
    // Construct a descriptive filename
    let filename = "";
    const name = dataToExport.personalInfo.fullName || "CV";
    
    if (dataToExport.suggestedTitle) {
      // Format: "John Doe - Software Engineer - Google"
      filename = `${name} - ${dataToExport.suggestedTitle}`;
    } else {
      // Fallback to CV title or default
      filename = isDiffMode && pendingOptimizedCv ? pendingOptimizedCv.title : currentCv?.title || name;
    }

    if (selectedLanguage !== "English") {
      filename = `${filename} (${selectedLanguage})`;
    }
    
    // Clean filename for OS compatibility (remove characters that are invalid in filenames)
    const cleanFilename = filename.replace(/[/\\?%*:|"<>]/g, '-').trim();
    
    if (mode === "platform") {
      exportForPlatforms(dataToExport, cleanFilename);
    } else {
      // Use the new selectable PDF export for ATS compatibility
      exportToSelectablePDF(dataToExport, cleanFilename, activeTemplate);
    }
  };

  if (view === "ats-scanner") {
    return (
      <>
        <ATSScanner
          cvs={cvs}
          currentCv={currentCv}
          onBack={() => setView(currentCv ? "editor" : "dashboard")}
          onOpenInEditor={(cvContent, title) => {
            if (currentCv) {
              setCurrentCv({ ...currentCv, content: cvContent, title: title || currentCv.title });
            }
            setView("editor");
          }}
          showToast={showToast}
        />
        {renderModals()}
      </>
    );
  }

  if (view === "cv-list") {
    return (
      <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
        <nav className="border-b border-slate-200 bg-white/80 backdrop-blur-md sticky top-0 z-10">
          <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="sm" onClick={() => setView("dashboard")}>
                <ChevronRight className="w-4 h-4 rotate-180 mr-2" />
                Back to Dashboard
              </Button>
              <div className="h-6 w-px bg-slate-200 mx-2" />
              <span className="font-bold text-xl tracking-tight">My Saved CVs</span>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 px-3 py-1 bg-indigo-50 rounded-full border border-indigo-100">
                <FileText className="w-4 h-4 text-indigo-600" />
                <span className="text-xs font-bold text-indigo-900">{cvs.length} Resumes</span>
              </div>
              {user ? (
                <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
                  <span className="text-xs font-bold text-slate-700 hidden sm:inline">{user.displayName}</span>
                  <Button variant="ghost" size="sm" onClick={handleLogout} className="text-xs text-rose-600 hover:bg-rose-50">
                    Logout
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Button 
                    variant="primary" 
                    size="sm" 
                    onClick={handleLogin} 
                    className="rounded-xl px-3.5 py-1.5 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs flex items-center gap-2"
                  >
                    <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                    </svg>
                    <span>Google Login</span>
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => setShowAuthModal(true)} 
                    className="rounded-xl px-3 py-1.5 text-xs font-bold border-slate-200 text-slate-700 hover:bg-slate-50"
                  >
                    Email
                  </Button>
                </div>
              )}
            </div>
          </div>
        </nav>

        <main className="max-w-7xl mx-auto px-6 py-12">
          <header className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-slate-200">
            <div>
              <h1 className="text-4xl font-black tracking-tight mb-2 text-slate-900">Your Resume Library</h1>
              <p className="text-slate-500 font-medium">Manage, edit, and export your CVs in any target language with 100% accuracy.</p>
            </div>

            {cvs.length > 0 && (
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleSelectAllCvs}
                  className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center gap-2 transition-all shadow-2xs"
                >
                  {selectedCvIds.length === cvs.length && cvs.length > 0 ? (
                    <CheckSquare className="w-4 h-4 text-indigo-600" />
                  ) : (
                    <Square className="w-4 h-4 text-slate-400" />
                  )}
                  <span>
                    {selectedCvIds.length === cvs.length && cvs.length > 0 ? "Deselect All" : `Select All (${cvs.length})`}
                  </span>
                </button>

                <Button
                  variant="primary"
                  size="sm"
                  onClick={openTranslateModalForSelected}
                  disabled={selectedCvIds.length === 0}
                  className="rounded-xl px-4 py-2 font-extrabold text-xs bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white shadow-md shadow-indigo-100 flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  <Languages className="w-4 h-4" />
                  <span>
                    Download Selected Translated {selectedCvIds.length > 0 ? `(${selectedCvIds.length})` : ""}
                  </span>
                </Button>
              </div>
            )}
          </header>

          <div className="space-y-20">
            {(() => {
              const baseCvs = cvs.filter(cv => !cv.parent_id || !cvs.some(c => c.id === cv.parent_id));
              
              if (baseCvs.length === 0 && cvs.length > 0) {
                // If we have CVs but no base CVs (orphans), treat them all as base CVs to avoid an empty library
                return cvs.map((cv) => {
                  const isSelected = selectedCvIds.includes(cv.id);
                  return (
                    <div key={cv.id} className="flex flex-col gap-8">
                      <div className="flex items-center gap-4">
                        <div className="h-px flex-1 bg-slate-200" />
                        <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">CV: {cv.content.personalInfo?.fullName || cv.title}</h2>
                        <div className="h-px flex-1 bg-slate-200" />
                      </div>
                      <div className="flex flex-col lg:flex-row gap-10 items-start">
                        <div className="w-full lg:w-[380px] shrink-0">
                          <motion.div 
                            whileHover={{ y: -4 }}
                            className={cn(
                              "bg-white border-2 rounded-3xl p-8 flex flex-col gap-6 shadow-xl hover:shadow-2xl transition-all relative overflow-hidden group",
                              isSelected ? "border-indigo-500 ring-2 ring-indigo-200 bg-indigo-50/15" : "border-indigo-100"
                            )}
                          >
                            <div className="flex justify-between items-start">
                              <div className="flex items-center gap-3">
                                <button
                                  type="button"
                                  onClick={(e) => toggleCvSelection(cv.id, e)}
                                  className={cn(
                                    "w-8 h-8 rounded-xl border flex items-center justify-center transition-all",
                                    isSelected
                                      ? "bg-indigo-600 border-indigo-600 text-white shadow-xs"
                                      : "bg-white border-slate-300 text-transparent hover:border-indigo-400"
                                  )}
                                  title="Select CV for download or translation"
                                >
                                  <Check className="w-4 h-4 stroke-[3]" />
                                </button>
                                <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center shadow-inner group-hover:scale-110 transition-transform">
                                  <FileText className="text-indigo-600 w-6 h-6" />
                                </div>
                              </div>
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors" 
                                title="Delete CV"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleteConfirmTarget({
                                    id: cv.id,
                                    title: cv.title || "Untitled CV",
                                  });
                                }}
                              >
                                <Trash2 className="w-5 h-5 text-rose-500" />
                              </Button>
                            </div>
                            <div>
                              <h3 className="font-black text-2xl mb-2 tracking-tight text-slate-900 leading-tight">{cv.title}</h3>
                              <div className="flex items-center gap-2 text-slate-400">
                                <p className="text-xs font-medium uppercase tracking-wider">Updated {new Date(cv.updated_at).toLocaleDateString()}</p>
                              </div>
                            </div>
                            <div className="pt-4 space-y-2">
                              <Button variant="outline" className="w-full py-5 text-base rounded-2xl border-2 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-700 transition-all font-bold" onClick={() => { setCurrentCv(cv); setView("editor"); }}>
                                <Eye className="w-4 h-4 mr-2" />
                                View & Edit
                              </Button>
                              <Button 
                                variant="ghost" 
                                className="w-full py-2.5 text-xs rounded-xl text-indigo-700 bg-indigo-50/80 hover:bg-indigo-100 border border-indigo-100 transition-all font-bold flex items-center justify-center gap-2"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setCurrentCv(cv);
                                  setOptimizeTab("pivot");
                                  setShowJobModal(true);
                                  setView("editor");
                                }}
                              >
                                <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                                <span>Adapt to Role (Pivot)</span>
                              </Button>
                              <Button 
                                variant="ghost" 
                                className="w-full py-2.5 text-xs rounded-xl text-indigo-700 bg-indigo-50/80 hover:bg-indigo-100 border border-indigo-100 transition-all font-bold flex items-center justify-center gap-2"
                                onClick={(e) => openTranslateModalForSingle(cv, e)}
                              >
                                <Languages className="w-3.5 h-3.5 text-indigo-600" />
                                <span>Translate & Download</span>
                              </Button>
                            </div>
                          </motion.div>
                        </div>
                      </div>
                    </div>
                  );
                });
              }

              if (baseCvs.length === 0) {
                return (
                  <div className="py-20 text-center bg-white border border-dashed border-slate-200 rounded-3xl">
                    <FileText className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                    <h3 className="text-lg font-bold text-slate-400">No CVs saved yet</h3>
                    <p className="text-slate-400 mb-6">Start by creating one from the dashboard.</p>
                    <Button variant="outline" onClick={() => setView("dashboard")}>Go to Dashboard</Button>
                  </div>
                );
              }

              return baseCvs.map((baseCv) => {
                const optimized = cvs.filter(cv => cv.parent_id === baseCv.id);
                const isBaseSelected = selectedCvIds.includes(baseCv.id);
                return (
                  <div key={baseCv.id} className="flex flex-col gap-8">
                    <div className="flex items-center gap-4">
                      <div className="h-px flex-1 bg-slate-200" />
                      <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Base: {baseCv.content.personalInfo?.fullName || baseCv.title}</h2>
                      <div className="h-px flex-1 bg-slate-200" />
                    </div>
                    
                    <div className="flex flex-col lg:flex-row gap-10 items-start">
                      {/* Base CV Card - Large */}
                      <div className="w-full lg:w-[380px] shrink-0">
                        <motion.div 
                          whileHover={{ y: -4 }}
                          className={cn(
                            "bg-white border-2 rounded-3xl p-8 flex flex-col gap-6 shadow-xl hover:shadow-2xl transition-all relative overflow-hidden group",
                            isBaseSelected ? "border-indigo-500 ring-2 ring-indigo-200 bg-indigo-50/15" : "border-indigo-100"
                          )}
                        >
                          <div className="absolute top-0 right-0 px-4 py-1.5 bg-indigo-600 text-[10px] font-black text-white uppercase tracking-[0.2em] rounded-bl-2xl shadow-lg">
                            Base CV
                          </div>
                          <div className="flex justify-between items-start">
                            <div className="flex items-center gap-3">
                              <button
                                type="button"
                                onClick={(e) => toggleCvSelection(baseCv.id, e)}
                                className={cn(
                                  "w-8 h-8 rounded-xl border flex items-center justify-center transition-all",
                                  isBaseSelected
                                    ? "bg-indigo-600 border-indigo-600 text-white shadow-xs"
                                    : "bg-white border-slate-300 text-transparent hover:border-indigo-400"
                                )}
                                title="Select CV for download or translation"
                              >
                                <Check className="w-4 h-4 stroke-[3]" />
                              </button>
                              <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center shadow-inner group-hover:scale-110 transition-transform">
                                <FileText className="text-indigo-600 w-7 h-7" />
                              </div>
                            </div>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors" 
                              title="Delete Base CV and Optimizations"
                              onClick={(e) => {
                                e.stopPropagation();
                                const hasOptimized = cvs.some(c => c.parent_id === baseCv.id);
                                setDeleteConfirmTarget({
                                  id: baseCv.id,
                                  title: baseCv.title || "Base CV",
                                  isBaseWithChildren: hasOptimized,
                                });
                              }}
                            >
                              <Trash2 className="w-5 h-5 text-rose-500" />
                            </Button>
                          </div>
                          <div>
                            <h3 className="font-black text-2xl mb-2 tracking-tight text-slate-900 leading-tight">{baseCv.title}</h3>
                            <div className="flex items-center gap-2 text-slate-400">
                              <p className="text-xs font-medium uppercase tracking-wider">Updated {new Date(baseCv.updated_at).toLocaleDateString()}</p>
                            </div>
                          </div>
                          <div className="pt-4 space-y-2">
                            <Button variant="outline" className="w-full py-5 text-base rounded-2xl border-2 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-700 transition-all font-bold" onClick={() => { setCurrentCv(baseCv); setView("editor"); }}>
                              <Eye className="w-4 h-4 mr-2" />
                              View & Edit
                            </Button>
                            <Button 
                              variant="ghost" 
                              className="w-full py-2.5 text-xs rounded-xl text-indigo-700 bg-indigo-50/80 hover:bg-indigo-100 border border-indigo-100 transition-all font-bold flex items-center justify-center gap-2"
                              onClick={(e) => {
                                e.stopPropagation();
                                setCurrentCv(baseCv);
                                setOptimizeTab("pivot");
                                setShowJobModal(true);
                                setView("editor");
                              }}
                            >
                              <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                              <span>Adapt to Role (Pivot)</span>
                            </Button>
                            <Button 
                              variant="ghost" 
                              className="w-full py-2.5 text-xs rounded-xl text-indigo-700 bg-indigo-50/80 hover:bg-indigo-100 border border-indigo-100 transition-all font-bold flex items-center justify-center gap-2"
                              onClick={(e) => openTranslateModalForSingle(baseCv, e)}
                            >
                              <Languages className="w-3.5 h-3.5 text-indigo-600" />
                              <span>Translate & Download</span>
                            </Button>
                          </div>
                        </motion.div>
                      </div>

                      {/* Optimized CVs - Grid of smaller cards */}
                      <div className="flex-1 w-full">
                        {optimized.length > 0 ? (
                          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
                            {optimized.map((optCv) => {
                              const isOptSelected = selectedCvIds.includes(optCv.id);
                              return (
                                <motion.div 
                                  key={optCv.id}
                                  whileHover={{ scale: 1.02, y: -2 }}
                                  onClick={() => { setCurrentCv(optCv); setView("editor"); }}
                                  className={cn(
                                    "bg-white border rounded-2xl p-5 flex flex-col justify-between gap-4 shadow-sm hover:shadow-lg transition-all relative group cursor-pointer",
                                    isOptSelected
                                      ? "border-indigo-500 ring-2 ring-indigo-200 bg-indigo-50/15"
                                      : "border-slate-200 hover:border-indigo-300"
                                  )}
                                >
                                  <div className="absolute top-0 right-0 px-2.5 py-1 bg-emerald-500 text-[9px] font-black text-white uppercase tracking-widest rounded-bl-xl shadow-xs">
                                    Optimized
                                  </div>
                                  
                                  <div className="flex justify-between items-start pt-1">
                                    <div className="flex items-center gap-2">
                                      <button
                                        type="button"
                                        onClick={(e) => toggleCvSelection(optCv.id, e)}
                                        className={cn(
                                          "w-6 h-6 rounded-lg border flex items-center justify-center transition-all",
                                          isOptSelected
                                            ? "bg-indigo-600 border-indigo-600 text-white shadow-xs"
                                            : "bg-white border-slate-300 text-transparent hover:border-indigo-400"
                                        )}
                                        title="Select CV for download or translation"
                                      >
                                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                                      </button>
                                      <div className="w-9 h-9 bg-emerald-50 rounded-xl flex items-center justify-center border border-emerald-100">
                                        <Wand2 className="text-emerald-600 w-4 h-4" />
                                      </div>
                                    </div>
                                    <Button 
                                      variant="ghost" 
                                      size="sm" 
                                      className="h-8 w-8 p-0 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors z-10" 
                                      title="Delete Optimized CV"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setDeleteConfirmTarget({
                                          id: optCv.id,
                                          title: optCv.title || "Optimized CV",
                                        });
                                      }}
                                    >
                                      <Trash2 className="w-4 h-4 text-rose-500" />
                                    </Button>
                                  </div>

                                  <div className="space-y-2 flex-1">
                                    <h3 className="font-bold text-base text-slate-900 line-clamp-2 leading-snug">{optCv.title}</h3>
                                    <p className="text-[11px] text-slate-400 font-medium uppercase tracking-tighter italic">
                                      Updated {new Date(optCv.updated_at).toLocaleDateString()}
                                    </p>
                                    {optCv.content?.matchRate && (
                                      <button 
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setActiveMatchRateCv(optCv);
                                          setShowMatchRateModal(true);
                                        }}
                                        className={cn(
                                          "px-2.5 py-1 rounded-lg text-[11px] font-extrabold border cursor-pointer hover:scale-105 transition-transform flex items-center gap-1.5 w-max mt-1.5 shadow-xs",
                                          optCv.content.matchRate.optimized >= 8
                                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                            : optCv.content.matchRate.optimized >= 5
                                            ? "bg-amber-50 text-amber-700 border-amber-200"
                                            : "bg-rose-50 text-rose-700 border-rose-200"
                                        )}
                                        title="Click to view full Job Match Analysis"
                                      >
                                        <Target className="w-3.5 h-3.5 shrink-0" />
                                        <span>Match: {optCv.content.matchRate.optimized}/10</span>
                                      </button>
                                    )}
                                  </div>

                                  <div className="pt-2 space-y-1.5">
                                    <Button 
                                      variant="primary" 
                                      size="sm" 
                                      className="w-full text-xs font-bold py-2 rounded-xl flex items-center justify-center gap-2 shadow-xs bg-indigo-600 hover:bg-indigo-700 text-white transition-colors"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setCurrentCv(optCv);
                                        setView("editor");
                                      }}
                                    >
                                      <Eye className="w-3.5 h-3.5 shrink-0" />
                                      <span>View & Edit</span>
                                    </Button>
                                    <button
                                      type="button"
                                      onClick={(e) => openTranslateModalForSingle(optCv, e)}
                                      className="w-full py-1.5 rounded-lg border border-indigo-100 hover:border-indigo-300 hover:bg-indigo-50 text-indigo-700 text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors"
                                      title="Translate & Download this CV"
                                    >
                                      <Languages className="w-3 h-3 text-indigo-600" />
                                      <span>Translate & Download</span>
                                    </button>
                                  </div>
                                </motion.div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="h-full flex items-center justify-center py-12 bg-slate-50/50 border-2 border-dashed border-slate-200 rounded-3xl">
                            <div className="text-center">
                              <Sparkles className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                              <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">No optimizations yet</p>
                              <Button variant="ghost" size="sm" className="mt-2 text-indigo-600" onClick={() => { setCurrentCv(baseCv); setView("editor"); }}>
                                Tailor this CV
                                <ChevronRight className="w-4 h-4 ml-1" />
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </main>
        {renderModals()}
      </div>
    );
  }

  if (view === "dashboard") {
    return (
      <div className="min-h-screen bg-slate-50/70 font-sans text-slate-800">
        {/* Friendly Top Nav Bar */}
        <nav className="border-b border-slate-200/80 bg-white/90 backdrop-blur-md sticky top-0 z-30 shadow-xs">
          <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
            <div className="flex items-center gap-3 cursor-pointer" onClick={() => setView("dashboard")}>
              <div className="w-10 h-10 bg-gradient-to-tr from-indigo-600 via-indigo-500 to-violet-500 rounded-xl flex items-center justify-center shadow-md shadow-indigo-200 text-white">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <span className="font-extrabold text-lg tracking-tight bg-gradient-to-r from-slate-900 via-indigo-950 to-indigo-700 bg-clip-text text-transparent">
                  CV Crafter
                </span>
                <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 px-1.5 py-0.2 rounded-full block w-max">
                  AI Resume Suite
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setView("ats-scanner")} 
                className="flex items-center gap-2 text-indigo-700 font-bold bg-indigo-50/80 hover:bg-indigo-100/80 border border-indigo-100 rounded-xl px-3.5"
              >
                <Scan className="w-4 h-4 text-indigo-600" />
                <span>ATS Scanner</span>
              </Button>

              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setView("cv-list")} 
                className="hidden sm:flex items-center gap-2 text-slate-700 font-bold hover:bg-slate-100 rounded-xl px-3.5"
              >
                <FileText className="w-4 h-4 text-slate-500" />
                <span>My Saved ({cvs.length})</span>
              </Button>

              {user ? (
                <div className="flex items-center gap-3 pl-2 border-l border-slate-200">
                  <div className="text-right hidden sm:block">
                    <p className="text-xs font-bold text-slate-900">{user.displayName}</p>
                    <p className="text-[10px] text-slate-500 truncate max-w-[120px]">{user.email}</p>
                  </div>
                  <div className="relative group">
                    <img 
                      src={user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName}`} 
                      alt={user.displayName || "User"} 
                      className="w-9 h-9 rounded-full border-2 border-indigo-200 shadow-xs object-cover"
                      referrerPolicy="no-referrer"
                    />
                    <button 
                      onClick={handleLogout}
                      className="absolute top-full right-0 mt-2 hidden group-hover:block bg-white border border-slate-200 rounded-2xl shadow-xl p-1.5 min-w-[130px] z-50"
                    >
                      <div className="flex items-center gap-2 px-3 py-2 text-rose-600 hover:bg-rose-50 rounded-xl text-xs font-bold transition-colors">
                        <LogOut className="w-4 h-4" />
                        Logout
                      </div>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
                  <Button 
                    variant="primary" 
                    size="sm" 
                    onClick={handleLogin} 
                    className="rounded-xl px-3.5 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs flex items-center gap-2"
                  >
                    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                    </svg>
                    <span>Google Login</span>
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => setShowAuthModal(true)} 
                    className="rounded-xl px-3 py-2 text-xs font-bold border-slate-200 text-slate-700 hover:bg-slate-50"
                  >
                    Email / Register
                  </Button>
                </div>
              )}
            </div>
          </div>
        </nav>

        <main className="max-w-7xl mx-auto px-6 py-8">
          {error && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-8 p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl flex items-center gap-3 shadow-xs"
            >
              <Trash2 className="w-5 h-5 shrink-0 text-rose-500" />
              <span className="text-sm font-medium">{error}</span>
              <Button variant="ghost" size="sm" className="ml-auto text-xs font-bold" onClick={() => setError(null)}>Dismiss</Button>
            </motion.div>
          )}

          {/* Friendly Hero Banner */}
          <div className="mb-8 p-8 rounded-3xl bg-gradient-to-br from-indigo-900 via-slate-900 to-indigo-950 text-white relative overflow-hidden shadow-xl">
            <div className="absolute -right-12 -top-12 w-64 h-64 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute right-1/3 -bottom-12 w-48 h-48 bg-violet-500/20 rounded-full blur-2xl pointer-events-none" />
            
            <div className="relative z-10 max-w-2xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 border border-indigo-400/30 text-indigo-200 text-xs font-semibold mb-4 backdrop-blur-md">
                <Sparkles className="w-3.5 h-3.5 text-amber-300 animate-spin-slow" />
                <span>Craft Standout Resumes with Ease</span>
              </div>
              <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-3 text-white">
                {user ? `Hello, ${user.displayName?.split(' ')[0]} 👋` : 'Craft Your Next Winning Resume 👋'}
              </h1>
              <p className="text-indigo-100/90 text-sm md:text-base leading-relaxed mb-6">
                Create tailored, professional CVs in minutes with automated AI content suggestions, instant ATS keyword scoring, and beautiful export options.
              </p>

              <div className="flex flex-wrap items-center gap-3 text-xs text-indigo-200 font-medium">
                <span className="flex items-center gap-1.5 bg-white/10 px-3 py-1.5 rounded-xl border border-white/10">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Free PDF &amp; Word Export
                </span>
                <span className="flex items-center gap-1.5 bg-white/10 px-3 py-1.5 rounded-xl border border-white/10">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" /> ATS Compatibility Checker
                </span>
                <span className="flex items-center gap-1.5 bg-white/10 px-3 py-1.5 rounded-xl border border-white/10">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Local &amp; Safe Auto-Save
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Create New Card */}
            <motion.div 
              whileHover={{ y: -4 }}
              className="bg-white border border-slate-200/90 rounded-3xl p-7 flex flex-col justify-between gap-6 cursor-pointer hover:border-indigo-400 hover:shadow-lg transition-all group relative overflow-hidden"
              onClick={handleCreateNew}
            >
              <div className="space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-all shadow-xs">
                  <Plus className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-lg text-slate-900 group-hover:text-indigo-600 transition-colors">Start From Scratch</h3>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    Build step-by-step using our guided section builder, custom layout templates, and live preview.
                  </p>
                </div>
              </div>

              <Button onClick={handleCreateNew} className="w-full rounded-xl bg-slate-900 hover:bg-indigo-600 text-white font-bold text-xs py-2.5 transition-colors">
                Start Building Now
              </Button>
            </motion.div>

            {/* AI Generation Card */}
            <motion.div 
              whileHover={{ y: -4 }}
              className="bg-gradient-to-br from-indigo-600 via-indigo-700 to-violet-700 rounded-3xl p-7 text-white flex flex-col justify-between gap-5 shadow-lg shadow-indigo-100 relative overflow-hidden md:col-span-1"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-white/10 rounded-lg">
                    <Sparkles className="w-4 h-4 text-amber-300" />
                  </div>
                  <h3 className="font-bold text-base text-white">AI Assistant Generator</h3>
                </div>
                {uploadedFile && (
                  <button 
                    onClick={() => setUploadedFile(null)}
                    className="p-1 hover:bg-white/10 rounded-full transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              
              <p className="text-xs text-indigo-100/90 leading-relaxed">
                Paste your rough work history or upload your existing CV file (PDF/Word/Image) to auto-extract and structure it instantly.
              </p>

              {!uploadedFile ? (
                <div className="space-y-3">
                  <TextArea 
                    placeholder="Paste job title, bullet points, or past roles here..." 
                    className="bg-indigo-900/40 border-indigo-400/40 text-white placeholder:text-indigo-200/60 text-xs min-h-[90px] rounded-xl focus:border-white/60"
                    value={rawText}
                    onChange={(e) => setRawText(e.target.value)}
                  />
                  <div className="flex items-center gap-2">
                    <div className="h-px flex-1 bg-indigo-400/30" />
                    <span className="text-[10px] font-bold text-indigo-200 uppercase tracking-widest">OR FILE UPLOAD</span>
                    <div className="h-px flex-1 bg-indigo-400/30" />
                  </div>
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    className="hidden" 
                    accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg,.psd"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) setUploadedFile(file);
                    }}
                  />
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full py-2.5 bg-indigo-800/40 border border-dashed border-indigo-300/40 rounded-xl flex items-center justify-center gap-2 hover:bg-white/10 transition-all group"
                  >
                    <FileUp className="w-4 h-4 text-indigo-200 group-hover:scale-110 transition-transform" />
                    <span className="text-xs font-semibold text-indigo-100">Upload PDF / Word File</span>
                  </button>
                </div>
              ) : (
                <div className="bg-white/15 rounded-xl p-3.5 border border-white/20 flex items-center gap-3">
                  <div className="w-9 h-9 bg-white/10 rounded-lg flex items-center justify-center shrink-0">
                    <FileText className="w-5 h-5 text-indigo-200" />
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <p className="text-xs font-bold truncate">{uploadedFile.name}</p>
                    <p className="text-[10px] text-indigo-200">{(uploadedFile.size / 1024 / 1024).toFixed(2)} MB</p>
                  </div>
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                </div>
              )}

              <Button 
                className="w-full bg-white hover:bg-indigo-50 text-indigo-800 font-extrabold text-xs py-2.5 rounded-xl shadow-xs transition-colors"
                onClick={(e) => {
                  e.preventDefault();
                  handleGenerate();
                }}
                disabled={isGenerating || (!rawText.trim() && !uploadedFile)}
              >
                {isGenerating ? (
                  <div className="flex flex-col items-center gap-1">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 animate-spin" />
                      <span>Structuring Experience...</span>
                    </div>
                    <span className="text-[10px] font-normal opacity-80">{loadingMessage}</span>
                  </div>
                ) : "✨ Generate Structured CV"}
              </Button>
            </motion.div>

            {/* My Saved CVs Entry Card */}
            <motion.div 
              whileHover={{ y: -4 }}
              className="bg-white border border-slate-200/90 rounded-3xl p-7 flex flex-col justify-between gap-6 cursor-pointer hover:border-indigo-400 hover:shadow-lg transition-all group relative overflow-hidden"
              onClick={() => setView("cv-list")}
            >
              <div className="space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:bg-emerald-600 group-hover:text-white transition-all shadow-xs">
                  <FileText className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-lg text-slate-900 group-hover:text-emerald-600 transition-colors">My Saved Resumes</h3>
                    <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs font-extrabold">
                      {cvs.length}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    View, duplicate, edit, or download your saved CV versions anytime.
                  </p>
                </div>
              </div>

              <Button onClick={() => setView("cv-list")} variant="outline" className="w-full rounded-xl border-slate-200 text-slate-700 font-bold text-xs py-2.5 hover:bg-slate-50">
                Manage My Saved CVs
              </Button>
            </motion.div>
          </div>

          {/* Quick ATS Scanner Banner */}
          <motion.div 
            whileHover={{ scale: 1.005 }}
            onClick={() => setView("ats-scanner")}
            className="mt-8 bg-gradient-to-r from-amber-500/10 via-indigo-500/10 to-violet-500/10 border border-indigo-200/60 rounded-3xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4 cursor-pointer hover:border-indigo-300 transition-all"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-indigo-200">
                <Scan className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-extrabold text-base text-slate-900">ATS / ATO Match Scanner</h3>
                  <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-extrabold">NEW</span>
                </div>
                <p className="text-xs text-slate-600 mt-0.5">
                  Paste a job description to check keyword match scores, missing skills, and format readability before applying.
                </p>
              </div>
            </div>
            <Button size="sm" onClick={() => setView("ats-scanner")} className="shrink-0 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl px-5 py-2.5 shadow-sm">
              Launch Scanner &rarr;
            </Button>
          </motion.div>
        </main>
        {renderModals()}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans text-slate-900">
      <AnimatePresence>
        {toast && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className={cn(
              "fixed bottom-8 left-1/2 -translate-x-1/2 px-6 py-3 rounded-2xl shadow-2xl z-[100] flex items-center gap-3",
              toast.type === "success" ? "bg-slate-900 text-white" : "bg-rose-600 text-white"
            )}
          >
            {toast.type === "success" ? <CheckCircle2 className="w-5 h-5 text-emerald-400" /> : <AlertCircle className="w-5 h-5" />}
            <span className="text-sm font-bold">{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Editor Header */}
      <nav className="bg-white border-b border-slate-200 px-6 h-16 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={async () => {
            if (view === "editor") {
              await handleSave();
            }
            setView("cv-list");
          }}>
            <Layout className="w-4 h-4 mr-2" />
            My CVs
          </Button>
          <div className="h-6 w-px bg-slate-200 mx-2" />
          <Input 
            value={currentCv?.title} 
            onChange={(e) => currentCv && setCurrentCv({ ...currentCv, title: e.target.value })}
            className="border-none font-bold text-lg px-2 py-1 focus:ring-2 focus:ring-indigo-500/10 rounded-lg w-64"
          />
          <span className="text-[10px] font-bold bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded uppercase tracking-wider">v1.1</span>
        </div>
        <div className="flex items-center gap-3">
          {currentCv?.updated_at && (
            <span className="text-xs text-slate-400 mr-2">
              Last saved {new Date(currentCv.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          {currentCv?.content?.matchRate ? (
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => {
                setActiveMatchRateCv(currentCv);
                setShowMatchRateModal(true);
              }}
              className={cn(
                "rounded-xl px-3.5 py-2 text-xs font-extrabold border transition-all flex items-center gap-1.5 shadow-xs",
                currentCv.content.matchRate.optimized >= 8 
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100" 
                  : currentCv.content.matchRate.optimized >= 5 
                  ? "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100" 
                  : "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100"
              )}
              title="Click to view honest Job Match Score & Gap Analysis"
            >
              <Target className="w-4 h-4" />
              <span>Match: {currentCv.content.matchRate.optimized}/10</span>
            </Button>
          ) : (
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setShowJobModal(true)}
              className="border-indigo-200 text-indigo-700 hover:bg-indigo-50 rounded-xl px-3.5 py-2 text-xs font-bold"
              title="Tailor your CV to a target job to calculate a realistic match score"
            >
              <Target className="w-4 h-4 mr-1.5 text-indigo-600" />
              Check Job Match
            </Button>
          )}
          {!currentCv?.parent_id && (
            <>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => {
                  setOptimizeTab("pivot");
                  setShowJobModal(true);
                }}
                className="border-indigo-200 text-indigo-700 hover:bg-indigo-50 rounded-xl px-3.5 py-2 text-xs font-bold"
                title="Adapt and reframe this CV to highlight transferable strengths for a related position (e.g. Project Manager)"
              >
                <Sparkles className="w-4 h-4 mr-1.5 text-indigo-600" />
                Adapt to Role
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => {
                  setOptimizeTab("manual");
                  setShowJobModal(true);
                }}
                className="border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl px-3.5 py-2 text-xs font-bold"
              >
                <Wand2 className="w-4 h-4 mr-1.5 text-indigo-600" />
                Optimize for Job
              </Button>
            </>
          )}
          <Button variant="outline" onClick={() => setView("ats-scanner")}>
            <Scan className="w-4 h-4 mr-2 text-indigo-600" />
            ATS Scan
          </Button>
          {currentCv && (
            <Button 
              variant="outline" 
              onClick={() => setShowCoverLetterModal(true)}
              className="border-indigo-200 text-indigo-700 hover:bg-indigo-50 hover:border-indigo-300 rounded-xl px-3.5 py-2 text-xs font-bold"
              title="Generate a cover letter for a target company grounded in your open CV"
            >
              <FileText className="w-4 h-4 mr-1.5 text-indigo-600" />
              Cover Letter
            </Button>
          )}
          {currentCv && (
            <Button 
              variant="outline" 
              size="sm"
              className="border-rose-200 text-rose-600 hover:bg-rose-50 hover:border-rose-300 rounded-xl px-3 text-xs font-bold"
              onClick={() => {
                if (!currentCv) return;
                const isOpt = !!currentCv.parent_id;
                const hasOptimized = cvs.some(c => c.parent_id === currentCv.id);
                setDeleteConfirmTarget({
                  id: currentCv.id,
                  title: currentCv.title || "Resume",
                  isBaseWithChildren: !isOpt && hasOptimized,
                });
              }}
              title="Delete this CV"
            >
              <Trash2 className="w-4 h-4 mr-1.5 text-rose-500" />
              Delete
            </Button>
          )}
          <button 
            onClick={handleSave}
            disabled={isSaving}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed group min-w-[100px] justify-center ${
              saveSuccess 
                ? "bg-emerald-50 border-emerald-200 text-emerald-600" 
                : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 hover:border-slate-300"
            }`}
            title="Click to save manually"
          >
            {isSaving ? (
              <>
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                >
                  <Save className="w-3.5 h-3.5 text-slate-400" />
                </motion.div>
                <span className="text-xs font-medium">Saving...</span>
              </>
            ) : saveSuccess ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-xs font-bold">Saved!</span>
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-500" />
                <span className="text-xs font-medium group-hover:text-indigo-600">Save</span>
              </>
            )}
          </button>
          <div className="h-6 w-px bg-slate-200 mx-2" />
          <div className="relative" ref={exportMenuRef}>
            <Button onClick={() => setShowExportMenu(!showExportMenu)}>
              <Download className="w-4 h-4 mr-2" />
              Export PDF
            </Button>
            
            <AnimatePresence>
              {showExportMenu && (
                <motion.div 
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-2xl border border-slate-200 p-2 z-50 overflow-hidden"
                >
                  <div className="p-3 border-b border-slate-100 flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Language</span>
                    <div className="flex gap-1">
                      {["English", "Spanish"].map((lang) => (
                        <button
                          key={lang}
                          onClick={() => setSelectedLanguage(lang)}
                          className={clsx(
                            "px-2 py-1 text-[10px] font-bold rounded-md transition-all",
                            selectedLanguage === lang 
                              ? "bg-indigo-100 text-indigo-700" 
                              : "text-slate-500 hover:bg-slate-100"
                          )}
                        >
                          {lang}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button 
                    onClick={() => {
                      handleDownload("standard");
                      setShowExportMenu(false);
                    }}
                    disabled={isTranslating}
                    className="w-full flex flex-col gap-1 p-3 hover:bg-slate-50 rounded-xl transition-colors text-left group disabled:opacity-50"
                  >
                    <div className="flex items-center gap-2">
                      <Layout className="w-4 h-4 text-indigo-600" />
                      <span className="text-sm font-bold text-slate-900">Standard Export</span>
                    </div>
                    <p className="text-[10px] text-slate-500 leading-tight">High-fidelity, visually polished CV. Best for direct emailing or human review.</p>
                  </button>
                  
                  <div className="h-px bg-slate-100 my-1 mx-2" />
                  
                  <button 
                    onClick={() => {
                      handleDownload("platform");
                      setShowExportMenu(false);
                      showToast("Generating platform-optimized text file...");
                    }}
                    disabled={isTranslating}
                    className="w-full flex flex-col gap-1 p-3 hover:bg-indigo-50 rounded-xl transition-colors text-left group disabled:opacity-50"
                  >
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-emerald-600" />
                      <span className="text-sm font-bold text-slate-900">Export for Platforms</span>
                    </div>
                    <p className="text-[10px] text-slate-500 leading-tight">ATS-optimized structure. Best for Workday, Greenhouse, and automated portals.</p>
                    <div className="mt-1 flex gap-1">
                      <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 text-[8px] font-black uppercase rounded tracking-widest">Workday Ready</span>
                    </div>
                  </button>

                  <div className="h-px bg-slate-100 my-1 mx-2" />

                  <button 
                    onClick={() => {
                      copyToClipboardATS();
                      setShowExportMenu(false);
                    }}
                    className="w-full flex flex-col gap-1 p-3 hover:bg-slate-50 rounded-xl transition-colors text-left group"
                  >
                    <div className="flex items-center gap-2">
                      <Copy className="w-4 h-4 text-slate-600" />
                      <span className="text-sm font-bold text-slate-900">Copy ATS Text</span>
                    </div>
                    <p className="text-[10px] text-slate-500 leading-tight">Copy plain text optimized for manual pasting into application forms.</p>
                  </button>

                  <div className="h-px bg-slate-100 my-1 mx-2" />

                  <button 
                    onClick={() => {
                      setShowExportMenu(false);
                      if (currentCv) {
                        openTranslateModalForSingle(currentCv);
                      }
                    }}
                    className="w-full flex flex-col gap-1 p-3 hover:bg-violet-50 rounded-xl transition-colors text-left group"
                  >
                    <div className="flex items-center gap-2">
                      <Languages className="w-4 h-4 text-violet-600" />
                      <span className="text-sm font-bold text-slate-900">Translate & Download...</span>
                    </div>
                    <p className="text-[10px] text-slate-500 leading-tight">Translate this CV into any language with certified 100% accuracy.</p>
                    <div className="mt-1 flex gap-1">
                      <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-800 text-[8px] font-black uppercase rounded tracking-widest">100% Accuracy Guarantee</span>
                    </div>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <div className="h-6 w-px bg-slate-200 mx-1" />
          {user ? (
            <div className="flex items-center gap-2 pl-1">
              <img 
                src={user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName}`} 
                alt={user.displayName || "User"} 
                className="w-7 h-7 rounded-full border border-indigo-200 object-cover"
                referrerPolicy="no-referrer"
              />
              <Button variant="ghost" size="sm" onClick={handleLogout} className="text-xs text-rose-600 hover:bg-rose-50 px-2 py-1">
                Logout
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <Button 
                variant="primary" 
                size="sm" 
                onClick={handleLogin} 
                className="rounded-xl px-3 py-1 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs flex items-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                <span>Google Login</span>
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setShowAuthModal(true)} 
                className="rounded-xl px-2.5 py-1 text-xs font-bold border-slate-200 text-slate-700 hover:bg-slate-50"
              >
                Email
              </Button>
            </div>
          )}
        </div>
      </nav>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar Editor */}
        <aside className={cn(
          "w-96 bg-white border-r border-slate-200 overflow-y-auto p-6 flex flex-col gap-8 transition-all duration-300",
          (isDiffMode || isOptimizing) && "opacity-60 pointer-events-none grayscale-[0.3]"
        )}>
          {(isDiffMode || isOptimizing) && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl mb-2 animate-in fade-in slide-in-from-top-2">
              <div className="flex items-center gap-2 text-amber-700 mb-1">
                <AlertCircle className="w-4 h-4" />
                <span className="text-[10px] font-bold uppercase tracking-wider">Editor Locked</span>
              </div>
              <p className="text-[10px] text-amber-600 leading-relaxed">
                {isOptimizing 
                  ? "AI is currently tailoring your CV. Please wait..." 
                  : "Reviewing optimization. Keep or Discard changes to resume editing."}
              </p>
            </div>
          )}
          <section>
            <div className="flex items-center gap-2 mb-4 text-slate-400">
              <User className="w-4 h-4" />
              <h3 className="text-xs font-bold uppercase tracking-wider">Personal Info</h3>
            </div>
            <div className="space-y-3">
              <Input 
                placeholder="Full Name" 
                value={currentCv?.content.personalInfo.fullName}
                onChange={(e) => currentCv && setCurrentCv({
                  ...currentCv,
                  content: { ...currentCv.content, personalInfo: { ...currentCv.content.personalInfo, fullName: e.target.value } }
                })}
              />
              <Input 
                placeholder="Email" 
                value={currentCv?.content.personalInfo.email}
                onChange={(e) => currentCv && setCurrentCv({
                  ...currentCv,
                  content: { ...currentCv.content, personalInfo: { ...currentCv.content.personalInfo, email: e.target.value } }
                })}
              />
              <Input 
                placeholder="Phone" 
                value={currentCv?.content.personalInfo.phone}
                onChange={(e) => currentCv && setCurrentCv({
                  ...currentCv,
                  content: { ...currentCv.content, personalInfo: { ...currentCv.content.personalInfo, phone: e.target.value } }
                })}
              />
              <Input 
                placeholder="Location" 
                value={currentCv?.content.personalInfo.location}
                onChange={(e) => currentCv && setCurrentCv({
                  ...currentCv,
                  content: { ...currentCv.content, personalInfo: { ...currentCv.content.personalInfo, location: e.target.value } }
                })}
              />
            </div>
          </section>

          <section>
            <div className="flex items-center gap-2 mb-4 text-slate-400">
              <FileText className="w-4 h-4" />
              <h3 className="text-xs font-bold uppercase tracking-wider">Summary</h3>
            </div>
            <TextArea 
              value={currentCv?.content.summary}
              onChange={(e) => currentCv && setCurrentCv({
                ...currentCv,
                content: { ...currentCv.content, summary: e.target.value }
              })}
            />
          </section>

          <section>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-slate-400">
                <Sparkles className="w-4 h-4" />
                <h3 className="text-xs font-bold uppercase tracking-wider">Custom Links</h3>
              </div>
              <Button variant="ghost" size="sm" onClick={() => {
                if (!currentCv) return;
                const newLink = { title: "", url: "" };
                setCurrentCv({
                  ...currentCv,
                  content: { 
                    ...currentCv.content, 
                    customLinks: [...(currentCv.content.customLinks || []), newLink],
                    linksPlacement: currentCv.content.linksPlacement || "header"
                  }
                });
              }}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            
            <div className="space-y-3">
              {currentCv?.content.customLinks?.map((link, i) => (
                <div 
                  key={i} 
                  draggable
                  onDragStart={() => setDraggedLinkIndex(i)}
                  onDragEnd={() => setDraggedLinkIndex(null)}
                  onDragOver={(e) => {
                    if (draggedLinkIndex !== null) e.preventDefault();
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (draggedLinkIndex !== null) {
                      moveCustomLink(draggedLinkIndex, i);
                      setDraggedLinkIndex(null);
                    }
                  }}
                  className={cn(
                    "p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-2 relative group transition-all",
                    draggedLinkIndex === i ? "opacity-40 border-dashed border-indigo-400" : ""
                  )}
                >
                  <div className="flex items-center justify-between pb-1 border-b border-slate-200/60">
                    <div className="flex items-center gap-1">
                      <div 
                        className="cursor-grab active:cursor-grabbing p-1 text-slate-400 hover:text-slate-600 rounded hover:bg-slate-200/60 transition-colors"
                        title="Drag to reorder link"
                      >
                        <GripVertical className="w-3.5 h-3.5" />
                      </div>
                      <div className="flex items-center">
                        <button
                          type="button"
                          disabled={i === 0}
                          onClick={() => moveCustomLink(i, i - 1)}
                          title="Move link up"
                          className="p-1 rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 disabled:opacity-20 disabled:pointer-events-none transition-colors"
                        >
                          <ChevronUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={i === (currentCv.content.customLinks?.length || 0) - 1}
                          onClick={() => moveCustomLink(i, i + 1)}
                          title="Move link down"
                          className="p-1 rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 disabled:opacity-20 disabled:pointer-events-none transition-colors"
                        >
                          <ChevronDown className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">
                        Link #{i + 1}
                      </span>
                    </div>
                    <button 
                      type="button"
                      onClick={() => {
                        const newLinks = [...(currentCv.content.customLinks || [])];
                        newLinks.splice(i, 1);
                        setCurrentCv({ ...currentCv, content: { ...currentCv.content, customLinks: newLinks } });
                      }}
                      className="p-1 text-slate-300 hover:text-rose-500 rounded hover:bg-rose-50 transition-colors"
                      title="Delete link"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="flex gap-2">
                    <Input 
                      placeholder="Link Title (e.g. Portfolio)" 
                      value={link.title}
                      className="h-8 text-xs flex-1 bg-white"
                      onChange={(e) => {
                        const newLinks = [...(currentCv.content.customLinks || [])];
                        newLinks[i] = { ...newLinks[i], title: e.target.value };
                        setCurrentCv({ ...currentCv, content: { ...currentCv.content, customLinks: newLinks } });
                      }}
                    />
                    <div className="flex items-center gap-1 p-0.5 bg-slate-200 rounded-lg h-8 shrink-0">
                      <button 
                        onClick={() => {
                          const newLinks = [...(currentCv.content.customLinks || [])];
                          newLinks[i] = { ...newLinks[i], position: "header" };
                          setCurrentCv({ ...currentCv, content: { ...currentCv.content, customLinks: newLinks } });
                        }}
                        className={cn(
                          "px-2 h-full text-[9px] font-bold uppercase tracking-tighter rounded-md transition-all",
                          (link.position === "header" || (!link.position && currentCv?.content.linksPlacement === "header")) ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                        )}
                      >
                        Top
                      </button>
                      <button 
                        onClick={() => {
                          const newLinks = [...(currentCv.content.customLinks || [])];
                          newLinks[i] = { ...newLinks[i], position: "bottom" };
                          setCurrentCv({ ...currentCv, content: { ...currentCv.content, customLinks: newLinks } });
                        }}
                        className={cn(
                          "px-2 h-full text-[9px] font-bold uppercase tracking-tighter rounded-md transition-all",
                          (link.position === "bottom" || (!link.position && currentCv?.content.linksPlacement === "bottom")) ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                        )}
                      >
                        Btm
                      </button>
                    </div>
                  </div>
                  <Input 
                    placeholder="URL (https://...)" 
                    value={link.url}
                    className="h-8 text-xs bg-white"
                    onChange={(e) => {
                      const newLinks = [...(currentCv.content.customLinks || [])];
                      newLinks[i] = { ...newLinks[i], url: e.target.value };
                      setCurrentCv({ ...currentCv, content: { ...currentCv.content, customLinks: newLinks } });
                    }}
                  />
                </div>
              ))}
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-slate-400">
                <Briefcase className="w-4 h-4" />
                <h3 className="text-xs font-bold uppercase tracking-wider">Experience</h3>
              </div>
              <Button variant="ghost" size="sm" onClick={() => {
                if (!currentCv) return;
                const newExp = { company: "", position: "", location: "", startDate: "", endDate: "", highlights: [""] };
                setCurrentCv({
                  ...currentCv,
                  content: { ...currentCv.content, experience: [...currentCv.content.experience, newExp] }
                });
              }}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            <div className="space-y-6">
              {currentCv?.content.experience?.map((exp, i) => (
                <div 
                  key={i} 
                  draggable
                  onDragStart={() => setDraggedExpIndex(i)}
                  onDragEnd={() => setDraggedExpIndex(null)}
                  onDragOver={(e) => {
                    if (draggedExpIndex !== null) e.preventDefault();
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (draggedExpIndex !== null) {
                      moveExperience(draggedExpIndex, i);
                      setDraggedExpIndex(null);
                    }
                  }}
                  className={cn(
                    "p-4 bg-slate-50 rounded-xl border border-slate-100 space-y-3 relative group transition-all",
                    draggedExpIndex === i ? "opacity-40 border-dashed border-indigo-400" : ""
                  )}
                >
                  {/* Role Header Handle & Controls */}
                  <div className="flex items-center justify-between pb-1.5 border-b border-slate-200/60">
                    <div className="flex items-center gap-1">
                      <div 
                        className="cursor-grab active:cursor-grabbing p-1 text-slate-400 hover:text-slate-600 rounded hover:bg-slate-200/60 transition-colors"
                        title="Drag to reorder role"
                      >
                        <GripVertical className="w-3.5 h-3.5" />
                      </div>
                      <div className="flex items-center">
                        <button
                          type="button"
                          disabled={i === 0}
                          onClick={() => moveExperience(i, i - 1)}
                          title="Move role up"
                          className="p-1 rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 disabled:opacity-20 disabled:pointer-events-none transition-colors"
                        >
                          <ChevronUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={i === (currentCv.content.experience?.length || 0) - 1}
                          onClick={() => moveExperience(i, i + 1)}
                          title="Move role down"
                          className="p-1 rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 disabled:opacity-20 disabled:pointer-events-none transition-colors"
                        >
                          <ChevronDown className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1 truncate max-w-[150px]">
                        {exp.position || exp.company || `Role #${i + 1}`}
                      </span>
                    </div>
                    <button 
                      type="button"
                      onClick={() => {
                        const newExp = [...(currentCv.content.experience || [])];
                        newExp.splice(i, 1);
                        setCurrentCv({ ...currentCv, content: { ...currentCv.content, experience: newExp } });
                      }}
                      className="p-1 text-slate-300 hover:text-rose-500 rounded hover:bg-rose-50 transition-colors"
                      title="Delete role"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <Input 
                    placeholder="Company" 
                    value={exp.company}
                    className="bg-white"
                    onChange={(e) => {
                      const newExp = [...(currentCv.content.experience || [])];
                      newExp[i] = { ...newExp[i], company: e.target.value };
                      setCurrentCv({ ...currentCv, content: { ...currentCv.content, experience: newExp } });
                    }}
                  />
                  <Input 
                    placeholder="Position" 
                    value={exp.position}
                    className="bg-white"
                    onChange={(e) => {
                      const newExp = [...(currentCv.content.experience || [])];
                      newExp[i] = { ...newExp[i], position: e.target.value };
                      setCurrentCv({ ...currentCv, content: { ...currentCv.content, experience: newExp } });
                    }}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Input 
                      placeholder="Start Date" 
                      value={exp.startDate}
                      className="bg-white"
                      onChange={(e) => {
                        const newExp = [...(currentCv.content.experience || [])];
                        newExp[i] = { ...newExp[i], startDate: e.target.value };
                        setCurrentCv({ ...currentCv, content: { ...currentCv.content, experience: newExp } });
                      }}
                    />
                    <Input 
                      placeholder="End Date" 
                      value={exp.endDate}
                      className="bg-white"
                      onChange={(e) => {
                        const newExp = [...(currentCv.content.experience || [])];
                        newExp[i] = { ...newExp[i], endDate: e.target.value };
                        setCurrentCv({ ...currentCv, content: { ...currentCv.content, experience: newExp } });
                      }}
                    />
                  </div>

                  {/* Highlights with Handles */}
                  <div className="space-y-2 pt-1">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                      <span>Highlights & Achievements</span>
                      <span className="text-[9px] text-slate-400 lowercase">{exp.highlights?.length || 0} bullets</span>
                    </div>
                    {exp.highlights?.map((h, j) => (
                      <div 
                        key={j} 
                        draggable
                        onDragStart={() => setDraggedHighlight({ expIndex: i, highlightIndex: j })}
                        onDragEnd={() => setDraggedHighlight(null)}
                        onDragOver={(e) => {
                          if (draggedHighlight && draggedHighlight.expIndex === i) {
                            e.preventDefault();
                          }
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          if (draggedHighlight && draggedHighlight.expIndex === i) {
                            moveHighlight(i, draggedHighlight.highlightIndex, j);
                            setDraggedHighlight(null);
                          }
                        }}
                        className={cn(
                          "flex gap-1.5 group/highlight items-center bg-white p-1 rounded-lg border border-slate-200/70 transition-all",
                          draggedHighlight?.expIndex === i && draggedHighlight.highlightIndex === j ? "opacity-35 border-dashed border-indigo-400" : ""
                        )}
                      >
                        <div className="flex items-center gap-0.5 text-slate-400 shrink-0">
                          <div 
                            className="cursor-grab active:cursor-grabbing p-1 text-slate-400 hover:text-slate-600 rounded hover:bg-slate-100 transition-colors"
                            title="Drag highlight"
                          >
                            <GripVertical className="w-3 h-3" />
                          </div>
                          <div className="flex flex-col -space-y-0.5">
                            <button
                              type="button"
                              disabled={j === 0}
                              onClick={() => moveHighlight(i, j, j - 1)}
                              title="Move highlight up"
                              className="p-0.5 rounded text-slate-400 hover:text-indigo-600 hover:bg-slate-100 disabled:opacity-15 disabled:pointer-events-none transition-colors"
                            >
                              <ChevronUp className="w-2.5 h-2.5" />
                            </button>
                            <button
                              type="button"
                              disabled={j === (exp.highlights?.length || 0) - 1}
                              onClick={() => moveHighlight(i, j, j + 1)}
                              title="Move highlight down"
                              className="p-0.5 rounded text-slate-400 hover:text-indigo-600 hover:bg-slate-100 disabled:opacity-15 disabled:pointer-events-none transition-colors"
                            >
                              <ChevronDown className="w-2.5 h-2.5" />
                            </button>
                          </div>
                        </div>
                        <Input 
                          placeholder="Highlight or achievement bullet" 
                          value={h}
                          className="flex-1 text-xs border-none shadow-none focus-visible:ring-1 focus-visible:ring-indigo-300 py-1 h-7"
                          onChange={(e) => {
                            const newExp = [...(currentCv.content.experience || [])];
                            const newHighlights = [...newExp[i].highlights];
                            newHighlights[j] = e.target.value;
                            newExp[i] = { ...newExp[i], highlights: newHighlights };
                            setCurrentCv({ ...currentCv, content: { ...currentCv.content, experience: newExp } });
                          }}
                        />
                        <button 
                          type="button"
                          onClick={() => {
                            const newExp = [...(currentCv.content.experience || [])];
                            const newHighlights = [...newExp[i].highlights];
                            newHighlights.splice(j, 1);
                            newExp[i] = { ...newExp[i], highlights: newHighlights };
                            setCurrentCv({ ...currentCv, content: { ...currentCv.content, experience: newExp } });
                          }}
                          className="p-1 text-slate-300 hover:text-rose-500 opacity-0 group-hover/highlight:opacity-100 transition-opacity rounded hover:bg-rose-50"
                          title="Delete highlight"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                    <Button variant="ghost" size="sm" className="w-full text-xs h-8 text-indigo-600 hover:bg-indigo-50" onClick={() => {
                      const newExp = [...(currentCv.content.experience || [])];
                      newExp[i] = { ...newExp[i], highlights: [...(newExp[i].highlights || []), ""] };
                      setCurrentCv({ ...currentCv, content: { ...currentCv.content, experience: newExp } });
                    }}>
                      <Plus className="w-3.5 h-3.5 mr-1" />
                      Add Highlight
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-slate-400">
                <GraduationCap className="w-4 h-4" />
                <h3 className="text-xs font-bold uppercase tracking-wider">Education</h3>
              </div>
              <Button variant="ghost" size="sm" onClick={() => {
                if (!currentCv) return;
                const newEdu = { school: "", degree: "", location: "", graduationDate: "" };
                setCurrentCv({
                  ...currentCv,
                  content: { ...currentCv.content, education: [...(currentCv.content.education || []), newEdu] }
                });
              }}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            <div className="space-y-4">
              {currentCv?.content.education?.map((edu, i) => (
                <div 
                  key={i} 
                  draggable
                  onDragStart={() => setDraggedEduIndex(i)}
                  onDragEnd={() => setDraggedEduIndex(null)}
                  onDragOver={(e) => {
                    if (draggedEduIndex !== null) e.preventDefault();
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (draggedEduIndex !== null) {
                      moveEducation(draggedEduIndex, i);
                      setDraggedEduIndex(null);
                    }
                  }}
                  className={cn(
                    "p-4 bg-slate-50 rounded-xl border border-slate-100 space-y-3 relative group transition-all",
                    draggedEduIndex === i ? "opacity-40 border-dashed border-indigo-400" : ""
                  )}
                >
                  <div className="flex items-center justify-between pb-1.5 border-b border-slate-200/60">
                    <div className="flex items-center gap-1">
                      <div 
                        className="cursor-grab active:cursor-grabbing p-1 text-slate-400 hover:text-slate-600 rounded hover:bg-slate-200/60 transition-colors"
                        title="Drag to reorder education"
                      >
                        <GripVertical className="w-3.5 h-3.5" />
                      </div>
                      <div className="flex items-center">
                        <button
                          type="button"
                          disabled={i === 0}
                          onClick={() => moveEducation(i, i - 1)}
                          title="Move education up"
                          className="p-1 rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 disabled:opacity-20 disabled:pointer-events-none transition-colors"
                        >
                          <ChevronUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={i === (currentCv.content.education?.length || 0) - 1}
                          onClick={() => moveEducation(i, i + 1)}
                          title="Move education down"
                          className="p-1 rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 disabled:opacity-20 disabled:pointer-events-none transition-colors"
                        >
                          <ChevronDown className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1 truncate max-w-[150px]">
                        {edu.degree || edu.school || `Degree #${i + 1}`}
                      </span>
                    </div>
                    <button 
                      type="button"
                      onClick={() => {
                        const newEdu = [...(currentCv.content.education || [])];
                        newEdu.splice(i, 1);
                        setCurrentCv({ ...currentCv, content: { ...currentCv.content, education: newEdu } });
                      }}
                      className="p-1 text-slate-300 hover:text-rose-500 rounded hover:bg-rose-50 transition-colors"
                      title="Delete education"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <Input 
                    placeholder="School / University" 
                    value={edu.school}
                    className="bg-white"
                    onChange={(e) => {
                      const newEdu = [...(currentCv.content.education || [])];
                      newEdu[i] = { ...newEdu[i], school: e.target.value };
                      setCurrentCv({ ...currentCv, content: { ...currentCv.content, education: newEdu } });
                    }}
                  />
                  <Input 
                    placeholder="Degree / Field of Study" 
                    value={edu.degree}
                    className="bg-white"
                    onChange={(e) => {
                      const newEdu = [...(currentCv.content.education || [])];
                      newEdu[i] = { ...newEdu[i], degree: e.target.value };
                      setCurrentCv({ ...currentCv, content: { ...currentCv.content, education: newEdu } });
                    }}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Input 
                      placeholder="Location" 
                      value={edu.location}
                      className="bg-white"
                      onChange={(e) => {
                        const newEdu = [...(currentCv.content.education || [])];
                        newEdu[i] = { ...newEdu[i], location: e.target.value };
                        setCurrentCv({ ...currentCv, content: { ...currentCv.content, education: newEdu } });
                      }}
                    />
                    <Input 
                      placeholder="Graduation Date" 
                      value={edu.graduationDate}
                      className="bg-white"
                      onChange={(e) => {
                        const newEdu = [...(currentCv.content.education || [])];
                        newEdu[i] = { ...newEdu[i], graduationDate: e.target.value };
                        setCurrentCv({ ...currentCv, content: { ...currentCv.content, education: newEdu } });
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-slate-400">
                <CheckCircle2 className="w-4 h-4" />
                <h3 className="text-xs font-bold uppercase tracking-wider">Skills</h3>
              </div>
              <Button variant="ghost" size="sm" onClick={() => {
                if (!currentCv) return;
                setCurrentCv({
                  ...currentCv,
                  content: { ...currentCv.content, skills: [...(currentCv.content.skills || []), ""] }
                });
              }}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            <div className="grid grid-cols-1 gap-2">
              {currentCv?.content.skills?.map((skill, i) => (
                <div 
                  key={i} 
                  draggable
                  onDragStart={() => setDraggedSkillIndex(i)}
                  onDragEnd={() => setDraggedSkillIndex(null)}
                  onDragOver={(e) => {
                    if (draggedSkillIndex !== null) e.preventDefault();
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (draggedSkillIndex !== null) {
                      moveSkill(draggedSkillIndex, i);
                      setDraggedSkillIndex(null);
                    }
                  }}
                  className={cn(
                    "flex gap-1.5 items-center group bg-slate-50 p-1.5 rounded-xl border border-slate-100 transition-all",
                    draggedSkillIndex === i ? "opacity-35 border-dashed border-indigo-400" : ""
                  )}
                >
                  <div className="flex items-center gap-0.5 text-slate-400 shrink-0">
                    <div 
                      className="cursor-grab active:cursor-grabbing p-1 text-slate-400 hover:text-slate-600 rounded hover:bg-slate-200/60 transition-colors"
                      title="Drag to reorder skill"
                    >
                      <GripVertical className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex flex-col -space-y-0.5">
                      <button
                        type="button"
                        disabled={i === 0}
                        onClick={() => moveSkill(i, i - 1)}
                        title="Move skill up"
                        className="p-0.5 rounded text-slate-400 hover:text-indigo-600 hover:bg-slate-200/50 disabled:opacity-15 disabled:pointer-events-none transition-colors"
                      >
                        <ChevronUp className="w-2.5 h-2.5" />
                      </button>
                      <button
                        type="button"
                        disabled={i === (currentCv.content.skills?.length || 0) - 1}
                        onClick={() => moveSkill(i, i + 1)}
                        title="Move skill down"
                        className="p-0.5 rounded text-slate-400 hover:text-indigo-600 hover:bg-slate-200/50 disabled:opacity-15 disabled:pointer-events-none transition-colors"
                      >
                        <ChevronDown className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  </div>
                  <Input 
                    placeholder="Skill" 
                    value={skill}
                    className="h-8 text-xs flex-1 bg-white"
                    onChange={(e) => {
                      const newSkills = [...(currentCv.content.skills || [])];
                      newSkills[i] = e.target.value;
                      setCurrentCv({ ...currentCv, content: { ...currentCv.content, skills: newSkills } });
                    }}
                  />
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-8 w-8 p-0 text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg"
                    onClick={() => {
                      const newSkills = [...(currentCv.content.skills || [])];
                      newSkills.splice(i, 1);
                      setCurrentCv({ ...currentCv, content: { ...currentCv.content, skills: newSkills } });
                    }}
                    title="Delete skill"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </section>

          <section>
            <div className="grid grid-cols-2 gap-3">
              <button 
                onClick={() => {
                  setActiveTemplate("modern");
                  if (currentCv) setCurrentCv({ ...currentCv, template: "modern" });
                }}
                className={cn(
                  "p-3 rounded-xl border-2 transition-all text-left",
                  activeTemplate === "modern" ? "border-indigo-600 bg-indigo-50" : "border-slate-100 hover:border-slate-200"
                )}
              >
                <div className="w-full aspect-[3/4] bg-slate-200 rounded mb-2" />
                <span className="text-xs font-bold">Modern</span>
              </button>
              <button 
                onClick={() => {
                  setActiveTemplate("minimal");
                  if (currentCv) setCurrentCv({ ...currentCv, template: "minimal" });
                }}
                className={cn(
                  "p-3 rounded-xl border-2 transition-all text-left",
                  activeTemplate === "minimal" ? "border-indigo-600 bg-indigo-50" : "border-slate-100 hover:border-slate-200"
                )}
              >
                <div className="w-full aspect-[3/4] bg-slate-200 rounded mb-2" />
                <span className="text-xs font-bold">Minimal</span>
              </button>
            </div>
          </section>
        </aside>

        {/* Preview Area */}
        <main className="flex-1 overflow-y-auto p-12 bg-slate-100 relative">
          {isDiffMode && (
            <div className="absolute top-6 left-1/2 -translate-x-1/2 z-20 flex items-center gap-6 bg-white/95 backdrop-blur-md px-8 py-4 rounded-3xl shadow-2xl border border-indigo-100 min-w-[600px]">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-rose-500 animate-pulse shadow-[0_0_10px_rgba(244,63,94,0.5)]" />
                <div className="flex flex-col">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Optimization Preview</span>
                  <span className="text-sm font-bold text-slate-900">Review AI Improvements</span>
                </div>
              </div>
              
              <div className="h-10 w-px bg-slate-200" />
              
              {pendingOptimizedCv?.content.matchRate && (
                <div className="flex items-center gap-6">
                  <div className="flex flex-col items-center">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">Original Match</span>
                    <div className="flex items-baseline gap-0.5">
                      <span className="text-xl font-black text-slate-400">{pendingOptimizedCv.content.matchRate.original}</span>
                      <span className="text-[10px] font-bold text-slate-300">/10</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-center relative">
                    <div className="absolute -top-1 -right-1">
                      <Sparkles className="w-3 h-3 text-emerald-500 animate-bounce" />
                    </div>
                    <span className="text-[9px] font-bold text-emerald-600 uppercase tracking-tighter">Optimized Match</span>
                    <div className="flex items-baseline gap-0.5">
                      <span className="text-2xl font-black text-emerald-600">{pendingOptimizedCv.content.matchRate.optimized}</span>
                      <span className="text-[10px] font-bold text-emerald-300">/10</span>
                    </div>
                  </div>
                  <div className="max-w-[180px] group relative">
                    <p className="text-[10px] text-slate-500 line-clamp-2 leading-tight italic cursor-help">
                      "{pendingOptimizedCv.content.matchRate.explanation}"
                    </p>
                    <div className="absolute top-full left-0 mt-2 hidden group-hover:block bg-slate-900 text-white text-[10px] p-3 rounded-xl shadow-xl z-50 w-64 border border-slate-700">
                      {pendingOptimizedCv.content.matchRate.explanation}
                      <div className="absolute -top-1 left-4 w-2 h-2 bg-slate-900 rotate-45" />
                    </div>
                  </div>
                </div>
              )}

              <div className="h-10 w-px bg-slate-200" />
              
              <div className="flex gap-3">
                <Button size="sm" variant="outline" className="rounded-xl px-5" onClick={handleDiscardOptimization}>Discard</Button>
                <Button size="sm" variant="primary" className="rounded-xl px-5 shadow-lg shadow-indigo-200" onClick={handleCommitOptimization}>Commit Changes</Button>
              </div>
            </div>
          )}
          <div className="max-w-[800px] mx-auto">
            {activeTemplate === "modern" ? (
              <ModernTemplate 
                data={isDiffMode && pendingOptimizedCv ? pendingOptimizedCv.content : currentCv!.content} 
                oldData={isDiffMode ? currentCv!.content : undefined}
              />
            ) : (
              <MinimalTemplate 
                data={isDiffMode && pendingOptimizedCv ? pendingOptimizedCv.content : currentCv!.content} 
                oldData={isDiffMode ? currentCv!.content : undefined}
              />
            )}
          </div>
        </main>
      </div>

      {/* Optimization Modal */}
      <AnimatePresence>
        {showJobModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowJobModal(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative bg-white rounded-3xl p-8 w-full max-w-xl shadow-2xl"
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-indigo-100 rounded-2xl flex items-center justify-center">
                  <Wand2 className="text-indigo-600 w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold">
                    {optimizeTab === "pivot" ? "Adapt CV to Role (Pivot)" : "Optimize for Job"}
                  </h2>
                  <p className="text-slate-500 text-sm">
                    {optimizeTab === "pivot" 
                      ? "Reframe and highlight transferable strengths for a related position."
                      : "Tailor your CV to match a specific job description or post."}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-2xl mb-6">
                <button 
                  onClick={() => setOptimizeTab("pivot")}
                  className={cn(
                    "flex-1 py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5",
                    optimizeTab === "pivot" ? "bg-white text-indigo-600 shadow-xs" : "text-slate-500 hover:text-slate-700"
                  )}
                >
                  <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Role Pivot</span>
                </button>
                <button 
                  onClick={() => setOptimizeTab("manual")}
                  className={cn(
                    "flex-1 py-2 text-xs font-bold rounded-xl transition-all",
                    optimizeTab === "manual" ? "bg-white text-indigo-600 shadow-xs" : "text-slate-500 hover:text-slate-700"
                  )}
                >
                  Manual Job
                </button>
                <button 
                  onClick={() => setOptimizeTab("link")}
                  className={cn(
                    "flex-1 py-2 text-xs font-bold rounded-xl transition-all",
                    optimizeTab === "link" ? "bg-white text-indigo-600 shadow-xs" : "text-slate-500 hover:text-slate-700"
                  )}
                >
                  Job Link
                </button>
              </div>
              
              {optimizeTab === "pivot" ? (
                <div className="space-y-4 mb-6">
                  <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-2xl flex items-start gap-3">
                    <div className="w-8 h-8 rounded-xl bg-white flex items-center justify-center shrink-0 shadow-xs">
                      <Sparkles className="w-4 h-4 text-indigo-600" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-indigo-900 mb-0.5">Generic Career Transition & Adaptation</p>
                      <p className="text-xs text-indigo-700 leading-relaxed">
                        Reposition your CV to emphasize transferable competencies, cross-functional leadership, and operational strengths without requiring a specific job link.
                      </p>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                      Popular Target Roles
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        "Project Manager",
                        "Product Manager",
                        "Scrum Master",
                        "Engineering Manager",
                        "Operations Manager",
                        "Business Analyst",
                        "Team Lead",
                        "Customer Success Manager",
                        "Technical Program Manager"
                      ].map((role) => (
                        <button
                          key={role}
                          type="button"
                          onClick={() => setTargetRole(role)}
                          className={cn(
                            "px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all",
                            targetRole === role
                              ? "bg-indigo-600 border-indigo-600 text-white shadow-xs"
                              : "bg-white border-slate-200 text-slate-700 hover:border-indigo-300 hover:bg-slate-50"
                          )}
                        >
                          {role}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Target Role / Position <span className="text-rose-500">*</span>
                    </label>
                    <Input 
                      placeholder="e.g. Project Manager, Operations Director, Product Lead..." 
                      className="h-11 px-4 rounded-xl text-sm"
                      value={targetRole}
                      onChange={(e) => setTargetRole(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Focus Areas or Transferable Strengths <span className="text-slate-400 font-normal normal-case">(optional)</span>
                    </label>
                    <TextArea 
                      placeholder="e.g. Agile sprint planning, cross-functional stakeholder management, milestone delivery, risk mitigation, budget management..." 
                      className="min-h-[100px] text-xs"
                      value={focusAreas}
                      onChange={(e) => setFocusAreas(e.target.value)}
                    />
                  </div>
                </div>
              ) : optimizeTab === "manual" ? (
                <TextArea 
                  placeholder="Paste job description here..." 
                  className="min-h-[250px] mb-6"
                  value={jobDesc}
                  onChange={(e) => setJobDesc(e.target.value)}
                />
              ) : (
                <div className="space-y-4 mb-6">
                  <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-2xl flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center shrink-0 shadow-sm">
                      <Sparkles className="w-4 h-4 text-indigo-600" />
                    </div>
                    <p className="text-xs text-indigo-700 leading-relaxed">
                      Paste the link to the job posting (LinkedIn, Indeed, etc.) and our AI will extract the key requirements for you.
                    </p>
                  </div>
                  <Input 
                    placeholder="https://www.linkedin.com/jobs/view/..." 
                    className="h-12 px-4 rounded-xl"
                    value={jobUrl}
                    onChange={(e) => setJobUrl(e.target.value)}
                  />
                  <TextArea 
                    placeholder="Any additional context? (optional)" 
                    className="min-h-[120px]"
                    value={jobDesc}
                    onChange={(e) => setJobDesc(e.target.value)}
                  />
                </div>
              )}

              {error && (
                <div className="mb-6 p-4 bg-rose-50 border border-rose-100 text-rose-600 rounded-2xl text-xs font-medium flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                  {error}
                </div>
              )}

              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setShowJobModal(false)}>Cancel</Button>
                <Button 
                  variant="primary" 
                  className="flex-1" 
                  onClick={handleOptimize}
                  disabled={
                    isOptimizing || 
                    isIdentifyingSkills || 
                    (optimizeTab === "pivot" 
                      ? !targetRole.trim() 
                      : optimizeTab === "manual" 
                      ? !jobDesc.trim() 
                      : !jobUrl.trim())
                  }
                >
                  {isOptimizing || isIdentifyingSkills ? (
                    <div className="flex flex-col items-center gap-1">
                      <div className="flex items-center gap-2">
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                        >
                          <Wand2 className="w-4 h-4" />
                        </motion.div>
                        <span>{isIdentifyingSkills ? "Analyzing Transferable Skills..." : "Adapting CV..."}</span>
                      </div>
                      <span className="text-[10px] font-normal opacity-70">{loadingMessage}</span>
                    </div>
                  ) : optimizeTab === "pivot" ? "Adapt to Role" : "Optimize Now"}
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Skills Check Modal */}
      <AnimatePresence>
        {showSkillsModal && missingSkills.length > 0 && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative bg-white rounded-3xl p-8 w-full max-w-lg shadow-2xl overflow-hidden"
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
                    <CheckCircle2 className="text-emerald-600 w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold">Skill Verification</h2>
                    <p className="text-slate-500 text-xs">Step {currentSkillIndex + 1} of {missingSkills.length}</p>
                  </div>
                </div>
                <button onClick={() => setShowSkillsModal(false)} className="text-slate-400 hover:text-slate-600">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="mb-8">
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 mb-4">
                  <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider mb-1 block">Missing Skill</span>
                  <h3 className="text-lg font-bold text-slate-900 mb-2">{missingSkills[currentSkillIndex].skill}</h3>
                  <p className="text-sm text-slate-600 leading-relaxed italic">
                    "{missingSkills[currentSkillIndex].reason}"
                  </p>
                </div>

                <p className="text-sm font-medium text-slate-700 mb-4">Do you have experience with this skill?</p>
                
                <div className="grid grid-cols-2 gap-3">
                  <Button 
                    variant="outline" 
                    className="h-12 rounded-xl border-slate-200 hover:bg-slate-50"
                    onClick={() => {
                      if (currentSkillIndex < missingSkills.length - 1) {
                        setCurrentSkillIndex(prev => prev + 1);
                      } else {
                        setShowSkillsModal(false);
                        runFinalOptimization(confirmedSkills);
                      }
                    }}
                  >
                    No, skip it
                  </Button>
                  <Button 
                    variant="primary" 
                    className="h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-100"
                    onClick={() => {
                      const skill = missingSkills[currentSkillIndex];
                      if (currentCv?.content.experience && currentCv.content.experience.length > 0) {
                        setSelectingExperienceFor(skill.skill);
                      } else {
                        const newConfirmed = [...confirmedSkills, { skill: skill.skill, placement: "skills" as const }];
                        setConfirmedSkills(newConfirmed);
                        if (currentSkillIndex < missingSkills.length - 1) {
                          setCurrentSkillIndex(prev => prev + 1);
                        } else {
                          setShowSkillsModal(false);
                          runFinalOptimization(newConfirmed);
                        }
                      }
                    }}
                  >
                    Yes, I have it
                  </Button>
                </div>
              </div>

              {/* Experience Selection Overlay */}
              <AnimatePresence>
                {selectingExperienceFor && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="absolute inset-0 bg-white rounded-3xl p-8 flex flex-col z-10"
                  >
                    <h3 className="text-lg font-bold mb-1 text-slate-900">Where did you apply this skill?</h3>
                    <p className="text-slate-500 text-xs mb-4">Select the role where you used <strong className="text-indigo-600 font-bold">{selectingExperienceFor}</strong>.</p>
                    
                    <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                      {currentCv?.content.experience.map((exp, idx) => (
                        <button
                          key={idx}
                          onClick={() => {
                            const filtered = confirmedSkills.filter(
                              (cs) => cs.skill.toLowerCase().trim() !== selectingExperienceFor.toLowerCase().trim()
                            );
                            const newConfirmed = [
                              ...filtered,
                              {
                                skill: selectingExperienceFor,
                                placement: `${exp.position} at ${exp.company}`,
                                company: exp.company,
                                position: exp.position,
                              },
                            ];
                            setConfirmedSkills(newConfirmed);
                            setSelectingExperienceFor(null);
                            if (currentSkillIndex < missingSkills.length - 1) {
                              setCurrentSkillIndex((prev) => prev + 1);
                            } else {
                              setShowSkillsModal(false);
                              runFinalOptimization(newConfirmed);
                            }
                          }}
                          className="w-full p-3.5 text-left bg-slate-50 hover:bg-indigo-50 border border-slate-100 hover:border-indigo-200 rounded-2xl transition-all group"
                        >
                          <div className="font-bold text-slate-900 group-hover:text-indigo-700 text-sm">{exp.position}</div>
                          <div className="text-xs text-slate-500">{exp.company} • {exp.startDate} – {exp.endDate}</div>
                        </button>
                      ))}
                      <button
                        onClick={() => {
                          const filtered = confirmedSkills.filter(
                            (cs) => cs.skill.toLowerCase().trim() !== selectingExperienceFor.toLowerCase().trim()
                          );
                          const newConfirmed = [
                            ...filtered,
                            { skill: selectingExperienceFor, placement: "skills" as const },
                          ];
                          setConfirmedSkills(newConfirmed);
                          setSelectingExperienceFor(null);
                          if (currentSkillIndex < missingSkills.length - 1) {
                            setCurrentSkillIndex((prev) => prev + 1);
                          } else {
                            setShowSkillsModal(false);
                            runFinalOptimization(newConfirmed);
                          }
                        }}
                        className="w-full p-3.5 text-left bg-slate-50 hover:bg-indigo-50 border border-slate-100 hover:border-indigo-200 rounded-2xl transition-all group"
                      >
                        <div className="font-bold text-slate-900 group-hover:text-indigo-700 text-sm">Just add to Skills section</div>
                        <div className="text-xs text-slate-500">Add to general skills list only</div>
                      </button>
                    </div>
                    
                    <Button 
                      variant="ghost" 
                      className="mt-3"
                      onClick={() => setSelectingExperienceFor(null)}
                    >
                      Back
                    </Button>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="flex justify-center gap-1 mt-4">
                {missingSkills.map((_, i) => (
                  <div 
                    key={i} 
                    className={cn(
                      "h-1 rounded-full transition-all",
                      i === currentSkillIndex ? "w-4 bg-indigo-600" : "w-1 bg-slate-200"
                    )} 
                  />
                ))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {renderModals()}
    </div>
  );
}
