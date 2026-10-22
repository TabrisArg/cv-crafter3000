import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  FileUp, 
  Sparkles, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  Copy, 
  FileText, 
  Scan, 
  ArrowLeft, 
  Check, 
  ShieldCheck, 
  Cpu, 
  ListChecks, 
  Tag, 
  Wrench, 
  Layers, 
  RefreshCw,
  Zap,
  Download,
  Code,
  Terminal,
  Eye,
  Building,
  Briefcase,
  GraduationCap,
  User,
  Mail,
  Phone,
  MapPin,
  Globe,
  Search,
  Award,
  ExternalLink
} from "lucide-react";
import mammoth from "mammoth";
import { 
  scanCVForATSFromText, 
  scanCVForATSFromMultimodal, 
  scanCVForATSFromCVData, 
  type ATSScanResult, 
  type CVData 
} from "../lib/gemini";

interface CV {
  id: string;
  title: string;
  content: CVData;
  template: string;
  updated_at: string;
}

interface ATSScannerProps {
  cvs: CV[];
  currentCv?: CV | null;
  onBack: () => void;
  onOpenInEditor?: (cvContent: CVData, title?: string) => void;
  showToast: (message: string, type?: "success" | "error") => void;
}

const SCAN_STEPS = [
  "Stripping graphics, layout columns, and styling layers...",
  "Simulating enterprise ATS linear plain-text stream...",
  "Parsing candidate contact entities & email headers...",
  "Auditing standard section headings & date formats...",
  "Indexing technical keywords & skills for recruiter search...",
  "Calculating ATS readability & compatibility score..."
];

export function ATSScanner({ cvs, currentCv, onBack, onOpenInEditor, showToast }: ATSScannerProps) {
  // Available input tabs: "active" (if active CV), "library" (saved CVs), "upload" (file)
  const initialTab = currentCv ? "active" : cvs.length > 0 ? "library" : "upload";
  const [activeInputTab, setActiveInputTab] = useState<"active" | "library" | "upload">(initialTab);
  
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [selectedCvId, setSelectedCvId] = useState<string>(currentCv?.id || cvs[0]?.id || "");
  const [isScanning, setIsScanning] = useState(false);
  const [scanStepIndex, setScanStepIndex] = useState(0);
  const [scanResult, setScanResult] = useState<ATSScanResult | null>(null);
  const [activeResultTab, setActiveResultTab] = useState<"recruiter" | "overview" | "raw" | "sections" | "keywords">("recruiter");
  const [recruiterPlatform, setRecruiterPlatform] = useState<"workday" | "greenhouse" | "lever">("workday");
  const [copiedRaw, setCopiedRaw] = useState(false);
  const [rawViewMode, setRawViewMode] = useState<"stream" | "classifier" | "json">("stream");
  const [copiedJson, setCopiedJson] = useState(false);

  const downloadRawText = () => {
    if (!scanResult) return;
    const blob = new Blob([scanResult.rawExtractedText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "ats_machine_reader_stream.txt";
    link.click();
    URL.revokeObjectURL(url);
    showToast("Downloaded machine text stream!");
  };

  const copyJsonOutput = () => {
    if (!scanResult) return;
    navigator.clipboard.writeText(JSON.stringify(scanResult, null, 2)).then(() => {
      setCopiedJson(true);
      showToast("ATS JSON payload copied!");
      setTimeout(() => setCopiedJson(false), 2500);
    });
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleRunScan = async (targetCvContent?: CVData) => {
    setIsScanning(true);
    setScanResult(null);
    setScanStepIndex(0);

    const stepInterval = setInterval(() => {
      setScanStepIndex((prev) => (prev < SCAN_STEPS.length - 1 ? prev + 1 : prev));
    }, 2200);

    try {
      let result: ATSScanResult;

      if (targetCvContent) {
        result = await scanCVForATSFromCVData(targetCvContent);
      } else if (activeInputTab === "active" && currentCv) {
        result = await scanCVForATSFromCVData(currentCv.content);
      } else if (activeInputTab === "library") {
        const targetCv = cvs.find((c) => c.id === selectedCvId) || currentCv;
        if (!targetCv) {
          showToast("Please select a CV from your library to scan.", "error");
          setIsScanning(false);
          clearInterval(stepInterval);
          return;
        }
        result = await scanCVForATSFromCVData(targetCv.content);
      } else if (activeInputTab === "upload") {
        if (!uploadedFile) {
          showToast("Please select a file to scan.", "error");
          setIsScanning(false);
          clearInterval(stepInterval);
          return;
        }

        const fileName = uploadedFile.name.toLowerCase();
        if (fileName.endsWith(".txt")) {
          const text = await uploadedFile.text();
          result = await scanCVForATSFromText(text);
        } else if (fileName.endsWith(".docx") || fileName.endsWith(".doc")) {
          const arrayBuffer = await uploadedFile.arrayBuffer();
          const extracted = await mammoth.extractRawText({ arrayBuffer });
          result = await scanCVForATSFromText(extracted.value);
        } else if (fileName.endsWith(".pdf")) {
          try {
            const arrayBuffer = await uploadedFile.arrayBuffer();
            const decoder = new TextDecoder("utf-8");
            const rawPdfText = decoder.decode(arrayBuffer);
            
            const printableText = rawPdfText
              .replace(/[^\x20-\x7E\n\r\t]/g, " ")
              .replace(/\s+/g, " ");

            const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi;
            const emailsFound = printableText.match(emailRegex) || [];

            let formattedExtractedText = printableText;
            if (emailsFound.length > 0) {
              formattedExtractedText = `Email: ${emailsFound[0]}\n` + printableText;
            }

            result = await scanCVForATSFromText(formattedExtractedText);
          } catch (pdfErr) {
            console.warn("Client-side PDF text extraction warning:", pdfErr);
            const base64 = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => {
                const res = reader.result as string;
                resolve(res.split(",")[1]);
              };
              reader.onerror = () => reject(new Error("Failed to read file."));
              reader.readAsDataURL(uploadedFile);
            });

            result = await scanCVForATSFromMultimodal([
              {
                inlineData: {
                  data: base64,
                  mimeType: uploadedFile.type || "application/pdf"
                }
              }
            ]);
          }
        } else {
          // Multimodal PNG / JPG or other binary format
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              const res = reader.result as string;
              resolve(res.split(",")[1]);
            };
            reader.onerror = () => reject(new Error("Failed to read file."));
            reader.readAsDataURL(uploadedFile);
          });

          result = await scanCVForATSFromMultimodal([
            {
              inlineData: {
                data: base64,
                mimeType: uploadedFile.type || "application/pdf"
              }
            }
          ]);
        }
      } else {
        throw new Error("No CV or file selected for scanning.");
      }

      setScanResult(result);
      showToast("ATS CV Scan completed successfully!");
    } catch (err: any) {
      console.error("ATS Scan Error:", err);
      showToast(err.message || "Failed to scan CV. Please try again.", "error");
    } finally {
      clearInterval(stepInterval);
      setIsScanning(false);
    }
  };

  // Auto run scan on mount if active CV exists and hasn't been scanned yet
  useEffect(() => {
    if (currentCv && !scanResult && !isScanning) {
      handleRunScan(currentCv.content);
    }
  }, []);

  const copyRawText = () => {
    if (!scanResult) return;
    navigator.clipboard.writeText(scanResult.rawExtractedText).then(() => {
      setCopiedRaw(true);
      showToast("ATS raw stream text copied!");
      setTimeout(() => setCopiedRaw(false), 2500);
    });
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-emerald-600 bg-emerald-50 border-emerald-200";
    if (score >= 60) return "text-amber-600 bg-amber-50 border-amber-200";
    return "text-rose-600 bg-rose-50 border-rose-200";
  };

  const getBadgeColor = (status: "pass" | "warn" | "fail") => {
    if (status === "pass") return "bg-emerald-100 text-emerald-800 border-emerald-200";
    if (status === "warn") return "bg-amber-100 text-amber-800 border-amber-200";
    return "bg-rose-100 text-rose-800 border-rose-200";
  };

  const getSeverityIcon = (severity: "critical" | "warning" | "good") => {
    if (severity === "critical") return <XCircle className="w-5 h-5 text-rose-500 shrink-0" />;
    if (severity === "warning") return <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />;
    return <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />;
  };

  const activeCvTitle = currentCv?.title || "Active Resume";

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 pb-20">
      {/* Top Navbar */}
      <nav className="border-b border-slate-200 bg-white/90 backdrop-blur-md sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={onBack}
              className="flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-indigo-600 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
            <div className="h-5 w-px bg-slate-200 mx-1" />
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold shadow-md shadow-indigo-100">
                <Scan className="w-4 h-4" />
              </div>
              <span className="font-bold text-lg tracking-tight">ATS / ATO CV Scanner</span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-full">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Simulates Workday, Taleo, Greenhouse & Lever ATS Parsers</span>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 pt-8">
        {/* Header Hero */}
        <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 mb-1 flex items-center gap-3">
              Automated ATS Resume Audit
            </h1>
            <p className="text-slate-600 max-w-2xl text-sm">
              See how enterprise ATS engines parse, index, and score your CV. Detect unreadable text layers, non-standard section titles, and missing keyword tags.
            </p>
          </div>

          {currentCv && (
            <button
              onClick={() => handleRunScan(currentCv.content)}
              disabled={isScanning}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-xs tracking-wide shadow-md shadow-indigo-200 transition-all flex items-center gap-2 shrink-0 self-start md:self-auto"
            >
              <RefreshCw className={`w-4 h-4 ${isScanning ? "animate-spin" : ""}`} />
              <span>Re-Scan Active CV</span>
            </button>
          )}
        </div>

        {/* Input Selector Card */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-8">
          {/* Source Select Tabs */}
          <div className="flex items-center gap-2 border-b border-slate-200 pb-4 mb-6 overflow-x-auto">
            {currentCv && (
              <button
                onClick={() => setActiveInputTab("active")}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                  activeInputTab === "active"
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-100"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                <Zap className="w-4 h-4 text-amber-300" />
                Active CV ({activeCvTitle})
              </button>
            )}

            {cvs.length > 0 && (
              <button
                onClick={() => setActiveInputTab("library")}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                  activeInputTab === "library"
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-100"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                <FileText className="w-4 h-4" />
                Select Saved CV ({cvs.length})
              </button>
            )}

            <button
              onClick={() => setActiveInputTab("upload")}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                activeInputTab === "upload"
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-100"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              <FileUp className="w-4 h-4" />
              Upload CV Document (PDF / DOCX)
            </button>
          </div>

          {/* Active Tab Details */}
          {activeInputTab === "active" && currentCv && (
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 bg-indigo-50/60 border border-indigo-200 rounded-xl gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold shrink-0">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-slate-900">{currentCv.title || "Untitled CV"}</h4>
                  <p className="text-xs text-slate-500">
                    Candidate: <span className="font-semibold">{currentCv.content?.personalInfo?.fullName || "Not specified"}</span> • {currentCv.content?.experience?.length || 0} Experience Entries
                  </p>
                </div>
              </div>

              <button
                onClick={() => handleRunScan(currentCv.content)}
                disabled={isScanning}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-xs tracking-wide shadow-md shadow-indigo-200 transition-all flex items-center gap-2 shrink-0"
              >
                <Scan className="w-4 h-4" />
                <span>Scan This CV</span>
              </button>
            </div>
          )}

          {activeInputTab === "library" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {cvs.map((cv) => {
                  const isSelected = selectedCvId === cv.id;
                  return (
                    <div
                      key={cv.id}
                      onClick={() => setSelectedCvId(cv.id)}
                      className={`p-4 rounded-xl border-2 cursor-pointer transition-all flex flex-col justify-between gap-3 ${
                        isSelected
                          ? "border-indigo-600 bg-indigo-50/60 ring-2 ring-indigo-200"
                          : "border-slate-200 bg-white hover:border-slate-300"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                          <FileText className="w-4 h-4 text-slate-600" />
                        </div>
                        {isSelected && <CheckCircle2 className="w-5 h-5 text-indigo-600 shrink-0" />}
                      </div>
                      <div>
                        <h4 className="font-bold text-sm text-slate-900 line-clamp-1">{cv.title || "Untitled CV"}</h4>
                        <p className="text-xs text-slate-500 mt-1">
                          {cv.content?.personalInfo?.fullName || "No Name"} • {cv.content?.experience?.length || 0} Roles
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={() => {
                    const targetCv = cvs.find((c) => c.id === selectedCvId);
                    if (targetCv) handleRunScan(targetCv.content);
                  }}
                  disabled={isScanning || !selectedCvId}
                  className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-xs shadow-md shadow-indigo-200 transition-all flex items-center gap-2"
                >
                  <Scan className="w-4 h-4" />
                  <span>Scan Selected CV</span>
                </button>
              </div>
            </div>
          )}

          {activeInputTab === "upload" && (
            <div>
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) setUploadedFile(file);
                }}
              />
              {!uploadedFile ? (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-300 hover:border-indigo-500 rounded-2xl p-8 flex flex-col items-center justify-center gap-3 cursor-pointer bg-slate-50/50 hover:bg-indigo-50/30 transition-all group"
                >
                  <div className="w-12 h-12 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <FileUp className="w-6 h-6" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-bold text-slate-800">Click to upload your resume document</p>
                    <p className="text-xs text-slate-400 mt-0.5">Supports PDF, DOCX, DOC, TXT, PNG, JPG</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between p-4 bg-indigo-50/70 border border-indigo-200 rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-indigo-600 text-white flex items-center justify-center">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-900">{uploadedFile.name}</p>
                      <p className="text-xs text-slate-500">{(uploadedFile.size / 1024 / 1024).toFixed(2)} MB</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setUploadedFile(null)}
                      className="text-xs font-semibold text-rose-600 hover:text-rose-800 px-3 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 transition-colors"
                    >
                      Remove
                    </button>
                    <button
                      onClick={() => handleRunScan()}
                      disabled={isScanning}
                      className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md shadow-indigo-200 transition-all flex items-center gap-2"
                    >
                      <Scan className="w-4 h-4" />
                      <span>Scan File</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Loading Progress State */}
        {isScanning && (
          <div className="bg-white rounded-2xl border border-indigo-100 p-8 shadow-xl text-center max-w-xl mx-auto my-12">
            <div className="w-16 h-16 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center mx-auto mb-4 text-indigo-600">
              <Cpu className="w-8 h-8 animate-pulse" />
            </div>
            <h3 className="font-bold text-lg text-slate-900 mb-2">Simulating Enterprise ATS Parser</h3>
            <p className="text-xs font-medium text-indigo-600 mb-6 bg-indigo-50 py-2 px-4 rounded-full inline-block border border-indigo-100">
              {SCAN_STEPS[scanStepIndex]}
            </p>
            <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
              <div
                className="bg-indigo-600 h-full transition-all duration-500 ease-out"
                style={{ width: `${((scanStepIndex + 1) / SCAN_STEPS.length) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Scan Results View */}
        {scanResult && !isScanning && (
          <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
            {/* Top Score Banner */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="flex items-center gap-6">
                <div
                  className={`w-24 h-24 rounded-2xl border-2 flex flex-col items-center justify-center shrink-0 ${getScoreColor(
                    scanResult.overallScore
                  )}`}
                >
                  <span className="text-3xl font-black">{scanResult.overallScore}</span>
                  <span className="text-[10px] font-bold uppercase tracking-wider opacity-80">/ 100 ATS</span>
                </div>

                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h2 className="text-xl font-bold text-slate-900">ATS Readability Analysis</h2>
                    <span
                      className={`text-xs px-2.5 py-0.5 rounded-full font-bold border ${getBadgeColor(
                        scanResult.overallScore >= 80 ? "pass" : scanResult.overallScore >= 60 ? "warn" : "fail"
                      )}`}
                    >
                      {scanResult.overallScore >= 80 ? "High Compatibility" : scanResult.overallScore >= 60 ? "Needs Polish" : "Parsing Blocked"}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 max-w-xl">
                    {scanResult.overallScore >= 80
                      ? "Your CV is cleanly parsed by ATS indexers. Standard section headers and contact entities were successfully identified."
                      : "Your CV contains formatting or structural issues that may prevent enterprise ATS engines from indexing your data."}
                  </p>
                </div>
              </div>

              {onOpenInEditor && currentCv && (
                <button
                  onClick={() => {
                    if (currentCv) onOpenInEditor(currentCv.content, currentCv.title);
                  }}
                  className="px-4 py-2.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-bold transition-all flex items-center gap-2 shrink-0"
                >
                  <Wrench className="w-4 h-4" />
                  Edit CV in Builder
                </button>
              )}
            </div>

            {/* Category Score Breakdown */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Contact Details</span>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-lg font-bold text-slate-900">{scanResult.scoreBreakdown.contactInformation.score}%</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${getBadgeColor(scanResult.scoreBreakdown.contactInformation.status)}`}>
                    {scanResult.scoreBreakdown.contactInformation.status.toUpperCase()}
                  </span>
                </div>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Layout & Structure</span>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-lg font-bold text-slate-900">{scanResult.scoreBreakdown.layoutAndStructure.score}%</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${getBadgeColor(scanResult.scoreBreakdown.layoutAndStructure.status)}`}>
                    {scanResult.scoreBreakdown.layoutAndStructure.status.toUpperCase()}
                  </span>
                </div>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Formatting Hygiene</span>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-lg font-bold text-slate-900">{scanResult.scoreBreakdown.formattingHygiene.score}%</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${getBadgeColor(scanResult.scoreBreakdown.formattingHygiene.status)}`}>
                    {scanResult.scoreBreakdown.formattingHygiene.status.toUpperCase()}
                  </span>
                </div>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Keyword Density</span>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-lg font-bold text-slate-900">{scanResult.scoreBreakdown.keywordDensity.score}%</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${getBadgeColor(scanResult.scoreBreakdown.keywordDensity.status)}`}>
                    {scanResult.scoreBreakdown.keywordDensity.status.toUpperCase()}
                  </span>
                </div>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Date Consistency</span>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-lg font-bold text-slate-900">{scanResult.scoreBreakdown.dateConsistency.score}%</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${getBadgeColor(scanResult.scoreBreakdown.dateConsistency.status)}`}>
                    {scanResult.scoreBreakdown.dateConsistency.status.toUpperCase()}
                  </span>
                </div>
              </div>
            </div>

            {/* Navigation Tabs for Scan Results */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="flex items-center border-b border-slate-200 overflow-x-auto bg-slate-50/50 p-2 gap-2">
                <button
                  onClick={() => setActiveResultTab("recruiter")}
                  className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
                    activeResultTab === "recruiter"
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "text-slate-700 hover:text-slate-900 bg-white border border-slate-200"
                  }`}
                >
                  <Building className="w-4 h-4" />
                  <span>Recruiter Portal View</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-extrabold ${
                    activeResultTab === "recruiter" ? "bg-white/20 text-white" : "bg-indigo-100 text-indigo-700"
                  }`}>
                    Live
                  </span>
                </button>

                <button
                  onClick={() => setActiveResultTab("overview")}
                  className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
                    activeResultTab === "overview"
                      ? "bg-white text-indigo-600 shadow border border-slate-200"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <ListChecks className="w-4 h-4" />
                  Issues & Recommendations ({scanResult.issues.length})
                </button>

                <button
                  onClick={() => setActiveResultTab("sections")}
                  className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
                    activeResultTab === "sections"
                      ? "bg-white text-indigo-600 shadow border border-slate-200"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <ShieldCheck className="w-4 h-4" />
                  Section Heading Audit
                </button>

                <button
                  onClick={() => setActiveResultTab("keywords")}
                  className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
                    activeResultTab === "keywords"
                      ? "bg-white text-indigo-600 shadow border border-slate-200"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <Tag className="w-4 h-4" />
                  Indexed Skills ({scanResult.extractedKeywords.length})
                </button>

                <button
                  onClick={() => setActiveResultTab("raw")}
                  className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
                    activeResultTab === "raw"
                      ? "bg-white text-indigo-600 shadow border border-slate-200"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <Terminal className="w-4 h-4" />
                  Raw Text & Tokenizer
                </button>
              </div>

              {/* Tab 1: Issues & Recommendations */}
              {activeResultTab === "overview" && (
                <div className="p-6 space-y-6">
                  {scanResult.quickFixes && scanResult.quickFixes.length > 0 && (
                    <div className="bg-indigo-50/60 border border-indigo-200 rounded-xl p-5">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-900 mb-3 flex items-center gap-2">
                        <Wrench className="w-4 h-4 text-indigo-600" />
                        Top Priority Quick Fixes
                      </h4>
                      <ul className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-slate-700">
                        {scanResult.quickFixes.map((fix, idx) => (
                          <li key={idx} className="flex items-start gap-2 bg-white p-2.5 rounded-lg border border-indigo-100">
                            <span className="w-4 h-4 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                              {idx + 1}
                            </span>
                            <span>{fix}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div>
                    <h3 className="text-sm font-bold text-slate-900 mb-4">Detailed ATS Audit Log</h3>
                    <div className="space-y-3">
                      {scanResult.issues.map((issue, idx) => (
                        <div
                          key={idx}
                          className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 flex items-start gap-4"
                        >
                          {getSeverityIcon(issue.severity)}
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className="text-sm font-bold text-slate-900">{issue.title}</h4>
                              <span
                                className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded ${
                                  issue.severity === "critical"
                                    ? "bg-rose-100 text-rose-800"
                                    : issue.severity === "warning"
                                    ? "bg-amber-100 text-amber-800"
                                    : "bg-emerald-100 text-emerald-800"
                                }`}
                              >
                                {issue.severity}
                              </span>
                            </div>
                            <p className="text-xs text-slate-600 mb-2">{issue.description}</p>
                            <div className="text-xs font-medium text-indigo-700 bg-indigo-50/80 p-2.5 rounded-lg border border-indigo-100 flex items-center gap-2">
                              <span className="font-bold shrink-0">Recommendation:</span>
                              <span>{issue.recommendation}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 2: Raw ATS Machine Reader Stream Showcase */}
              {activeResultTab === "raw" && (
                <div className="p-6 space-y-5">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                        <Terminal className="w-4 h-4 text-indigo-600" />
                        Machine Reader Output & Text Stream
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Inspect how ATS parsers (Workday, Taleo, Greenhouse, Lever) strip visual styling and index your CV into recruiter database fields.
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={downloadRawText}
                        className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors flex items-center gap-1.5"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Download Stream (.txt)</span>
                      </button>

                      {rawViewMode === "json" ? (
                        <button
                          onClick={copyJsonOutput}
                          className="px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold transition-colors flex items-center gap-1.5 border border-indigo-200"
                        >
                          {copiedJson ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                          <span>{copiedJson ? "Copied JSON" : "Copy JSON Payload"}</span>
                        </button>
                      ) : (
                        <button
                          onClick={copyRawText}
                          className="px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold transition-colors flex items-center gap-1.5 border border-indigo-200"
                        >
                          {copiedRaw ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                          <span>{copiedRaw ? "Copied Text" : "Copy Raw Stream"}</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Mode Selector Tabs */}
                  <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl w-fit">
                    <button
                      onClick={() => setRawViewMode("stream")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                        rawViewMode === "stream"
                          ? "bg-white text-indigo-700 shadow-sm"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      <FileText className="w-3.5 h-3.5" />
                      Plain Text Stream
                    </button>

                    <button
                      onClick={() => setRawViewMode("classifier")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                        rawViewMode === "classifier"
                          ? "bg-white text-indigo-700 shadow-sm"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      <Eye className="w-3.5 h-3.5" />
                      Line Tokenizer & Classifier
                    </button>

                    <button
                      onClick={() => setRawViewMode("json")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                        rawViewMode === "json"
                          ? "bg-white text-indigo-700 shadow-sm"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      <Code className="w-3.5 h-3.5" />
                      ATS Database JSON
                    </button>
                  </div>

                  {/* View Mode 1: Plain Text Stream */}
                  {rawViewMode === "stream" && (
                    <div className="space-y-3">
                      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-xs text-amber-800 flex items-start gap-2.5">
                        <Sparkles className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                        <span>
                          <strong>How Machines See This:</strong> Standard ATS engines flatten multi-column layouts into a single top-to-bottom plain text buffer. If contact info or headers get mixed across lines, recruiters will see garbled data.
                        </span>
                      </div>

                      <div className="bg-slate-900 text-slate-100 p-5 rounded-xl text-xs font-mono whitespace-pre-wrap max-h-[420px] overflow-y-auto leading-relaxed border border-slate-800 shadow-inner">
                        {scanResult.rawExtractedText ? (
                          scanResult.rawExtractedText
                        ) : (
                          <span className="text-slate-500 italic">No raw text stream extracted.</span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* View Mode 2: Line Tokenizer / Classifier */}
                  {rawViewMode === "classifier" && (
                    <div className="space-y-3">
                      <p className="text-xs text-slate-500">
                        Line-by-line machine reader token classification showing how standard parser rule engines categorize extracted lines:
                      </p>

                      <div className="bg-slate-950 text-slate-100 p-4 rounded-xl text-xs font-mono max-h-[420px] overflow-y-auto border border-slate-800 space-y-1.5">
                        {scanResult.rawExtractedText
                          ?.split("\n")
                          .filter((l) => l.trim().length > 0)
                          .map((line, idx) => {
                            const trimmed = line.trim();
                            const lower = trimmed.toLowerCase();
                            
                            let tag = "BODY_TEXT";
                            let badgeClass = "bg-slate-800 text-slate-300 border-slate-700";

                            if (lower.includes("@") || lower.includes("http") || /^\+?\d[\d\s\-()]{7,}\d$/.test(trimmed)) {
                              tag = "CONTACT_ENTITY";
                              badgeClass = "bg-emerald-950 text-emerald-300 border-emerald-800";
                            } else if (
                              ["experience", "work history", "employment", "education", "qualifications", "skills", "summary", "profile", "projects", "certifications"].some((kw) => lower === kw || lower.startsWith(kw) || lower.endsWith(kw)) &&
                              trimmed.length <= 45
                            ) {
                              tag = "SECTION_HEADER";
                              badgeClass = "bg-indigo-950 text-indigo-300 border-indigo-700 font-bold";
                            } else if (/\b(20\d\d|19\d\d|present|current)\b/i.test(trimmed)) {
                              tag = "DATE_ROLE_ENTRY";
                              badgeClass = "bg-blue-950 text-blue-300 border-blue-800";
                            } else if (["degree", "bachelor", "master", "phd", "university", "college"].some((kw) => lower.includes(kw))) {
                              tag = "EDUCATION_ENTRY";
                              badgeClass = "bg-purple-950 text-purple-300 border-purple-800";
                            } else if (scanResult.extractedKeywords.some((k) => lower.includes(k.keyword.toLowerCase()))) {
                              tag = "SKILL_INDEX";
                              badgeClass = "bg-amber-950 text-amber-300 border-amber-800";
                            }

                            return (
                              <div key={idx} className="flex items-start gap-3 py-1 border-b border-slate-900/60 hover:bg-slate-900/80 px-2 rounded transition-colors">
                                <span className="text-slate-600 text-[10px] w-8 text-right shrink-0 select-none">{idx + 1}</span>
                                <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border shrink-0 ${badgeClass}`}>
                                  {tag}
                                </span>
                                <span className="text-slate-200 break-all">{line}</span>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  )}

                  {/* View Mode 3: ATS Database JSON */}
                  {rawViewMode === "json" && (
                    <div className="space-y-3">
                      <p className="text-xs text-slate-500">
                        Complete candidate audit payload standard JSON structure ingested by enterprise applicant tracking webhooks:
                      </p>

                      <div className="bg-slate-950 text-emerald-400 p-5 rounded-xl text-xs font-mono max-h-[420px] overflow-y-auto border border-slate-800 shadow-inner">
                        <pre>{JSON.stringify(scanResult, null, 2)}</pre>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Primary Tab: Recruiter Portal View (Workday / Greenhouse / Lever Simulator) */}
              {activeResultTab === "recruiter" && (
                <div className="p-6 space-y-6">
                  {/* Recruiter System Header Bar */}
                  <div className="bg-slate-900 text-white p-5 rounded-2xl shadow-md border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-extrabold uppercase tracking-wide flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                          ATS Candidate Database Record
                        </span>
                        <span className="text-slate-400 text-xs font-mono">ID: ATS-2026-94812</span>
                      </div>
                      <h3 className="text-base font-bold text-white flex items-center gap-2">
                        How Recruiters See Your Candidate Profile
                      </h3>
                      <p className="text-xs text-slate-300">
                        This live simulation reflects how hiring managers view your parsed resume inside corporate ATS databases.
                      </p>
                    </div>

                    {/* Platform Selector Switcher */}
                    <div className="flex items-center bg-slate-800 p-1 rounded-xl border border-slate-700 shrink-0 self-start md:self-auto">
                      <button
                        onClick={() => setRecruiterPlatform("workday")}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                          recruiterPlatform === "workday"
                            ? "bg-indigo-600 text-white shadow"
                            : "text-slate-400 hover:text-white"
                        }`}
                      >
                        <Building className="w-3.5 h-3.5" />
                        <span>Workday</span>
                      </button>

                      <button
                        onClick={() => setRecruiterPlatform("greenhouse")}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                          recruiterPlatform === "greenhouse"
                            ? "bg-emerald-600 text-white shadow"
                            : "text-slate-400 hover:text-white"
                        }`}
                      >
                        <Briefcase className="w-3.5 h-3.5" />
                        <span>Greenhouse</span>
                      </button>

                      <button
                        onClick={() => setRecruiterPlatform("lever")}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                          recruiterPlatform === "lever"
                            ? "bg-purple-600 text-white shadow"
                            : "text-slate-400 hover:text-white"
                        }`}
                      >
                        <Layers className="w-3.5 h-3.5" />
                        <span>Lever</span>
                      </button>
                    </div>
                  </div>

                  {/* Summary Metric Cards Bar */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                      <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                        <span>Contact Entity</span>
                        <User className="w-3.5 h-3.5 text-slate-400" />
                      </div>
                      <p className="text-xs font-extrabold text-slate-900 truncate">
                        {scanResult.parsedEntities.personalInfo.fullName || currentCv?.content.personalInfo.fullName || "Candidate"}
                      </p>
                      <p className="text-[10px] font-semibold text-emerald-600 mt-1 flex items-center gap-1">
                        <Check className="w-3 h-3" /> Indexed in Database
                      </p>
                    </div>

                    <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                      <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                        <span>Email Address</span>
                        <Mail className="w-3.5 h-3.5 text-slate-400" />
                      </div>
                      <p className="text-xs font-extrabold text-slate-900 truncate">
                        {scanResult.parsedEntities.personalInfo.email || currentCv?.content.personalInfo.email || "Not Extracted"}
                      </p>
                      <p className="text-[10px] font-semibold text-emerald-600 mt-1 flex items-center gap-1">
                        {scanResult.parsedEntities.personalInfo.email ? <Check className="w-3 h-3" /> : <XCircle className="w-3 h-3 text-rose-500" />}
                        {scanResult.parsedEntities.personalInfo.email ? "Direct Contact Ready" : "Missing / Unindexed"}
                      </p>
                    </div>

                    <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                      <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                        <span>Work History</span>
                        <Briefcase className="w-3.5 h-3.5 text-slate-400" />
                      </div>
                      <p className="text-xs font-extrabold text-slate-900">
                        {scanResult.parsedEntities.workExperienceCount || currentCv?.content.experience.length || 0} Roles Parsed
                      </p>
                      <p className="text-[10px] font-semibold text-emerald-600 mt-1 flex items-center gap-1">
                        <Check className="w-3 h-3" /> Chronology Indexed
                      </p>
                    </div>

                    <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                      <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                        <span>Search Tags</span>
                        <Tag className="w-3.5 h-3.5 text-slate-400" />
                      </div>
                      <p className="text-xs font-extrabold text-slate-900">
                        {scanResult.extractedKeywords.length} Skill Tags
                      </p>
                      <p className="text-[10px] font-semibold text-indigo-600 mt-1 flex items-center gap-1">
                        <Sparkles className="w-3 h-3" /> Searchable by Recruiter
                      </p>
                    </div>
                  </div>

                  {/* PLATFORM SPECIFIC RECRUITER VIEWS */}

                  {/* 1. WORKDAY ENTERPRISE RECRUITER PORTAL */}
                  {recruiterPlatform === "workday" && (
                    <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm bg-white">
                      {/* Workday Top Navigation Header */}
                      <div className="bg-slate-800 text-white px-5 py-3.5 border-b border-slate-700 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white font-black text-xs flex items-center justify-center">
                            WD
                          </div>
                          <div>
                            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Workday Recruiting Platform</span>
                            <h4 className="text-xs font-bold text-white">Candidate Search & Application Record #WD-99214</h4>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          <span className="px-2.5 py-1 rounded bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30 text-[10px]">
                            Status: Qualified Applicant
                          </span>
                        </div>
                      </div>

                      {/* Workday Body Grid */}
                      <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
                        {/* Left Column: Contact & Metadata Card */}
                        <div className="space-y-4 md:col-span-1">
                          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                            <div className="flex items-center gap-3 pb-3 border-b border-slate-200">
                              <div className="w-12 h-12 rounded-full bg-indigo-100 text-indigo-700 font-bold text-lg flex items-center justify-center border border-indigo-200 shrink-0">
                                {(scanResult.parsedEntities.personalInfo.fullName || currentCv?.content.personalInfo.fullName || "C").charAt(0)}
                              </div>
                              <div className="min-w-0">
                                <h4 className="text-sm font-bold text-slate-900 truncate">
                                  {scanResult.parsedEntities.personalInfo.fullName || currentCv?.content.personalInfo.fullName || "Candidate Name"}
                                </h4>
                                <p className="text-xs font-semibold text-slate-500 truncate">
                                  {currentCv?.content.suggestedTitle || "Extracted Candidate Profile"}
                                </p>
                              </div>
                            </div>

                            <div className="space-y-2 text-xs">
                              <div className="flex items-center gap-2 text-slate-700">
                                <Mail className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                                <span className="font-semibold truncate">{scanResult.parsedEntities.personalInfo.email || currentCv?.content.personalInfo.email || <span className="text-rose-500 italic">Not Extracted</span>}</span>
                              </div>
                              <div className="flex items-center gap-2 text-slate-700">
                                <Phone className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                                <span className="font-semibold">{scanResult.parsedEntities.personalInfo.phone || currentCv?.content.personalInfo.phone || <span className="text-slate-400 italic">Not Extracted</span>}</span>
                              </div>
                              <div className="flex items-center gap-2 text-slate-700">
                                <MapPin className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                                <span className="font-semibold">{scanResult.parsedEntities.personalInfo.location || currentCv?.content.personalInfo.location || <span className="text-slate-400 italic">Not Extracted</span>}</span>
                              </div>
                            </div>

                            <div className="pt-3 border-t border-slate-200">
                              <span className="text-[10px] font-bold uppercase text-slate-400 block mb-1">ATS Parser Index Status</span>
                              <div className="space-y-1 text-[11px]">
                                <div className="flex items-center justify-between">
                                  <span className="text-slate-600">Contact Details</span>
                                  <span className="font-bold text-emerald-600">Indexed 100%</span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-slate-600">Work Experience</span>
                                  <span className="font-bold text-emerald-600">{scanResult.parsedEntities.workExperienceCount} Positions</span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-slate-600">Education Entries</span>
                                  <span className="font-bold text-emerald-600">{scanResult.parsedEntities.educationCount} Degrees</span>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Workday Skill Tag Cloud */}
                          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                            <h5 className="text-xs font-bold text-slate-900 mb-2 flex items-center justify-between">
                              <span>Workday Indexed Competencies</span>
                              <span className="text-[10px] text-indigo-600 font-bold">{scanResult.extractedKeywords.length} tags</span>
                            </h5>
                            <div className="flex flex-wrap gap-1.5">
                              {scanResult.extractedKeywords.map((kw, i) => (
                                <span key={i} className="px-2 py-1 rounded bg-white text-slate-700 text-[10px] font-semibold border border-slate-200">
                                  {kw.keyword}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Right Column: Workday Candidate Records */}
                        <div className="space-y-5 md:col-span-2">
                          {/* Summary Box */}
                          {currentCv?.content.summary && (
                            <div className="bg-indigo-50/50 p-4 rounded-xl border border-indigo-100">
                              <h5 className="text-xs font-bold text-indigo-950 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                                <FileText className="w-3.5 h-3.5 text-indigo-600" />
                                Candidate Executive Summary (Parsed)
                              </h5>
                              <p className="text-xs text-slate-700 leading-relaxed">
                                {currentCv.content.summary}
                              </p>
                            </div>
                          )}

                          {/* Work History */}
                          <div className="space-y-3">
                            <h5 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center justify-between">
                              <span className="flex items-center gap-1.5">
                                <Briefcase className="w-3.5 h-3.5 text-indigo-600" />
                                Work Experience Database Field Records
                              </span>
                              <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                Parsed & Standardized
                              </span>
                            </h5>

                            {currentCv && currentCv.content.experience.length > 0 ? (
                              <div className="space-y-3">
                                {currentCv.content.experience.map((exp, idx) => (
                                  <div key={idx} className="bg-white p-4 rounded-xl border border-slate-200 space-y-2">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                                      <h6 className="text-xs font-bold text-slate-900">{exp.position}</h6>
                                      <span className="text-[11px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 w-fit">
                                        {exp.startDate} – {exp.endDate}
                                      </span>
                                    </div>
                                    <div className="text-xs font-semibold text-indigo-700 flex items-center gap-2">
                                      <Building className="w-3 h-3 text-indigo-500" />
                                      <span>{exp.company}</span>
                                      {exp.location && <span className="text-slate-400 font-normal">| {exp.location}</span>}
                                    </div>
                                    {exp.highlights && exp.highlights.length > 0 && (
                                      <ul className="text-xs text-slate-600 list-disc list-inside space-y-1 pt-1">
                                        {exp.highlights.map((h, i) => (
                                          <li key={i}>{h}</li>
                                        ))}
                                      </ul>
                                    )}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs text-slate-600">
                                <p className="font-bold text-slate-800 mb-1">Parsed Experience Stream Summary:</p>
                                <p className="italic text-slate-500">
                                  {scanResult.parsedEntities.workExperienceCount > 0
                                    ? `${scanResult.parsedEntities.workExperienceCount} positions recognized from document text.`
                                    : "No explicit work history section recognized."}
                                </p>
                              </div>
                            )}
                          </div>

                          {/* Education Section */}
                          <div className="space-y-3">
                            <h5 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                              <GraduationCap className="w-3.5 h-3.5 text-indigo-600" />
                              Education & Academic Credentials
                            </h5>

                            {currentCv && currentCv.content.education.length > 0 ? (
                              <div className="space-y-2">
                                {currentCv.content.education.map((edu, idx) => (
                                  <div key={idx} className="bg-white p-3.5 rounded-xl border border-slate-200 flex items-start justify-between text-xs">
                                    <div>
                                      <h6 className="font-bold text-slate-900">{edu.degree}</h6>
                                      <p className="text-slate-600 font-medium">{edu.school}</p>
                                    </div>
                                    <span className="text-slate-500 font-medium shrink-0 bg-slate-100 px-2 py-0.5 rounded text-[10px]">
                                      {edu.graduationDate}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs text-slate-600">
                                <p className="font-semibold">Education Entries: {scanResult.parsedEntities.educationCount} parsed</p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 2. GREENHOUSE TALENT BOARD VIEW */}
                  {recruiterPlatform === "greenhouse" && (
                    <div className="border border-emerald-200 rounded-2xl overflow-hidden shadow-sm bg-white">
                      {/* Greenhouse Header */}
                      <div className="bg-emerald-900 text-white px-5 py-3.5 border-b border-emerald-800 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white font-black text-xs flex items-center justify-center">
                            GH
                          </div>
                          <div>
                            <span className="text-[10px] uppercase font-bold text-emerald-300 tracking-wider">Greenhouse Recruiting Portal</span>
                            <h4 className="text-xs font-bold text-white">Candidate Scorecard & Requisition Match</h4>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="px-3 py-1 rounded-full bg-emerald-500/30 text-emerald-200 font-extrabold text-xs border border-emerald-400/40">
                            Requisition Score: {scanResult.overallScore}%
                          </span>
                        </div>
                      </div>

                      <div className="p-6 space-y-5">
                        {/* Candidate Bio Header */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-emerald-50/60 border border-emerald-200">
                          <div>
                            <h3 className="text-base font-extrabold text-emerald-950">
                              {scanResult.parsedEntities.personalInfo.fullName || currentCv?.content.personalInfo.fullName || "Candidate"}
                            </h3>
                            <p className="text-xs font-bold text-emerald-700 mt-0.5">
                              {currentCv?.content.suggestedTitle || "Applicant Candidate"}
                            </p>
                            <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-slate-700">
                              <span className="flex items-center gap-1 font-semibold text-emerald-800">
                                <Mail className="w-3.5 h-3.5 text-emerald-600" />
                                {scanResult.parsedEntities.personalInfo.email || currentCv?.content.personalInfo.email || "No Email"}
                              </span>
                              <span className="flex items-center gap-1 font-semibold text-emerald-800">
                                <Phone className="w-3.5 h-3.5 text-emerald-600" />
                                {scanResult.parsedEntities.personalInfo.phone || currentCv?.content.personalInfo.phone || "No Phone"}
                              </span>
                              <span className="flex items-center gap-1 font-semibold text-emerald-800">
                                <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                                {scanResult.parsedEntities.personalInfo.location || currentCv?.content.personalInfo.location || "No Location"}
                              </span>
                            </div>
                          </div>

                          <div className="shrink-0 space-y-1.5 text-right">
                            <span className="inline-block px-3 py-1 bg-emerald-600 text-white font-extrabold text-xs rounded-lg shadow-sm">
                              Stage: Recruiter Review
                            </span>
                            <p className="text-[10px] text-slate-500 font-semibold block">
                              Source: Parsed Document Upload
                            </p>
                          </div>
                        </div>

                        {/* Keyword Requisition Alignment */}
                        <div>
                          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900 mb-2 flex items-center justify-between">
                            <span>Greenhouse Extracted Tags ({scanResult.extractedKeywords.length})</span>
                            <span className="text-[10px] font-bold text-emerald-600">Matched to Open Job Role</span>
                          </h4>
                          <div className="flex flex-wrap gap-1.5">
                            {scanResult.extractedKeywords.map((kw, idx) => (
                              <span
                                key={idx}
                                className="px-2.5 py-1 rounded-lg bg-emerald-100/80 text-emerald-900 text-xs font-bold border border-emerald-200"
                              >
                                #{kw.keyword}
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* Work History Summary */}
                        {currentCv && currentCv.content.experience.length > 0 && (
                          <div className="space-y-3 pt-2">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                              Greenhouse Work History Summary
                            </h4>
                            <div className="space-y-2">
                              {currentCv.content.experience.map((exp, idx) => (
                                <div key={idx} className="p-3.5 rounded-xl border border-slate-200 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                                  <div>
                                    <p className="font-extrabold text-slate-900">{exp.position}</p>
                                    <p className="text-slate-600 font-semibold">{exp.company}</p>
                                  </div>
                                  <span className="text-slate-500 font-medium bg-slate-100 px-2 py-1 rounded text-[10px] w-fit">
                                    {exp.startDate} – {exp.endDate}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* 3. LEVER PIPELINE VIEW */}
                  {recruiterPlatform === "lever" && (
                    <div className="border border-purple-200 rounded-2xl overflow-hidden shadow-sm bg-white">
                      {/* Lever Header */}
                      <div className="bg-purple-950 text-white px-5 py-3.5 border-b border-purple-900 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-purple-600 text-white font-black text-xs flex items-center justify-center">
                            LV
                          </div>
                          <div>
                            <span className="text-[10px] uppercase font-bold text-purple-300 tracking-wider">Lever Talent Pipeline</span>
                            <h4 className="text-xs font-bold text-white">Candidate Opportunity Card</h4>
                          </div>
                        </div>
                        <span className="px-2.5 py-1 bg-purple-800 text-purple-200 rounded text-xs font-bold border border-purple-700">
                          Pipeline Stage: Screen
                        </span>
                      </div>

                      <div className="p-6 space-y-5">
                        <div className="flex items-start justify-between pb-4 border-b border-slate-200">
                          <div>
                            <h3 className="text-base font-extrabold text-purple-950">
                              {scanResult.parsedEntities.personalInfo.fullName || currentCv?.content.personalInfo.fullName || "Candidate Profile"}
                            </h3>
                            <p className="text-xs text-purple-700 font-bold mt-0.5">
                              {currentCv?.content.suggestedTitle || "Applicant Candidate"}
                            </p>
                          </div>
                          <span className="text-xs font-bold text-purple-700 bg-purple-50 px-3 py-1 rounded-full border border-purple-200">
                            {scanResult.overallScore}% Requisition Match
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                          <div className="p-3 rounded-xl bg-purple-50/50 border border-purple-100">
                            <span className="text-[10px] font-bold text-purple-400 uppercase">Email Contact</span>
                            <p className="font-bold text-slate-900 truncate mt-0.5">
                              {scanResult.parsedEntities.personalInfo.email || currentCv?.content.personalInfo.email || "Missing"}
                            </p>
                          </div>
                          <div className="p-3 rounded-xl bg-purple-50/50 border border-purple-100">
                            <span className="text-[10px] font-bold text-purple-400 uppercase">Phone</span>
                            <p className="font-bold text-slate-900 truncate mt-0.5">
                              {scanResult.parsedEntities.personalInfo.phone || currentCv?.content.personalInfo.phone || "Missing"}
                            </p>
                          </div>
                          <div className="p-3 rounded-xl bg-purple-50/50 border border-purple-100">
                            <span className="text-[10px] font-bold text-purple-400 uppercase">Location</span>
                            <p className="font-bold text-slate-900 truncate mt-0.5">
                              {scanResult.parsedEntities.personalInfo.location || currentCv?.content.personalInfo.location || "Missing"}
                            </p>
                          </div>
                        </div>

                        {/* Lever Extracted Tags */}
                        <div>
                          <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2">
                            Lever Tag Cloud ({scanResult.extractedKeywords.length})
                          </h4>
                          <div className="flex flex-wrap gap-1.5">
                            {scanResult.extractedKeywords.map((kw, i) => (
                              <span key={i} className="px-2.5 py-1 rounded-full bg-purple-100 text-purple-900 text-xs font-bold border border-purple-200">
                                {kw.keyword}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Tab 4: Section Audit */}
              {activeResultTab === "sections" && (
                <div className="p-6">
                  <h3 className="text-sm font-bold text-slate-900 mb-1">Standard Section Header Recognition</h3>
                  <p className="text-xs text-slate-500 mb-4">
                    ATS indexers look for standardized section titles to place content into database fields.
                  </p>

                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider">
                        <tr>
                          <th className="p-3">Standard Section</th>
                          <th className="p-3">Detected Header in Document</th>
                          <th className="p-3">Standard Keyword?</th>
                          <th className="p-3">Audit Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {scanResult.sectionsCheck.map((sec, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/50">
                            <td className="p-3 font-bold text-slate-900">{sec.name}</td>
                            <td className="p-3 font-mono text-slate-600">{sec.extractedHeader || "—"}</td>
                            <td className="p-3">
                              {sec.isStandardHeader ? (
                                <span className="text-emerald-600 font-bold flex items-center gap-1">
                                  <Check className="w-3.5 h-3.5" /> Standard
                                </span>
                              ) : (
                                <span className="text-amber-600 font-bold">Non-Standard / Creative</span>
                              )}
                            </td>
                            <td className="p-3">
                              <span className={`px-2 py-0.5 rounded font-bold text-[10px] border ${getBadgeColor(sec.status)}`}>
                                {sec.status.toUpperCase()}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Tab 5: Indexed Skills & Keywords */}
              {activeResultTab === "keywords" && (
                <div className="p-6">
                  <h3 className="text-sm font-bold text-slate-900 mb-1">Extracted ATS Search Tags</h3>
                  <p className="text-xs text-slate-500 mb-4">
                    These keywords and skills are saved to your ATS database record so recruiters can match you when searching candidates.
                  </p>

                  <div className="flex flex-wrap gap-2">
                    {scanResult.extractedKeywords.map((kw, idx) => (
                      <div
                        key={idx}
                        className="px-3 py-1.5 rounded-xl bg-slate-100 border border-slate-200 text-xs font-semibold text-slate-800 flex items-center gap-2"
                      >
                        <span>{kw.keyword}</span>
                        <span className="text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded font-bold">
                          {kw.category}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </main>
    </div>
  );
}
