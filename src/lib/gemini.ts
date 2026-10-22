import { GoogleGenAI, Type } from "@google/genai";
import { parseATSFromText, parseATSFromCVData } from "./atsParser";

export interface CustomLink {
  title: string;
  url: string;
  position?: "header" | "bottom";
}

export interface MissingSkill {
  skill: string;
  reason: string;
  suggestedPlacement: "skills" | "experience";
}

export interface CVData {
  personalInfo: {
    fullName: string;
    email: string;
    phone: string;
    location: string;
  };
  summary: string;
  experience: Array<{
    company: string;
    position: string;
    location: string;
    startDate: string;
    endDate: string;
    highlights: string[];
  }>;
  education: Array<{
    school: string;
    degree: string;
    location: string;
    graduationDate: string;
  }>;
  skills: string[];
  customLinks?: CustomLink[];
  linksPlacement?: "header" | "bottom";
  suggestedTitle?: string;
  targetCompany?: string;
  targetPosition?: string;
  matchRate?: {
    original: number;
    optimized: number;
    explanation: string;
  };
}

export interface ATSScoreCategory {
  score: number;
  feedback: string;
  status: "pass" | "warn" | "fail";
}

export interface ATSIssue {
  severity: "critical" | "warning" | "good";
  title: string;
  description: string;
  recommendation: string;
}

export interface ATSSectionCheck {
  name: string;
  found: boolean;
  isStandardHeader: boolean;
  extractedHeader: string;
  status: "pass" | "warn" | "fail";
  feedback: string;
}

export interface ATSKeyword {
  keyword: string;
  category: string;
  frequency: number;
}

export interface ATSScanResult {
  overallScore: number;
  rawExtractedText: string;
  parsedEntities: {
    personalInfo: {
      fullName: string;
      email: string;
      phone: string;
      location: string;
      links: string[];
    };
    summary: string;
    workExperienceCount: number;
    educationCount: number;
    skillsCount: number;
    detectedJobTitles: string[];
  };
  scoreBreakdown: {
    contactInformation: ATSScoreCategory;
    layoutAndStructure: ATSScoreCategory;
    formattingHygiene: ATSScoreCategory;
    keywordDensity: ATSScoreCategory;
    dateConsistency: ATSScoreCategory;
  };
  sectionsCheck: ATSSectionCheck[];
  extractedKeywords: ATSKeyword[];
  issues: ATSIssue[];
  quickFixes: string[];
}

function getClientAI() {
  const metaEnv = (import.meta as any).env || {};
  let apiKey = "";

  try {
    apiKey = process.env.GEMINI_API_KEY || "";
  } catch (e) {
    // process not defined
  }

  if (!apiKey) {
    apiKey = metaEnv.VITE_GEMINI_API_KEY || metaEnv.GEMINI_API_KEY || "";
  }

  if (!apiKey && typeof window !== "undefined") {
    apiKey = (window as any).GEMINI_API_KEY || localStorage.getItem("GEMINI_API_KEY") || "";
  }

  if (!apiKey || apiKey.trim() === "") {
    return null;
  }
  return new GoogleGenAI({ apiKey: apiKey.trim() });
}

function cleanJsonString(str: string): string {
  return str.replace(/```json\n?|```/g, "").trim();
}

async function apiCall<T>(endpoint: string, body: any): Promise<T> {
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (netErr: any) {
    throw new Error(`Network error calling API endpoint ${endpoint}: ${netErr.message || "Failed to fetch"}`);
  }

  const contentType = response.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");

  let data: any = null;
  if (isJson) {
    try {
      data = await response.json();
    } catch (e) {
      // JSON parse error
    }
  }

  if (!response.ok) {
    if (data && data.error) {
      throw new Error(data.error);
    }
    if (response.status === 404) {
      throw new Error(`API endpoint ${endpoint} not found (404).`);
    }
    const rawText = !isJson ? await response.text() : "";
    throw new Error(`Server returned status ${response.status}${rawText ? `: ${rawText.slice(0, 100)}` : ""}`);
  }

  if (!data) {
    throw new Error(`Expected JSON response from ${endpoint} but received non-JSON payload.`);
  }

  return data as T;
}

const CV_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    personalInfo: {
      type: Type.OBJECT,
      properties: {
        fullName: { type: Type.STRING },
        email: { type: Type.STRING },
        phone: { type: Type.STRING },
        location: { type: Type.STRING },
      },
      required: ["fullName"],
    },
    summary: { type: Type.STRING },
    experience: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          company: { type: Type.STRING },
          position: { type: Type.STRING },
          location: { type: Type.STRING },
          startDate: { type: Type.STRING },
          endDate: { type: Type.STRING },
          highlights: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
      },
    },
    education: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          school: { type: Type.STRING },
          degree: { type: Type.STRING },
          location: { type: Type.STRING },
          graduationDate: { type: Type.STRING },
        },
      },
    },
    skills: { type: Type.ARRAY, items: { type: Type.STRING } },
    customLinks: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          url: { type: Type.STRING },
          position: { type: Type.STRING, enum: ["header", "bottom"] },
        },
      },
    },
    matchRate: {
      type: Type.OBJECT,
      description: "Match rate analysis between the CV and the job description",
      properties: {
        original: { type: Type.NUMBER, description: "Honest, realistic match score (1-10) of the original unedited CV based on actual job requirements" },
        optimized: { type: Type.NUMBER, description: "Honest, uninflated match score (1-10) of the optimized CV after tailoring. DO NOT default to 9 or 10 if major qualification gaps exist!" },
        explanation: { type: Type.STRING, description: "Honest, candid breakdown highlighting matched strengths and remaining qualification gaps" },
      },
      required: ["original", "optimized", "explanation"],
    },
    suggestedTitle: { type: Type.STRING },
    targetCompany: { type: Type.STRING, description: "Extracted target company name (e.g. Google, Stripe, Fishlabs GmbH)" },
    targetPosition: { type: Type.STRING, description: "Extracted target job position title (e.g. Senior Producer, Product Manager)" },
  },
  required: ["personalInfo", "summary", "experience", "education", "skills"],
};

const META_KEYWORDS = [
  "cycle date", "logic verification", "standardizing", "fix structure", 
  "highlights accurate", "no escape errors", "ok logic confirmed", "ensure experience",
  "match exactly", "context start/end", "exact strings check", "cycle check",
  "string logic", "structure values", "array fields", "fine context",
  "to drive key project initiatives", "optimize team execution", "deliver high-impact results"
];

function isMetaText(text: string): boolean {
  if (!text || typeof text !== "string") return false;
  const lower = text.toLowerCase();
  return META_KEYWORDS.some(k => lower.includes(k));
}

function cleanField(val: any, fallback: string = "", maxLength: number = 80): string {
  if (typeof val !== "string") return fallback;
  const trimmed = val.trim();
  if (!trimmed) return fallback;
  if (isMetaText(trimmed)) return fallback;
  if (trimmed.length > maxLength) return fallback;
  return trimmed;
}

function deLoopText(text: string): string {
  if (!text || typeof text !== "string") return "";
  if (isMetaText(text)) return "";
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length > 15) {
    const lowerWords = words.map(w => w.toLowerCase().replace(/[^a-z0-9]/g, ""));
    const uniqueWords = new Set(lowerWords);

    // Discard corrupt LLM token repetition loops with low unique word ratios
    if (uniqueWords.size / lowerWords.length < 0.35) {
      return "";
    }

    // Discard schema filler loops
    const schemaFillerTokens = ["format", "layout", "presentation", "pattern", "setup", "sequence", "valid", "standard", "representation", "retained", "context"];
    const fillerCount = lowerWords.filter(w => schemaFillerTokens.includes(w)).length;
    if (fillerCount / lowerWords.length > 0.25) {
      return "";
    }

    for (let phraseLen = 2; phraseLen <= 10; phraseLen++) {
      let repeatCount = 0;
      let firstPhrase = words.slice(0, phraseLen).join(" ");
      for (let i = phraseLen; i <= words.length - phraseLen; i += phraseLen) {
        if (words.slice(i, i + phraseLen).join(" ") === firstPhrase) {
          repeatCount++;
        } else {
          break;
        }
      }
      if (repeatCount >= 2) {
        return words.slice(0, phraseLen * 2).join(" ") + ".";
      }
    }
  }
  return text;
}

export function repairBrokenMarkdown(text: string): string {
  if (!text || typeof text !== "string") return text || "";

  return text
    .split("\n")
    .map((rawLine) => {
      let line = rawLine;

      // 1. Remove empty bold markers like ****
      line = line.replace(/\*{4,}/g, "");

      // 2. Fix asymmetric triple/double or single/double asterisks around a word or short phrase
      line = line.replace(/(?<!\*)\*{3}(?!\*)([^\s*][^*]*?[^\s*])\*{2}(?!\*)/g, "**$1**");
      line = line.replace(/(?<!\*)\*{2}(?!\*)([^\s*][^*]*?[^\s*])\*{3}(?!\*)/g, "**$1**");
      line = line.replace(/(?<!\*)\*(?!\*)([^\s*][^*]*?[^\s*])\*\*(?!\*)/g, "**$1**");
      line = line.replace(/(?<!\*)\*\*(?!\*)([^\s*][^*]*?[^\s*])\*(?!\*)/g, "**$1**");

      // 3. Fix spaces accidentally placed just inside bold markers: "** word**" or "**word **" -> "**word**"
      line = line.replace(/(^|[\s([{"'])\*\*\s+([^\s*][^*]*?[^\s*])\*\*(?=$|[\s.,;:!?)}\]"'])/g, "$1**$2**");
      line = line.replace(/(^|[\s([{"'])\*\*([^\s*][^*]*?[^\s*])\s+\*\*(?=$|[\s.,;:!?)}\]"'])/g, "$1**$2**");

      // 4. Remove standalone stray ** surrounded by spaces
      line = line.replace(/(?:^|\s)\*\*(?=\s|$)/g, (m) => (m.startsWith(" ") ? " " : ""));

      // 5. Pair up valid ** delimiters and fix orphan closing (word**) or orphan opening (**word)
      interface Marker {
        index: number;
        canOpen: boolean;
        canClose: boolean;
      }

      const findMarkers = (str: string): Marker[] => {
        const list: Marker[] = [];
        for (let i = 0; i < str.length - 1; i++) {
          if (str[i] === "*" && str[i + 1] === "*" && str[i - 1] !== "*" && str[i + 2] !== "*") {
            const prev = i > 0 ? str[i - 1] : "";
            const next = i + 2 < str.length ? str[i + 2] : "";
            const prevIsSpace = !prev || /\s/.test(prev);
            const nextIsSpace = !next || /\s/.test(next);
            const prevIsOpenPunct = /^[([{"'/\-–—]$/.test(prev);
            const nextIsClosePunct = /^[.,;:!?)}\]"'/\-–—%]$/.test(next);

            const canOpen = !nextIsSpace && (prevIsSpace || prevIsOpenPunct);
            const canClose = !prevIsSpace && (nextIsSpace || nextIsClosePunct || !prevIsOpenPunct);
            list.push({ index: i, canOpen, canClose });
            i++; // skip second asterisk
          }
        }
        return list;
      };

      // Iterative repair pass (up to 6 times per line to resolve all orphans cleanly)
      for (let pass = 0; pass < 6; pass++) {
        const markers = findMarkers(line);
        if (markers.length === 0) break;

        let openMarker: Marker | null = null;
        let modified = false;

        for (let mIdx = 0; mIdx < markers.length; mIdx++) {
          const m = markers[mIdx];

          if (!openMarker) {
            if (m.canOpen && !m.canClose) {
              openMarker = m;
            } else if (m.canClose && !m.canOpen) {
              // Orphan closing ** (e.g. "Spearheaded**", "Project Management:**", "microservices**")
              const prefix = line.slice(0, m.index);
              const hasColon = prefix.includes(":") || line[m.index + 2] === ":";
              const isStartColonHeader =
                mIdx === 0 && prefix.length <= 45 && hasColon && !/[.?!]/.test(prefix);

              if (isStartColonHeader) {
                const firstNonSpace = line.search(/\S/);
                const insertPos = firstNonSpace >= 0 ? firstNonSpace : 0;
                line = line.slice(0, insertPos) + "**" + line.slice(insertPos);
              } else {
                // Find the start of the word/token right before this closing **
                let wordStart = m.index;
                while (wordStart > 0 && !/[\s*([{"'/]/.test(line[wordStart - 1])) {
                  wordStart--;
                }
                if (wordStart < m.index) {
                  line = line.slice(0, wordStart) + "**" + line.slice(wordStart);
                } else {
                  // Fallback: remove stray **
                  line = line.slice(0, m.index) + line.slice(m.index + 2);
                }
              }
              modified = true;
              break;
            } else {
              // Ambiguous marker when not open -> treat as opening if followed by another marker, else orphan closing
              if (mIdx + 1 < markers.length) {
                openMarker = m;
              } else {
                let wordStart = m.index;
                while (wordStart > 0 && !/[\s*([{"'/]/.test(line[wordStart - 1])) {
                  wordStart--;
                }
                if (wordStart < m.index) {
                  line = line.slice(0, wordStart) + "**" + line.slice(wordStart);
                } else {
                  line = line.slice(0, m.index) + line.slice(m.index + 2);
                }
                modified = true;
                break;
              }
            }
          } else {
            // We currently have an open ** marker
            if (m.canClose) {
              // Valid pair closed!
              openMarker = null;
            } else if (m.canOpen && !m.canClose) {
              // Hit another opening ** while previous openMarker was never closed!
              // Close the previous openMarker at the end of its word
              let wordEnd = openMarker.index + 2;
              while (wordEnd < line.length && !/[\s*.,;:!?)}\]"'/]/.test(line[wordEnd])) {
                wordEnd++;
              }
              if (wordEnd > openMarker.index + 2) {
                line = line.slice(0, wordEnd) + "**" + line.slice(wordEnd);
              } else {
                line = line.slice(0, openMarker.index) + line.slice(openMarker.index + 2);
              }
              modified = true;
              break;
            }
          }
        }

        if (!modified && openMarker) {
          // Reached end of line with an unclosed opening **
          let wordEnd = openMarker.index + 2;
          while (wordEnd < line.length && !/[\s*.,;:!?)}\]"'/]/.test(line[wordEnd])) {
            wordEnd++;
          }
          if (wordEnd > openMarker.index + 2) {
            line = line.slice(0, wordEnd) + "**" + line.slice(wordEnd);
          } else {
            line = line.slice(0, openMarker.index) + line.slice(openMarker.index + 2);
          }
          modified = true;
        }

        if (!modified) break;
      }

      return line;
    })
    .join("\n");
}

export function fixCorruptedCasing(text: string): string {
  if (!text || typeof text !== "string") return text || "";
  let trimmed = repairBrokenMarkdown(text.trim());
  if (!trimmed) return "";

  // 1. Remove weird prompt-leak suffixes attached to words, e.g., "critical2019" -> "2019" or clean word
  trimmed = trimmed.replace(/\b([a-zA-Z]+)(critical|identify|placement|suggested)\d*\b/gi, "$1");

  // 2. Fix words with corrupted alternating casing or mixed internal capitals
  const words = trimmed.split(/(\s+)/);
  const cleanedWords = words.map(word => {
    if (/^\s+$/.test(word)) return word;
    
    // Skip legitimate technical keywords / acronyms (allowing surrounding markdown * or _)
    const strippedWord = word.trim().replace(/^[*_]+|[*_.,;:!?)]+$/g, "");
    if (/^(JavaScript|TypeScript|DevOps|GraphQL|PostgreSQL|MongoDB|LaTeX|iOS|macOS|PhD|BSc|MSc|MBA|BA|BS|MA|MS|PDF|HTML|CSS|API|APIs|UI|UX|UI\/UX|AI|ML|AWS|GCP|CI\/CD|REST|SQL|Git|GitHub|GitLab|SaaS|PaaS|IaaS|B2B|B2C|Agile|Scrum|Kanban|React|Angular|Vue|Node\.js|Next\.js|Python|C\+\+|C\#|Java|PHP|Ruby|Swift|Kotlin|Go|Rust|Docker|Kubernetes|PowerBI|HubSpot|WordPress|SharePoint|LinkedIn|YouTube|TikTok|PlayStation|Xbox|DirectX|OpenGL|WebGL|FastAPI|PyTorch|TensorFlow|DataBricks|SalesForce|OneDrive|UnrealEngine|GameMaker|Fishlabs|GmbH)$/i.test(strippedWord)) {
      return word;
    }

    const cleanWord = word.replace(/[^a-zA-Z]/g, "");
    
    // Check if word has corrupted internal capitalization (e.g. BachEloR, coMmunIcATiOn, UniVersITy, mIAnI, tEaM, mIdentify, AtTEntIon)
    const hasCorruptedCaps = /[a-z][A-Z]/.test(strippedWord) || /[A-Z]{2,}[a-z]+[A-Z]/.test(strippedWord) || /^[a-z]+[A-Z]/.test(strippedWord);
    
    if (hasCorruptedCaps && cleanWord.length > 2) {
      // Preserve any leading/trailing markdown or punctuation around the letters
      return word.replace(/[a-zA-Z]+/, (alpha) => {
        const lower = alpha.toLowerCase();
        return lower.charAt(0).toUpperCase() + lower.slice(1);
      });
    }
    return word;
  });

  return cleanedWords.join("");
}

export function formatATSDate(dateStr: string, isEndDate: boolean = false): string {
  if (!dateStr || typeof dateStr !== "string") {
    return isEndDate ? "Present" : "";
  }
  const s = dateStr.trim();
  if (!s) return isEndDate ? "Present" : "";

  const lower = s.toLowerCase();
  if (isEndDate && (lower === "present" || lower === "current" || lower === "now" || lower === "today" || lower === "ongoing")) {
    return "Present";
  }

  const monthsMap: { [key: string]: string } = {
    "01": "January", "1": "January", "jan": "January", "january": "January",
    "02": "February", "2": "February", "feb": "February", "february": "February",
    "03": "March", "3": "March", "mar": "March", "march": "March", "märz": "March",
    "04": "April", "4": "April", "apr": "April", "april": "April",
    "05": "May", "5": "May", "may": "May", "mai": "May",
    "06": "June", "6": "June", "jun": "June", "june": "June", "juni": "June",
    "07": "July", "7": "July", "jul": "July", "july": "July", "juli": "July",
    "08": "August", "8": "August", "aug": "August", "august": "August",
    "09": "September", "9": "September", "sep": "September", "sept": "September", "september": "September",
    "10": "October", "oct": "October", "october": "October", "oktober": "October",
    "11": "November", "nov": "November", "november": "November",
    "12": "December", "dec": "December", "december": "December", "dezember": "December"
  };

  // Match MM/YYYY or MM/YY or YYYY-MM
  let match = s.match(/^(\d{1,2})[\/\-\.](\d{2,4})$/);
  if (match) {
    const m = monthsMap[match[1]];
    let y = match[2];
    if (y.length === 2) y = "20" + y;
    if (m) return `${m} ${y}`;
  }

  match = s.match(/^(\d{4})[\/\-\.](\d{1,2})$/);
  if (match) {
    const m = monthsMap[match[2]];
    let y = match[1];
    if (m) return `${m} ${y}`;
  }

  // Match "Jan 2021", "January 2021", "Jan '21"
  match = s.match(/^([a-zA-Z]+)[\s,']+(\d{2,4})$/);
  if (match) {
    const m = monthsMap[match[1].toLowerCase()];
    let y = match[2];
    if (y.length === 2) y = "20" + y;
    if (m) return `${m} ${y}`;
  }

  if (/^\d{4}$/.test(s)) {
    return s;
  }

  return s;
}

export function cleanSkillName(rawSkill: string): string | null {
  if (!rawSkill || typeof rawSkill !== "string") return null;
  let s = rawSkill.trim();
  
  // Strip leading/trailing bullet markers, hyphens, dashes, quotes, and punctuation
  s = s.replace(/^[\s•\-\*\u2022\u2023\u25E6\u2043\u2219\u2013\u2014"']+|[\s\-\*\u2013\u2014"']+$|\.$/g, "").trim();
  s = s.replace(/^[-–—\s]+/, "").trim();
  
  const lower = s.toLowerCase();
  if (
    !s ||
    s.length < 2 ||
    isMetaText(s) ||
    /^(midentify|identify|missing|placement|suggestedplacement|reason|critical|targetjob|sourcecv|null|undefined|none|n\/a)$/i.test(lower) ||
    lower.includes("additional confirmed skills") ||
    lower.includes("identify missing")
  ) {
    return null;
  }

  // Fix corrupted casing
  s = fixCorruptedCasing(s);

  if (/^(midentify|identify)$/i.test(s.trim())) return null;

  return s;
}

export function normalizeCVData(
  cv: any, 
  sourceCv?: CVData, 
  additionalSkills?: Array<{ skill: string; placement: "skills" | string; company?: string; position?: string }>,
  isTranslation: boolean = false
): CVData {
  if (!cv || typeof cv !== "object") return cv || sourceCv;

  const personalInfo = {
    fullName: fixCorruptedCasing(cleanField(sourceCv?.personalInfo?.fullName || cv.personalInfo?.fullName, "", 80)),
    email: cleanField(sourceCv?.personalInfo?.email || cv.personalInfo?.email, "", 80),
    phone: cleanField(sourceCv?.personalInfo?.phone || cv.personalInfo?.phone, "", 40),
    location: isTranslation && cv.personalInfo?.location
      ? fixCorruptedCasing(cleanField(cv.personalInfo.location, sourceCv?.personalInfo?.location || "", 80))
      : fixCorruptedCasing(cleanField(cv.personalInfo?.location, sourceCv?.personalInfo?.location || "", 80)),
  };

  let rawSummary = typeof cv.summary === "string" ? cv.summary : "";
  const summary = fixCorruptedCasing(repairBrokenMarkdown(deLoopText(rawSummary) || sourceCv?.summary || ""));

  let experienceList = Array.isArray(cv.experience) ? cv.experience : [];

  let experience: Array<{
    company: string;
    position: string;
    location: string;
    startDate: string;
    endDate: string;
    highlights: string[];
  }> = [];

  if (sourceCv && Array.isArray(sourceCv.experience) && sourceCv.experience.length > 0) {
    // Strictly preserve sourceCv experience entry structure (1:1 alignment per job)
    experience = sourceCv.experience.map((srcExp, i) => {
      const matchedExp = experienceList.find((e: any) => 
        (e.company && srcExp.company && e.company.toLowerCase().trim() === srcExp.company.toLowerCase().trim()) ||
        (e.company && srcExp.company && (e.company.toLowerCase().includes(srcExp.company.toLowerCase()) || srcExp.company.toLowerCase().includes(e.company.toLowerCase()))) ||
        (e.position && srcExp.position && (e.position.toLowerCase().includes(srcExp.position.toLowerCase()) || srcExp.position.toLowerCase().includes(e.position.toLowerCase())))
      ) || experienceList[i];

      let cleanedHighlights: string[] = [];
      if (matchedExp && matchedExp.highlights) {
        let rawHighlights = Array.isArray(matchedExp.highlights) ? matchedExp.highlights : [matchedExp.highlights];
        rawHighlights.forEach((h: any) => {
          if (typeof h === "string") {
            if (isMetaText(h)) return;
            const deLooped = deLoopText(h);
            if (!deLooped || isMetaText(deLooped)) return;
            let lines = deLooped.split(/(?:\r?\n|•|\u2022|\u2023|\u25E6|\u2043|\u2219|^\s*[-*]\s+)/g);
            lines.forEach((line) => {
              const cleaned = line
                .replace(/^(?:[\s•\-\u2022\u2023\u25E6\u2043\u2219]+|\*(?!\*)\s+)+/, "")
                .replace(/^\d+[\.\)]\s*/, "")
                .trim();
              if (cleaned && cleaned.length > 3 && !isMetaText(cleaned)) {
                cleanedHighlights.push(repairBrokenMarkdown(fixCorruptedCasing(cleaned)));
              }
            });
          }
        });
      }

      // 100% ACCURACY SAFEGUARD: If translation omitted any bullet points, preserve from source
      if (isTranslation && Array.isArray(srcExp.highlights)) {
        if (cleanedHighlights.length < srcExp.highlights.length) {
          for (let j = cleanedHighlights.length; j < srcExp.highlights.length; j++) {
            cleanedHighlights.push(repairBrokenMarkdown(fixCorruptedCasing(srcExp.highlights[j])));
          }
        }
      } else if (cleanedHighlights.length === 0) {
        cleanedHighlights = [...(srcExp.highlights || [])].map(h => repairBrokenMarkdown(fixCorruptedCasing(h)));
      }

      const cleanPosition = fixCorruptedCasing(cleanField(matchedExp?.position, srcExp.position, 80));

      return {
        company: fixCorruptedCasing(cleanField(srcExp.company, "", 100)),
        position: cleanPosition || fixCorruptedCasing(srcExp.position) || "",
        location: isTranslation && matchedExp?.location
          ? fixCorruptedCasing(cleanField(matchedExp.location, srcExp.location, 80))
          : fixCorruptedCasing(cleanField(srcExp.location, "", 80)),
        startDate: isTranslation && matchedExp?.startDate
          ? fixCorruptedCasing(cleanField(matchedExp.startDate, srcExp.startDate, 30))
          : formatATSDate(cleanField(srcExp.startDate, "", 30), false),
        endDate: isTranslation && matchedExp?.endDate
          ? fixCorruptedCasing(cleanField(matchedExp.endDate, srcExp.endDate, 30))
          : formatATSDate(cleanField(srcExp.endDate, "", 30), true),
        highlights: cleanedHighlights,
      };
    });
  } else {
    experience = experienceList.map((exp: any) => {
      let rawHighlights = exp.highlights;
      let cleanedHighlights: string[] = [];

      if (typeof rawHighlights === "string") {
        rawHighlights = [rawHighlights];
      }

      if (Array.isArray(rawHighlights)) {
        rawHighlights.forEach((h: any) => {
          if (typeof h === "string") {
            if (isMetaText(h)) return;
            const deLooped = deLoopText(h);
            if (!deLooped || isMetaText(deLooped)) return;
            let lines = deLooped.split(/(?:\r?\n|•|\u2022|\u2023|\u25E6|\u2043|\u2219|^\s*[-*]\s+)/g);

            if (lines.length === 1 && lines[0].length > 220 && !lines[0].includes("**")) {
              const sentences = lines[0].split(/(?<=[.!?])\s+(?=[A-Z])/);
              if (sentences.length > 1) {
                lines = sentences;
              }
            }

            lines.forEach((line) => {
              const cleaned = line
                .replace(/^(?:[\s•\-\u2022\u2023\u25E6\u2043\u2219]+|\*(?!\*)\s+)+/, "")
                .replace(/^\d+[\.\)]\s*/, "")
                .trim();
              if (cleaned && cleaned.length > 3 && !isMetaText(cleaned)) {
                cleanedHighlights.push(repairBrokenMarkdown(fixCorruptedCasing(cleaned)));
              }
            });
          }
        });
      }

      return {
        company: fixCorruptedCasing(cleanField(exp.company, "", 100)),
        position: fixCorruptedCasing(cleanField(exp.position, "", 80)),
        location: fixCorruptedCasing(cleanField(exp.location, "", 80)),
        startDate: formatATSDate(cleanField(exp.startDate, "", 30), false),
        endDate: formatATSDate(cleanField(exp.endDate, "", 30), true),
        highlights: cleanedHighlights,
      };
    });
  }

  // Cleanse any existing repetitive boilerplate from highlights
  const isRepetitiveBoilerplate = (h: string) => {
    const lower = h.toLowerCase();
    return (
      lower.includes("to drive key project initiatives") ||
      lower.includes("optimize team execution") ||
      lower.includes("deliver high-impact results") ||
      lower.includes("deliver scalable results") ||
      lower.includes("to optimize lifecycle management and deliver scalable results") ||
      /^leveraged\s+.+\s+to\s+drive\s+key\s+project\s+initiatives/i.test(h)
    );
  };

  experience.forEach((exp) => {
    // 1. Remove repetitive boilerplate
    exp.highlights = exp.highlights.filter((h) => !isRepetitiveBoilerplate(h));

    // 2. Case-insensitive deduplication of bullets
    const seenH = new Set<string>();
    exp.highlights = exp.highlights.filter((h) => {
      const cleanH = h.replace(/[*_#]/g, "").trim().toLowerCase();
      if (!cleanH || seenH.has(cleanH)) return false;
      seenH.add(cleanH);
      return true;
    });
  });

  // Ensure confirmed skills mapped to an experience role are embedded and bolded in that role's highlights
  if (additionalSkills && Array.isArray(additionalSkills) && additionalSkills.length > 0) {
    // 1. Deduplicate confirmed skills
    const uniqueSkills: Array<{ skill: string; placement: string; company?: string; position?: string }> = [];
    const seenSkillKeys = new Set<string>();
    additionalSkills.forEach((s) => {
      const norm = (s.skill || "").toLowerCase().trim();
      if (norm && !seenSkillKeys.has(norm)) {
        seenSkillKeys.add(norm);
        uniqueSkills.push(s);
      }
    });

    const unmentionedSkillsByExp = new Map<any, string[]>();

    uniqueSkills.forEach((s) => {
      if (!s.skill || s.placement === "skills") return;
      const targetExp = experience.find((exp) => {
        const placementLower = (s.placement || "").toLowerCase();
        const companyLower = (exp.company || "").toLowerCase();
        const positionLower = (exp.position || "").toLowerCase();
        const sCompanyLower = (s.company || "").toLowerCase();
        const sPositionLower = (s.position || "").toLowerCase();

        return (
          (sCompanyLower && companyLower.includes(sCompanyLower)) ||
          (sPositionLower && positionLower.includes(sPositionLower)) ||
          (placementLower && (placementLower.includes(companyLower) || placementLower.includes(positionLower)))
        );
      });

      if (targetExp) {
        const rawSkill = s.skill.trim();
        const parenMatch = rawSkill.match(/\(([^)]+)\)/);
        const acronym = parenMatch ? parenMatch[1].trim() : "";
        const cleanName = rawSkill.replace(/\s*\([^)]*\)/g, "").trim();

        // Check if any existing highlight in targetExp already mentions this skill, clean name, or acronym
        const termsToSearch = [rawSkill, cleanName, acronym].filter((t) => t.length > 1);
        let found = false;

        targetExp.highlights = targetExp.highlights.map((h) => {
          let updatedH = h;
          for (const term of termsToSearch) {
            const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const termRegex = new RegExp(`(?<=^|\\W)(${escaped})(?=\\W|$)`, "i");
            const match = termRegex.exec(updatedH);
            if (match) {
              found = true;
              const prefix = updatedH.slice(0, match.index);
              const doubleAsteriskCount = (prefix.match(/\*\*/g) || []).length;
              if (doubleAsteriskCount % 2 === 0) {
                // Not inside bold span -> wrap in **
                updatedH =
                  updatedH.slice(0, match.index) +
                  `**${match[1]}**` +
                  updatedH.slice(match.index + match[1].length);
              }
              break;
            }
          }
          return repairBrokenMarkdown(updatedH);
        });

        if (!found) {
          if (!unmentionedSkillsByExp.has(targetExp)) {
            unmentionedSkillsByExp.set(targetExp, []);
          }
          unmentionedSkillsByExp.get(targetExp)!.push(rawSkill);
        }
      }
    });

    // Weave unmentioned skills into distinct, varied, high-caliber achievement bullets (NEVER repetitive boilerplate)
    unmentionedSkillsByExp.forEach((rawMissingList, exp) => {
      // Deduplicate missingList
      const missingList: string[] = [];
      const seen = new Set<string>();
      rawMissingList.forEach((sk) => {
        const norm = sk.toLowerCase().trim();
        if (norm && !seen.has(norm)) {
          seen.add(norm);
          missingList.push(sk.trim());
        }
      });

      if (missingList.length === 0) return;

      if (missingList.length === 1) {
        exp.highlights.unshift(
          `Spearheaded key initiatives utilizing **${missingList[0]}**, optimizing execution workflows and cross-functional team delivery.`
        );
      } else if (missingList.length === 2) {
        exp.highlights.unshift(
          `Directed production workflows leveraging **${missingList[0]}** alongside **${missingList[1]}** to streamline milestone execution.`
        );
      } else {
        const bolded = missingList.map((sk) => `**${sk}**`);
        const firstTwo = bolded.slice(0, 2).join(" and ");
        const remaining = bolded.slice(2).join(", ");
        exp.highlights.unshift(
          `Orchestrated development cycles incorporating ${firstTwo}, while integrating ${remaining} to elevate operational quality and project velocity.`
        );
      }

      // Cap at 6 bullets per role
      if (exp.highlights.length > 6) {
        exp.highlights = exp.highlights.slice(0, 6);
      }
    });
  }

  // 4. Education
  let education: Array<{
    school: string;
    degree: string;
    location: string;
    graduationDate: string;
  }> = [];

  if (sourceCv && Array.isArray(sourceCv.education) && sourceCv.education.length > 0) {
    // Preserve sourceCv education 1:1, allowing localized degree name in translation
    education = sourceCv.education.map((srcEdu, i) => {
      const matchedEdu = isTranslation && Array.isArray(cv.education)
        ? cv.education.find((e: any) => 
            (e.school && srcEdu.school && e.school.toLowerCase().includes(srcEdu.school.toLowerCase())) ||
            (e.degree && srcEdu.degree && e.degree.toLowerCase().includes(srcEdu.degree.toLowerCase()))
          ) || cv.education[i]
        : null;

      return {
        school: repairBrokenMarkdown(fixCorruptedCasing(srcEdu.school || "")),
        degree: repairBrokenMarkdown(fixCorruptedCasing(matchedEdu?.degree || srcEdu.degree || "")),
        location: repairBrokenMarkdown(fixCorruptedCasing(matchedEdu?.location || srcEdu.location || "")),
        graduationDate: isTranslation && matchedEdu?.graduationDate
          ? fixCorruptedCasing(matchedEdu.graduationDate)
          : formatATSDate(fixCorruptedCasing(srcEdu.graduationDate || ""), false),
      };
    });
  } else {
    let rawEducation = Array.isArray(cv.education) ? cv.education : [];
    education = rawEducation.map((edu: any) => ({
      school: repairBrokenMarkdown(fixCorruptedCasing(cleanField(edu.school, "", 100))),
      degree: repairBrokenMarkdown(fixCorruptedCasing(cleanField(edu.degree, "", 100))),
      location: repairBrokenMarkdown(fixCorruptedCasing(cleanField(edu.location, "", 80))),
      graduationDate: formatATSDate(cleanField(edu.graduationDate, "", 40), false),
    })).filter((edu: any) => edu.school || edu.degree);
  }

  // 5. Skills
  let skills: string[] = [];

  const addSkill = (s: any) => {
    if (!s) return;
    let str = "";
    if (typeof s === "string") {
      str = s;
    } else if (typeof s === "object") {
      str = s.name || s.skill || s.title || Object.values(s).filter(v => typeof v === "string").join(", ");
    }
    
    if (!str || typeof str !== "string") return;

    if (str.includes("\n") || (str.includes(",") && !str.includes("http"))) {
      str.split(/[\n,]/).forEach(part => {
        const cleaned = cleanSkillName(part);
        if (cleaned && !skills.some(existing => existing.toLowerCase() === cleaned.toLowerCase())) {
          skills.push(cleaned);
        }
      });
    } else {
      const cleaned = cleanSkillName(str);
      if (cleaned && !skills.some(existing => existing.toLowerCase() === cleaned.toLowerCase())) {
        skills.push(cleaned);
      }
    }
  };

  if (Array.isArray(cv.skills)) {
    cv.skills.forEach(addSkill);
  } else if (typeof cv.skills === "string") {
    addSkill(cv.skills);
  }

  // Ensure base skills from sourceCv are preserved if missing
  if (sourceCv && Array.isArray(sourceCv.skills)) {
    if (!isTranslation || skills.length === 0) {
      sourceCv.skills.forEach(addSkill);
    }
  }

  const customLinks = Array.isArray(cv.customLinks) && cv.customLinks.length > 0
    ? cv.customLinks
    : (Array.isArray(sourceCv?.customLinks) ? sourceCv.customLinks : []);

  const rawMatchRate = cv.matchRate || sourceCv?.matchRate;
  const matchRate = rawMatchRate && typeof rawMatchRate === "object"
    ? {
        original: typeof rawMatchRate.original === "number" ? Math.min(10, Math.max(1, Math.round(rawMatchRate.original))) : 5,
        optimized: typeof rawMatchRate.optimized === "number" ? Math.min(10, Math.max(1, Math.round(rawMatchRate.optimized))) : 6,
        explanation: typeof rawMatchRate.explanation === "string" ? deLoopText(rawMatchRate.explanation) : "",
      }
    : undefined;

  return {
    ...cv,
    personalInfo,
    summary,
    experience,
    education,
    skills,
    customLinks,
    matchRate,
  };
}

export async function generateCVFromMultimodal(parts: any[]): Promise<CVData> {
  try {
    const res = await apiCall<CVData>("/api/gemini/generate-cv-multimodal", { parts });
    return normalizeCVData(res);
  } catch (error: any) {
    console.info("Server API unavailable, running client Gemini AI processing for multimodal parsing...");
    const clientAi = getClientAI();
    if (!clientAi) {
      throw new Error("Backend API unavailable (404) and no VITE_GEMINI_API_KEY found. If deployed on Netlify, please add VITE_GEMINI_API_KEY to your Netlify Environment Variables and re-deploy.");
    }

    const response = await clientAi.models.generateContent({
      model: "gemini-flash-lite-latest",
      contents: { parts: [{ text: "Extract CV data into JSON." }, ...parts] },
      config: {
        systemInstruction: `You are a high-precision CV/Resume extraction engine. Your goal is to convert images/PDFs of CVs into structured JSON.
        
        STRICT OPERATIONAL GUIDELINES:
        1. JSON ONLY: Your entire response must be a single, valid JSON object matching the provided schema.
        2. NO META-COMMENTARY: Do not include any notes or conversational text outside the JSON object.
        3. EXHAUSTIVE EXTRACTION: Extract EVERY experience and education entry. Do not omit any history.
        4. CERTIFICATIONS: Professional certifications (e.g., Scrum Master, PMP, AWS Certified) MUST be placed in the 'education' section, NOT the 'skills' section. Use the issuing organization as 'school' and the certification name as 'degree'.
        5. FIELD ISOLATION: Strictly separate metadata (Company, Position, Location, Dates) from content (Highlights).
           - Dates and Locations MUST be placed in their dedicated fields ('startDate', 'endDate', 'location').
           - 'highlights' MUST ONLY contain bullet points of achievements/responsibilities. Each bullet point MUST be a separate array element.
        6. OCR PRECISION: Use high-fidelity OCR to capture every detail.
        7. BOLDING: Use Markdown bolding (**text**) for key achievements and metrics within 'summary' and 'highlights'.
        8. LINK EXTRACTION: Scrape all URLs (LinkedIn, GitHub, Portfolios) and place them in 'customLinks'.`,
        responseMimeType: "application/json",
        responseSchema: CV_SCHEMA,
        temperature: 0.1,
      },
    });
    if (!response.text) throw new Error("Empty AI response");
    const data = JSON.parse(cleanJsonString(response.text));
    return normalizeCVData(data);
  }
}

export async function generateCVFromText(text: string): Promise<CVData> {
  try {
    const res = await apiCall<CVData>("/api/gemini/generate-cv-text", { text });
    return normalizeCVData(res);
  } catch (error: any) {
    console.info("Server API unavailable, running client Gemini AI processing for text parsing...");
    const clientAi = getClientAI();
    if (!clientAi) {
      throw new Error("Backend API unavailable (404) and no VITE_GEMINI_API_KEY found. If deployed on Netlify, please add VITE_GEMINI_API_KEY to your Netlify Environment Variables and re-deploy.");
    }

    const response = await clientAi.models.generateContent({
      model: "gemini-flash-lite-latest",
      contents: { parts: [{ text: `Extract CV data from text:\n\n${text}` }] },
      config: {
        systemInstruction: `You are a high-precision CV parsing engine. Your goal is to convert CV/Resume text into structured JSON.
        
        STRICT OPERATIONAL GUIDELINES:
        1. JSON ONLY: Your entire response must be a single, valid JSON object.
        2. NO META-COMMENTARY: Do not include any notes or conversational text.
        3. EXHAUSTIVE EXTRACTION: Extract EVERY experience and education entry. Do not omit any.
        4. CERTIFICATIONS: Professional certifications (e.g., Scrum Master, PMP, AWS Certified) MUST be placed in the 'education' section, NOT the 'skills' section.
        5. FIELD ISOLATION: Strictly separate dates, locations, and company names from the 'highlights' and 'summary' fields. Move them to their dedicated JSON properties. Each highlight bullet point MUST be a separate string in the array.
        6. BOLDING: Use Markdown bolding (**text**) for key achievements and metrics.
        7. LINKS: Extract all URLs into the 'customLinks' array.`,
        responseMimeType: "application/json",
        responseSchema: CV_SCHEMA,
        temperature: 0.1,
      },
    });
    if (!response.text) throw new Error("Empty AI response");
    const data = JSON.parse(cleanJsonString(response.text));
    return normalizeCVData(data);
  }
}

export async function identifyMissingSkills(
  cv: CVData,
  jobDescription?: string,
  jobUrl?: string,
  targetRole?: string
): Promise<MissingSkill[]> {
  try {
    return await apiCall<MissingSkill[]>("/api/gemini/identify-missing-skills", { cv, jobDescription, jobUrl, targetRole });
  } catch (error: any) {
    console.info("Server API unavailable, running client Gemini AI processing for missing skills...");
    const clientAi = getClientAI();
    if (!clientAi) return [];

    try {
      let userPrompt = "";
      if (targetRole) {
        userPrompt = `Identify transferable and high-demand skills for pivoting to role "${targetRole}". ${focusPrompt(jobDescription)}`;
      } else if (jobUrl) {
        userPrompt = `Identify missing skills for job at ${jobUrl}. ${jobDescription || ""}`;
      } else {
        userPrompt = `Identify missing skills for job description: ${jobDescription || ""}`;
      }

      function focusPrompt(extra?: string) {
        return extra ? `Additional focus areas / requirements: ${extra}` : "";
      }

      const response = await clientAi.models.generateContent({
        model: "gemini-flash-lite-latest",
        contents: {
          parts: [
            { text: `CURRENT CV: ${JSON.stringify({ skills: cv.skills, experience: cv.experience.map(e => ({ company: e.company, position: e.position })) })}` },
            { text: `TARGET: ${userPrompt}` }
          ]
        },
        config: {
          systemInstruction: `You are an executive career strategist and talent acquisition specialist. Analyze the TARGET position/job and the CURRENT CV.
Identify 5-8 critical transferable or high-impact skills for this role that would strengthen the candidate's CV profile.

For each skill:
1. 'skill': Clean standard name of the skill.
2. 'reason': Clear explanation of why this skill is vital for this target position and how the candidate can highlight transferable experience.
3. 'suggestedPlacement': Where to integrate this ("skills" or "experience").

OUTPUT: Return ONLY a JSON array of objects matching the schema. No conversational prose.`,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                skill: { type: Type.STRING },
                reason: { type: Type.STRING },
                suggestedPlacement: { type: Type.STRING, enum: ["skills", "experience"] }
              },
              required: ["skill", "reason", "suggestedPlacement"]
            }
          },
          temperature: 0.1,
        },
      });
      if (!response.text) return [];
      const raw = JSON.parse(cleanJsonString(response.text));
      if (Array.isArray(raw)) {
        return raw.map((item: any) => ({
          ...item,
          skill: cleanSkillName(item.skill) || item.skill?.replace(/^[\s•\-\*\u2022\u2023\u25E6\u2043\u2219"']+|["']+$|\.$/g, "").trim(),
        })).filter((item: any) => item.skill && item.skill.length > 1);
      }
      return [];
    } catch (fallbackErr) {
      console.error("Client fallback error identifying missing skills:", fallbackErr);
      return [];
    }
  }
}

export function buildSkillsContext(
  additionalSkills?: Array<{ skill: string; placement: "skills" | string; company?: string; position?: string }>
): string {
  if (!additionalSkills || !Array.isArray(additionalSkills) || additionalSkills.length === 0) return "";

  // Deduplicate confirmed skills
  const uniqueSkills: Array<{ skill: string; placement: "skills" | string; company?: string; position?: string }> = [];
  const seen = new Set<string>();
  additionalSkills.forEach((s) => {
    const key = (s.skill || "").toLowerCase().trim();
    if (key && !seen.has(key)) {
      seen.add(key);
      uniqueSkills.push(s);
    }
  });

  if (uniqueSkills.length === 0) return "";

  const byPlacement = new Map<string, string[]>();
  const generalSkills: string[] = [];

  uniqueSkills.forEach((s) => {
    if (!s.placement || s.placement === "skills") {
      generalSkills.push(s.skill);
    } else {
      const target = s.placement;
      if (!byPlacement.has(target)) byPlacement.set(target, []);
      byPlacement.get(target)!.push(s.skill);
    }
  });

  let text = "\n\nCRITICAL USER-CONFIRMED SKILL ASSIGNMENTS:";
  text += "\nThe candidate has confirmed real-world application of the following target skills:";
  byPlacement.forEach((skills, placement) => {
    text += `\n- Role [${placement}]: Integrate the following confirmed skills naturally into this role's accomplishments: ${skills.map((sk) => `"${sk}"`).join(", ")}`;
  });
  if (generalSkills.length > 0) {
    text += `\n- General Skills: Add to 'skills' array: ${generalSkills.map((sk) => `"${sk}"`).join(", ")}`;
  }

  text += `\n\nMANDATORY RULES FOR CONFIRMED SKILL INTEGRATION:
1. NATURAL ROLE-SPECIFIC WEAVING: Seamlessly integrate the confirmed skills into the candidate's actual responsibilities and accomplishments for that specific role. Produce authentic, high-impact bullet points (20-35 words each).
2. MULTI-SKILL SYNTHESIS: When multiple skills are assigned to the same role (e.g. 2 to 6 skills), group them naturally into 2 or 3 rich, authentic bullet points showcasing how the candidate applied these skills in synergy. NEVER create repetitive one-bullet-per-skill lists!
3. DIVERSE ACTION VERBS & STRUCTURES: Every bullet point in the role MUST begin with a different strong action verb (e.g., 'Directed', 'Orchestrated', 'Architected', 'Spearheaded', 'Championed', 'Established', 'Scaled', 'Navigated') and describe concrete deliverables, team scale, methodology, or business outcomes. No two bullets may share similar phrasing.
4. BOLDING: Wrap each integrated skill name in markdown bolding (e.g., **Skill Name**).`;

  return text;
}

export async function optimizeCVForJob(
  cv: CVData,
  jobDescription: string,
  jobUrl?: string,
  additionalSkills?: Array<{ skill: string; placement: "skills" | string; company?: string; position?: string }>
): Promise<CVData> {
  try {
    const res = await apiCall<CVData>("/api/gemini/optimize-cv", { cv, jobDescription, jobUrl, additionalSkills });
    return normalizeCVData(res, cv, additionalSkills);
  } catch (error: any) {
    console.info("Server API unavailable, running client Gemini AI processing for CV optimization...");
    const clientAi = getClientAI();
    if (!clientAi) {
      throw new Error("Backend API unavailable (404) and no VITE_GEMINI_API_KEY found. If deployed on Netlify, please add VITE_GEMINI_API_KEY to your Netlify Environment Variables and re-deploy.");
    }

    const userPrompt = jobUrl 
      ? `Optimize CV for job at ${jobUrl}. ${jobDescription || ""}`
      : `Optimize CV for job description: ${jobDescription}`;

    const skillsContext = buildSkillsContext(additionalSkills);

    const response = await clientAi.models.generateContent({
      model: "gemini-flash-lite-latest",
      contents: {
        parts: [
          { text: `SOURCE CV (The Truth): ${JSON.stringify(cv)}` },
          { text: `TARGET JOB: ${userPrompt}${skillsContext}` }
        ]
      },
      config: {
        systemInstruction: `You are an expert recruiter and CV optimization engine. Your goal is to tailor a candidate's CV to a target job description.

RULES:
1. Preserve all work experience entries from SOURCE CV in 'experience' in the exact same order.
2. For each experience entry, keep 'company', 'position', 'startDate', 'endDate', and 'location' clean and exact (e.g. "Producer", "Fishlabs GmbH", "2023", "Present"). NEVER insert explanation text, validation notes, or internal reasoning into any field!
3. 'highlights' MUST be an array of 3 to 6 separate, authentic string bullet points (18-35 words each). Rephrase achievements using target job keywords and Markdown bolding (**keywords**).
   - MANDATORY NATURAL SKILL INTEGRATION: If user-confirmed skills are assigned to a position (see USER-CONFIRMED SKILL ASSIGNMENTS), weave those skills naturally into the role's accomplishments. When multiple skills are assigned to the same role, combine them into 1-3 cohesive, multi-dimensional bullets rather than one bullet per skill. Every bullet MUST start with a distinct active verb (e.g., 'Directed', 'Orchestrated', 'Spearheaded', 'Championed', 'Established') and describe concrete scope, tools, and business deliverables. Bold confirmed skill names in markdown (e.g., **Skill Name**).
4. Do NOT invent fictional companies or fake jobs. Keep 'customLinks'. Ensure company names end with common corporate suffixes where applicable (e.g., Inc., LLC, Corp., Co., GmbH, Ltd., Group).
5. Include 'education' array containing all degrees, schools, locations, and graduation dates from SOURCE CV.
6. Include 'skills' array containing all relevant technical, soft, and domain skills from SOURCE CV plus additional tailored keywords for the target job and all confirmed skills.
7. Include 'targetCompany' (e.g. "Google") and 'targetPosition' (e.g. "Senior Producer") extracted from the target job posting. If not specified, leave them as empty string "".
8. Include 'matchRate' object with 'original' (1-10 integer score), 'optimized' (1-10 integer score), and an 'explanation'.
   CRITICAL HONEST MATCH SCORING DIRECTIVES:
   - Be brutally honest, objective, and realistic. DO NOT inflate scores or default to 9 or 10!
   - 'original': Evaluate how well the candidate's original unedited CV meets the job requirements before tailoring (1-10 scale). (e.g., 3-6/10 if missing key skills, experience years, or tools).
   - 'optimized': Evaluate fit AFTER rephrasing and highlighting skills. DO NOT default to 9 or 10! If major requirement gaps still remain (e.g. candidate has 2 years experience but job requires 7+, or missing required degrees/certifications/technologies), the optimized score MUST NOT exceed 5/10, 6/10, or 7/10. Only award 8-10/10 if the candidate's actual background and skills genuinely cover almost all core requirements.
   - 'explanation': Provide a candid 1-2 sentence breakdown stating what aligned well, what was improved by tailoring, and what critical skill/qualification gaps still remain.
9. DATES FORMATTING: Spell out full month names and year (e.g. 'January 2021', 'March 2023'). Use 'Present' or 'Current' for active jobs. Never use numeric 'MM/YY' format.
10. UNIFORM JOB ORDER: Maintain flat experience entries with consistent field order: position, company, location, startDate, endDate.
11. Return ONLY valid JSON matching the schema. No conversational text or markdown code fence wrappers.
12. CRITICAL TEXT INTEGRITY RULE: Every word in 'education', 'skills', 'experience', 'summary', and 'personalInfo' MUST be written in clean, standard, natural English spelling and proper casing. NEVER output alternating case letters or corrupted words (e.g. NEVER output 'BachEloR', 'coMmunIcATiOn', 'tEaM', or 'UniVersITy'). Write clean standard terms like 'Bachelor', 'University of Miami', 'Communication', 'Teamwork', 'Attention to Detail'.`,
        responseMimeType: "application/json",
        responseSchema: CV_SCHEMA,
        temperature: 0.2,
      },
    });

    if (!response.text) throw new Error("Empty response during optimization");
    const result = JSON.parse(cleanJsonString(response.text));
    return normalizeCVData(result, cv, additionalSkills);
  }
}

export async function adaptCVForRole(
  cv: CVData,
  targetRole: string,
  focusAreas?: string,
  additionalSkills?: Array<{ skill: string; placement: "skills" | string; company?: string; position?: string }>
): Promise<CVData> {
  try {
    const res = await apiCall<CVData>("/api/gemini/adapt-role", { cv, targetRole, focusAreas, additionalSkills });
    return normalizeCVData(res, cv, additionalSkills);
  } catch (error: any) {
    console.info("Server API unavailable, running client Gemini AI processing for role adaptation...");
    const clientAi = getClientAI();
    if (!clientAi) {
      throw new Error("Backend API unavailable and no VITE_GEMINI_API_KEY found. If deployed on Netlify, please add VITE_GEMINI_API_KEY to your Netlify Environment Variables.");
    }

    const skillsContext = buildSkillsContext(additionalSkills);
    const userPrompt = `TARGET ROLE: ${targetRole}${focusAreas ? `\nFOCUS AREAS / HIGHLIGHTS: ${focusAreas}` : ""}${skillsContext}`;

    const response = await clientAi.models.generateContent({
      model: "gemini-flash-lite-latest",
      contents: {
        parts: [
          { text: `SOURCE CV (Original Authentic Truth): ${JSON.stringify(cv)}` },
          { text: userPrompt }
        ]
      },
      config: {
        systemInstruction: `You are an executive career coach and resume strategist specializing in career transitions and role pivots.
Your mission is to adapt and reframe the candidate's existing genuine background to be compelling for the TARGET ROLE ("${targetRole}"), emphasizing transferable accomplishments, leadership, and operational strengths.

RULES:
1. Preserve all genuine work experience entries from SOURCE CV in 'experience' in the exact same chronological order.
2. Maintain company names, locations, and dates accurately.
3. REFRAME & HIGHLIGHT TRANSFERABLE IMPACT:
   - In 'summary', reposition the candidate as an experienced professional transitioning or applying their extensive background directly to the TARGET ROLE.
   - In each job's 'highlights' (3-5 bullets, 18-35 words each), foreground accomplishments that showcase transferable competencies for "${targetRole}" (e.g. cross-functional leadership, stakeholder management, delivery, budgeting, communication, technical agility, problem-solving).
   - Use Markdown bolding (**transferable skills**) on key competencies.
   - If user-confirmed skills are provided, weave them naturally into designated roles.
4. 'skills': Curate an updated, balanced skill list reflecting "${targetRole}" core competencies alongside the candidate's authentic technical and operational strengths.
5. 'targetPosition': Set to "${targetRole}".
6. 'matchRate': Object containing 'original' (1-10 realistic match score), 'optimized' (1-10 realistic post-pivot score), and 'explanation' (encouraging, candid assessment of the candidate's transferable strengths and recommendations).
7. Return ONLY valid JSON matching the schema.`,
        responseMimeType: "application/json",
        responseSchema: CV_SCHEMA,
        temperature: 0.2,
      },
    });

    if (!response.text) throw new Error("Empty response during role adaptation");
    const result = JSON.parse(cleanJsonString(response.text));
    return normalizeCVData(result, cv, additionalSkills);
  }
}

export async function translateCV(cv: CVData, targetLanguage: string): Promise<CVData> {
  try {
    const res = await apiCall<CVData>("/api/gemini/translate-cv", { cv, targetLanguage });
    return normalizeCVData(res, cv, undefined, true);
  } catch (error: any) {
    console.info("Server API unavailable, running client Gemini AI processing for translation...");
    const clientAi = getClientAI();
    if (!clientAi) {
      throw new Error("Backend API unavailable (404) and no VITE_GEMINI_API_KEY found. If deployed on Netlify, please add VITE_GEMINI_API_KEY to your Netlify Environment Variables and re-deploy.");
    }

    const response = await clientAi.models.generateContent({
      model: "gemini-flash-lite-latest",
      contents: {
        parts: [
          { text: `Translate the candidate's CV data into ${targetLanguage}. Maintain the exact same JSON structure, all experience entries, and all bullet points with 100% accuracy.` },
          { text: `SOURCE CV DATA (The Absolute Truth): ${JSON.stringify(cv)}` }
        ]
      },
      config: {
        systemInstruction: `You are an elite, certified resume translator and career localization specialist. Your objective is to produce a 100% FACTUALLY ACCURATE, high-caliber, ATS-compliant translation of the candidate's CV into ${targetLanguage}.

STRICT 100% ACCURACY & FIDELITY DIRECTIVES:
1. ZERO DATA LOSS & EXACT STRUCTURE:
   - Every single role in 'experience' must be translated and retained in the exact same order. Never omit, consolidate, or drop any job entry.
   - Every single bullet point in each role's 'highlights' array MUST be translated. Never drop, combine, or truncate bullet points. If a job has 4 bullets in the source CV, the translated output MUST have exactly 4 corresponding bullets.
   - All entries in 'education' must be preserved with degrees translated to the standard target language credential equivalent while maintaining the institution, dates, and locations.
   - All entries in 'skills' must be translated into standard industry-recognized terms in ${targetLanguage}.
   - All 'customLinks' must be preserved.

2. PROPER NOUNS & CORPORATE ENTITIES:
   - NEVER translate company names, employer legal names, or studio names (e.g., "Google", "Fishlabs GmbH", "Stripe", "Microsoft", "Ubisoft"). Keep company names exactly as written.
   - Keep school / university proper names intact (e.g. "Stanford University", "Universidad de Buenos Aires").

3. NUMBERS, METRICS & TECHNICAL TERMS:
   - All numbers, currency signs, percentages, and metrics ($5M, €200K, 35%, 10x, 50+ engineers, 99.9% uptime) MUST be preserved with 100% numerical fidelity.
   - Universal technical acronyms (AWS, GCP, CI/CD, SQL, REST API, React, Node.js, Python, B2B, SaaS) must remain intact.

4. MARKDOWN BOLDING:
   - Preserve all Markdown bolding (**keyword**) around key skills and achievements. Every ** opening marker MUST have a matching ** closing marker. Never leave dangling or broken bold markers.

5. DATES:
   - Translate month names and date status into standard ${targetLanguage} format (e.g. English "Present" -> Spanish "Presente", French "Présent", German "Heute", Italian "Presente", Portuguese "Presente", etc.). Keep years and date numerals exact.

6. PERSONAL INFORMATION:
   - Preserve fullName, email, phone, and links without altering contact information.

7. JSON ONLY:
   - Output ONLY valid JSON matching the schema. No conversational prose or explanations.`,
        responseMimeType: "application/json",
        responseSchema: CV_SCHEMA,
        temperature: 0.1,
      },
    });

    if (!response.text) throw new Error("Empty response during translation");
    const result = JSON.parse(cleanJsonString(response.text));
    return normalizeCVData(result, cv, undefined, true);
  }
}

export async function scanCVForATSFromMultimodal(parts: any[]): Promise<ATSScanResult> {
  try {
    return await apiCall<ATSScanResult>("/api/gemini/scan-ats-multimodal", { parts });
  } catch (error) {
    console.warn("Server ATS scan failed, using fallback:", error);
    return parseATSFromText("CV Document Text Stream");
  }
}

export async function scanCVForATSFromText(text: string): Promise<ATSScanResult> {
  return parseATSFromText(text);
}

export interface CoverLetterInput {
  cv: CVData;
  companyName: string;
  jobTitle: string;
  jobDescription?: string;
  hiringManager?: string;
  tone?: string;
}

export interface CoverLetterOutput {
  coverLetterText: string;
  companyName: string;
  jobTitle: string;
  salutation: string;
  keyHighlightsUsed: string[];
}

export function sanitizeCoverLetterText(text: string): string {
  if (!text || typeof text !== "string") return text || "";

  let cleaned = text;

  // 1. Remove all em-dashes (—) and en-dashes (–)
  cleaned = cleaned.replace(/\s*—\s*/g, ", ");
  cleaned = cleaned.replace(/—/g, ", ");
  cleaned = cleaned.replace(/\s*–\s*/g, ", ");
  cleaned = cleaned.replace(/–/g, ", ");

  // 2. Remove artificial AI section headers (e.g. "**Why I'm a Great Fit:**", "### Key Strengths", "**Experience & Value:**")
  cleaned = cleaned.replace(/^(#+|\*\*)\s*(Why I|Key Strengths|My Qualifications|Why [A-Z]|Core Value|Experience &|Background &|Summary of|In Conclusion|Closing Thoughts)[^:\n]*:?\s*(\*\*|\n)?/gmi, "");

  // 3. Remove artificial bullet point bold headers inside paragraphs
  cleaned = cleaned.replace(/^\s*[\*\-•]\s*\*\*[^*]+\*\*:\s*/gm, "• ");

  // 4. Replace common robotic AI intro clichés with natural human phrasing if present
  cleaned = cleaned.replace(/\bI am writing to express my enthusiastic interest in\b/gi, "I am applying for");
  cleaned = cleaned.replace(/\bI am thrilled to apply for\b/gi, "I am excited to submit my application for");
  cleaned = cleaned.replace(/\bIt is with great enthusiasm that I apply\b/gi, "I am applying for");
  cleaned = cleaned.replace(/\ba testament to\b/gi, "evidence of");
  cleaned = cleaned.replace(/\bdelve into\b/gi, "explore");
  cleaned = cleaned.replace(/\bseamlessly\b/gi, "effectively");
  cleaned = cleaned.replace(/\bplethora of\b/gi, "range of");
  cleaned = cleaned.replace(/\bprofoundly\b/gi, "deeply");
  cleaned = cleaned.replace(/\bspearheaded transformational\b/gi, "led key");

  // 5. Clean up any weird double commas, space before punctuation, or double punctuation
  cleaned = cleaned.replace(/,\s*,+/g, ",");
  cleaned = cleaned.replace(/\s+([,\.\?\!])/g, "$1");
  cleaned = cleaned.replace(/,\s*\./g, ".");
  cleaned = cleaned.replace(/[ \t]{2,}/g, " ");

  return cleaned.trim();
}

export async function generateCoverLetter(input: CoverLetterInput): Promise<CoverLetterOutput> {
  try {
    return await apiCall<CoverLetterOutput>("/api/gemini/cover-letter", input);
  } catch (error: any) {
    console.info("Server API unavailable, running client fallback for cover letter generation...");
    const clientAi = getClientAI();
    if (!clientAi) {
      throw new Error("Backend API unavailable and no VITE_GEMINI_API_KEY found.");
    }

    const { cv, companyName, jobTitle, jobDescription = "", hiringManager = "", tone = "Professional & Direct" } = input;

    const userPrompt = `CANDIDATE CV DATA:
${JSON.stringify(cv, null, 2)}

TARGET COMPANY & JOB INFORMATION:
- Company Name: ${companyName}
- Target Job Title: ${jobTitle}
- Hiring Manager / Department: ${hiringManager || "Hiring Manager"}
- Writing Tone Style: ${tone}
- Job Description & Details:
${jobDescription || "No specific job description provided."}`;

    const response = await clientAi.models.generateContent({
      model: "gemini-flash-lite-latest",
      contents: {
        parts: [{ text: userPrompt }]
      },
      config: {
        systemInstruction: `You are a human career strategist. Generate a highly tailored cover letter strictly grounded in the candidate's CV experience matching company ${companyName} and job ${jobTitle}. Tone: ${tone}.
CRITICAL ANTI-AI RULES:
1. NEVER use em-dashes '—' or en-dashes '–'. Use standard commas or colons.
2. Avoid robotic AI buzzwords ('delve', 'testament', 'beacon', 'tapestry', 'synergy', 'plethora', 'profoundly', 'I am thrilled to apply').
3. Do NOT add bold section headers inside the body. Output JSON only.`,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            coverLetterText: { type: Type.STRING },
            companyName: { type: Type.STRING },
            jobTitle: { type: Type.STRING },
            salutation: { type: Type.STRING },
            keyHighlightsUsed: { type: Type.ARRAY, items: { type: Type.STRING } }
          },
          required: ["coverLetterText", "companyName", "jobTitle", "salutation", "keyHighlightsUsed"]
        },
        temperature: 0.3,
      }
    });

    if (!response.text) throw new Error("Empty response from AI for cover letter");
    const parsed = JSON.parse(cleanJsonString(response.text));
    if (parsed && typeof parsed.coverLetterText === "string") {
      parsed.coverLetterText = sanitizeCoverLetterText(parsed.coverLetterText);
    }
    if (parsed && Array.isArray(parsed.keyHighlightsUsed)) {
      parsed.keyHighlightsUsed = parsed.keyHighlightsUsed.map((h: string) => sanitizeCoverLetterText(h));
    }
    return parsed;
  }
}


export async function scanCVForATSFromCVData(cv: CVData): Promise<ATSScanResult> {
  return parseATSFromCVData(cv);
}

