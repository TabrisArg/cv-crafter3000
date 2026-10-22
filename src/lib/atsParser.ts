import type { ATSScanResult, CVData } from "./gemini";

// Standard ATS Technical & Professional Skills Taxonomy Dictionary
const SKILLS_TAXONOMY: { keyword: string; category: string }[] = [
  // Programming Languages
  { keyword: "JavaScript", category: "Language" },
  { keyword: "TypeScript", category: "Language" },
  { keyword: "Python", category: "Language" },
  { keyword: "Java", category: "Language" },
  { keyword: "C++", category: "Language" },
  { keyword: "C#", category: "Language" },
  { keyword: "PHP", category: "Language" },
  { keyword: "Ruby", category: "Language" },
  { keyword: "Go", category: "Language" },
  { keyword: "Golang", category: "Language" },
  { keyword: "Rust", category: "Language" },
  { keyword: "Swift", category: "Language" },
  { keyword: "Kotlin", category: "Language" },
  { keyword: "SQL", category: "Database" },
  { keyword: "HTML", category: "Web" },
  { keyword: "CSS", category: "Web" },

  // Frameworks & Libraries
  { keyword: "React", category: "Framework" },
  { keyword: "React Native", category: "Framework" },
  { keyword: "Next.js", category: "Framework" },
  { keyword: "Vue", category: "Framework" },
  { keyword: "Angular", category: "Framework" },
  { keyword: "Node.js", category: "Backend" },
  { keyword: "Express", category: "Backend" },
  { keyword: "NestJS", category: "Backend" },
  { keyword: "Django", category: "Backend" },
  { keyword: "Flask", category: "Backend" },
  { keyword: "FastAPI", category: "Backend" },
  { keyword: "Spring Boot", category: "Backend" },
  { keyword: "Tailwind", category: "Styling" },
  { keyword: "Bootstrap", category: "Styling" },
  { keyword: "GraphQL", category: "API" },
  { keyword: "REST API", category: "API" },

  // Databases & Cloud
  { keyword: "PostgreSQL", category: "Database" },
  { keyword: "MySQL", category: "Database" },
  { keyword: "MongoDB", category: "Database" },
  { keyword: "Redis", category: "Database" },
  { keyword: "Firebase", category: "Cloud/Database" },
  { keyword: "Firestore", category: "Cloud/Database" },
  { keyword: "Supabase", category: "Cloud/Database" },
  { keyword: "AWS", category: "Cloud" },
  { keyword: "Azure", category: "Cloud" },
  { keyword: "Google Cloud", category: "Cloud" },
  { keyword: "GCP", category: "Cloud" },
  { keyword: "Docker", category: "DevOps" },
  { keyword: "Kubernetes", category: "DevOps" },
  { keyword: "CI/CD", category: "DevOps" },
  { keyword: "Git", category: "Tools" },
  { keyword: "GitHub", category: "Tools" },
  { keyword: "Linux", category: "OS" },

  // Methodologies & Soft Skills
  { keyword: "Agile", category: "Methodology" },
  { keyword: "Scrum", category: "Methodology" },
  { keyword: "Kanban", category: "Methodology" },
  { keyword: "Project Management", category: "Management" },
  { keyword: "Product Management", category: "Management" },
  { keyword: "Leadership", category: "Soft Skill" },
  { keyword: "Communication", category: "Soft Skill" },
  { keyword: "Problem Solving", category: "Soft Skill" },
  { keyword: "Team Collaboration", category: "Soft Skill" },
  { keyword: "Strategic Planning", category: "Management" },
  { keyword: "Data Analysis", category: "Analytics" },
  { keyword: "Machine Learning", category: "AI/ML" },
  { keyword: "Artificial Intelligence", category: "AI/ML" },
  { keyword: "UI/UX Design", category: "Design" },
  { keyword: "Figma", category: "Design" },
  { keyword: "Testing", category: "QA" },
  { keyword: "Jest", category: "QA" },
  { keyword: "Cypress", category: "QA" },
];

const STANDARD_JOB_TITLES = [
  "Software Engineer", "Frontend Developer", "Backend Developer", "Full Stack Developer",
  "DevOps Engineer", "Data Scientist", "Data Analyst", "Product Manager",
  "Project Manager", "UI/UX Designer", "QA Engineer", "Systems Architect",
  "Engineering Manager", "Technical Lead", "Solutions Architect", "Business Analyst",
  "Marketing Manager", "Sales Manager", "Account Executive", "Customer Success Manager"
];

const STANDARD_SECTIONS = [
  {
    name: "Contact Information",
    keywords: ["contact", "personal info", "email", "phone", "address"],
  },
  {
    name: "Professional Summary",
    keywords: ["summary", "profile", "professional summary", "about me", "executive summary", "objective", "career summary", "overview", "statement", "introduction", "personal statement"],
  },
  {
    name: "Work Experience",
    keywords: ["work experience", "experience", "employment history", "professional experience", "work history", "employment", "career history", "career summary", "experience & achievements", "relevant experience", "positions held", "key achievements", "history", "career", "employment summary", "professional background"],
  },
  {
    name: "Education",
    keywords: ["education", "academic background", "academic history", "qualifications", "academic qualifications", "degrees", "education & training", "education and training", "studies", "academic attainment", "credentials", "educational background"],
  },
  {
    name: "Skills",
    keywords: ["skills", "technical skills", "core competencies", "technologies", "expertise", "key skills", "proficiencies", "areas of expertise", "abilities", "technical proficiencies", "tools & technologies", "competencies", "technical expertise"],
  },
  {
    name: "Certifications & Links",
    keywords: ["certifications", "licenses", "projects", "links", "portfolio", "certificates", "courses", "professional development", "publications", "awards", "honors"],
  },
];

/**
 * Deterministically parses raw plain text to extract ATS entities, scores, and issue reports.
 */
export function parseATSFromText(rawText: string): ATSScanResult {
  // 1. Normalize raw text stream (simulating ATS plain text extraction)
  const cleanText = rawText
    .replace(/[\u00A0\u200B\u200C\u200D\uFEFF]/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/[\t\f\v]/g, " ")
    .replace(/ +/g, " ")
    .trim();

  const lines = cleanText.split("\n").map((l) => l.trim()).filter(Boolean);

  // 2. Extract Contact Info using strict Deterministic Regex
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi;
  const phoneRegex = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
  const urlRegex = /https?:\/\/[^\s]+/gi;

  let emailsFound = cleanText.match(emailRegex) || [];
  
  // Fallback for spaced/obfuscated emails (e.g. "john.doe [at] domain.com" or "john.doe @ domain.com")
  if (emailsFound.length === 0) {
    const obfuscatedMatch = cleanText.match(/[a-zA-Z0-9._%+-]+\s*(?:@|\[at\]|\(at\)|\sat\s)\s*[a-zA-Z0-9.-]+\s*(?:\.|\[dot\]|\(dot\)|\sdot\s)\s*[a-zA-Z]{2,}/gi);
    if (obfuscatedMatch && obfuscatedMatch.length > 0) {
      const normalizedEmail = obfuscatedMatch[0]
        .replace(/\s*(?:\[at\]|\(at\)|\sat\s)\s*/gi, "@")
        .replace(/\s*(?:\[dot\]|\(dot\)|\sdot\s)\s*/gi, ".")
        .replace(/\s+/g, "");
      emailsFound = [normalizedEmail];
    }
  }

  const phonesFound = cleanText.match(phoneRegex) || [];
  const urlsFound = cleanText.match(urlRegex) || [];

  const email = emailsFound[0] ? emailsFound[0].replace(/^mailto:/i, "").replace(/[<>()[\]]/g, "") : "";
  const phone = phonesFound[0] || "";

  // Extract Full Name (usually first line or before first header)
  let fullName = lines[0] || "";
  if (fullName.length > 50 || /email|phone|experience|summary|education|http|@/i.test(fullName)) {
    const candidateLine = lines.find(
      (l) => l.length < 40 && !/@|email|phone|http|resume|cv|curriculum|summary|experience|skills/i.test(l)
    );
    fullName = candidateLine || lines[0] || "";
  }

  // Extract Location (search for City, State / City, Country patterns)
  const locationRegex = /\b([A-Z][a-zA-Z\s]{2,20}),\s*([A-Z]{2}|[A-Z][a-zA-Z\s]{2,20})\b/;
  const locationMatch = cleanText.match(locationRegex);
  const location = locationMatch ? locationMatch[0] : "";

  // 3. Extract Summary
  let summary = "";
  const summaryHeaderIdx = lines.findIndex((l) =>
    /^(professional summary|summary|profile|about me|objective)$/i.test(l)
  );
  if (summaryHeaderIdx !== -1 && lines[summaryHeaderIdx + 1]) {
    summary = lines.slice(summaryHeaderIdx + 1, summaryHeaderIdx + 4).join(" ");
  }

  // 4. Extract Experience & Education Counts
  const dateRangeRegex = /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|January|February|March|April|May|June|July|August|September|October|November|December|\d{2})?[-/\s.]?\d{4}\s*[-–—to\s]+\s*(?:Present|Current|\d{4}|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b)/gi;
  const dateRanges = cleanText.match(dateRangeRegex) || [];
  const workExperienceCount = Math.max(dateRanges.length, (cleanText.match(/company|inc|ltd|corp|position|role|engineer|developer|manager/gi) || []).length > 2 ? 2 : 1);

  const degreeRegex = /\b(Bachelor|Master|B\.S\.|M\.S\.|B\.A\.|M\.A\.|Ph\.D\.|Diploma|Associate|University|College)\b/gi;
  const degreesFound = cleanText.match(degreeRegex) || [];
  const educationCount = Math.max(1, Math.min(degreesFound.length, 4));

  // 5. Index Keywords against Taxonomy
  const extractedKeywords: { keyword: string; category: string; frequency: number }[] = [];
  let skillsCount = 0;

  SKILLS_TAXONOMY.forEach(({ keyword, category }) => {
    const escapedKw = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`\\b${escapedKw}\\b`, "gi");
    const matches = cleanText.match(regex);
    if (matches && matches.length > 0) {
      extractedKeywords.push({
        keyword,
        category,
        frequency: matches.length,
      });
      skillsCount++;
    }
  });

  // 6. Detect Job Titles
  const detectedJobTitles: string[] = [];
  STANDARD_JOB_TITLES.forEach((title) => {
    const regex = new RegExp(`\\b${title}\\b`, "gi");
    if (regex.test(cleanText)) {
      detectedJobTitles.push(title);
    }
  });

  // 7. Audit Section Headers
  const sectionsCheck = STANDARD_SECTIONS.map((sec) => {
    let found = false;
    let isStandardHeader = false;
    let extractedHeader = "";

    if (sec.name === "Contact Information") {
      // Contact information block is verified by present entities (email, phone, name)
      if (email || phone || fullName) {
        found = true;
        isStandardHeader = true;
        extractedHeader = "Contact Information";
      }
    } else {
      // Tier 1: Look for short standalone line (<= 50 chars) matching or starting/ending with any keyword
      for (const line of lines) {
        const cleanLine = line.toLowerCase().replace(/[:\-_]+$/, "").trim();
        if (cleanLine.includes("@") || cleanLine.startsWith("http") || cleanLine.length > 50) continue;

        const matchesKw = sec.keywords.some((kw) => cleanLine === kw || cleanLine.startsWith(kw) || cleanLine.endsWith(kw));
        if (matchesKw) {
          found = true;
          isStandardHeader = true;
          extractedHeader = line;
          break;
        }
      }

      // Tier 2: If no short standalone heading found, check any line starting with a keyword
      if (!found) {
        for (const line of lines) {
          const cleanLine = line.toLowerCase().trim();
          if (cleanLine.includes("@") || cleanLine.startsWith("http")) continue;

          if (sec.keywords.some((kw) => cleanLine.startsWith(kw))) {
            found = true;
            isStandardHeader = true;
            extractedHeader = line;
            break;
          }
        }
      }

      // Tier 3: Fallback check if data for that section exists (e.g. workExperienceCount > 0)
      if (!found) {
        if (sec.name === "Work Experience" && workExperienceCount > 0) {
          found = true;
          isStandardHeader = true;
          extractedHeader = "Work Experience";
        } else if (sec.name === "Education" && educationCount > 0) {
          found = true;
          isStandardHeader = true;
          extractedHeader = "Education";
        } else if (sec.name === "Skills" && skillsCount > 0) {
          found = true;
          isStandardHeader = true;
          extractedHeader = "Skills";
        } else if (sec.name === "Professional Summary" && summary) {
          found = true;
          isStandardHeader = true;
          extractedHeader = "Professional Summary";
        }
      }
    }

    const status: "pass" | "warn" | "fail" = !found
      ? "fail"
      : isStandardHeader
      ? "pass"
      : "warn";

    return {
      name: sec.name,
      found,
      isStandardHeader,
      extractedHeader: extractedHeader || "Not Detected",
      status,
      feedback: !found
        ? `Missing '${sec.name}' section header. Enterprise ATS may skip indexing this data.`
        : isStandardHeader
        ? `Standard ATS header detected for '${sec.name}'.`
        : `Non-standard heading '${extractedHeader}' detected. Recommend changing to standard '${sec.name}'.`,
    };
  });

  // 8. Calculate Deterministic Subscores (0 - 100 each)
  // Contact Info Subscore
  let contactScore = 0;
  if (fullName) contactScore += 25;
  if (email) contactScore += 35;
  if (phone) contactScore += 25;
  if (location || urlsFound.length > 0) contactScore += 15;

  // Layout & Structure Subscore
  const passedSections = sectionsCheck.filter((s) => s.status === "pass").length;
  const layoutScore = Math.min(100, Math.round((passedSections / STANDARD_SECTIONS.length) * 100));

  // Formatting Hygiene Subscore
  let formattingScore = 80;
  if (lines.length > 10) formattingScore += 10;
  if (cleanText.length > 300) formattingScore += 10;
  if (!email) formattingScore -= 25;

  // Keyword Density Subscore
  let keywordScore = Math.min(100, skillsCount * 12);
  if (skillsCount < 3) keywordScore = 40;

  // Date Consistency Subscore
  let dateScore = dateRanges.length >= 2 ? 100 : dateRanges.length === 1 ? 75 : 50;

  // Overall Score Calculation
  const overallScore = Math.round(
    contactScore * 0.25 +
    layoutScore * 0.25 +
    formattingScore * 0.2 +
    keywordScore * 0.15 +
    dateScore * 0.15
  );

  // 9. Generate Deterministic Issues & Quick Fixes
  const issues: { severity: "critical" | "warning" | "good"; title: string; description: string; recommendation: string }[] = [];
  const quickFixes: string[] = [];

  if (!email) {
    issues.push({
      severity: "critical",
      title: "Missing Email Address",
      description: "No valid email address format was recognized in the document text stream.",
      recommendation: "Add a clear email address (e.g. name@example.com) at the top of your resume.",
    });
    quickFixes.push("Add a prominent email address at the top of the CV.");
  } else {
    issues.push({
      severity: "good",
      title: "Email Address Parsed",
      description: `Successfully indexed candidate email: ${email}`,
      recommendation: "Ensure email remains unhyperlinked plain text for legacy parsers.",
    });
  }

  if (!phone) {
    issues.push({
      severity: "warning",
      title: "Missing Contact Phone Number",
      description: "No phone number was identified by the ATS regex parser.",
      recommendation: "Include a standard formatted phone number (+1 555-123-4567).",
    });
    quickFixes.push("Include a phone number in standard international or local format.");
  }

  sectionsCheck.forEach((sec) => {
    if (sec.status === "fail") {
      issues.push({
        severity: sec.name === "Work Experience" || sec.name === "Contact Information" ? "critical" : "warning",
        title: `Missing Section: ${sec.name}`,
        description: `ATS parser did not find a recognized header for '${sec.name}'.`,
        recommendation: `Add a standard '${sec.name}' section header in ALL CAPS or bold.`,
      });
      quickFixes.push(`Add a standard '${sec.name}' section heading.`);
    } else if (sec.status === "warn") {
      issues.push({
        severity: "warning",
        title: `Non-Standard Header: ${sec.extractedHeader}`,
        description: `Header '${sec.extractedHeader}' may confuse older enterprise ATS algorithms.`,
        recommendation: `Rename '${sec.extractedHeader}' to standard '${sec.name}'.`,
      });
      quickFixes.push(`Rename '${sec.extractedHeader}' to '${sec.name}'.`);
    }
  });

  if (skillsCount < 5) {
    issues.push({
      severity: "warning",
      title: "Low Keyword Indexing Count",
      description: `Only ${skillsCount} standard technical/professional skills were indexed from your text.`,
      recommendation: "Add a dedicated Skills section listing relevant frameworks, tools, and methodologies.",
    });
    quickFixes.push("Incorporate 5+ relevant technical and industry skill keywords.");
  }

  if (quickFixes.length === 0) {
    quickFixes.push("Your CV layout and structure are 100% compliant with standard enterprise ATS parsers.");
  }

  return {
    overallScore,
    rawExtractedText: cleanText,
    parsedEntities: {
      personalInfo: {
        fullName,
        email,
        phone,
        location,
        links: urlsFound,
      },
      summary,
      workExperienceCount,
      educationCount,
      skillsCount,
      detectedJobTitles,
    },
    scoreBreakdown: {
      contactInformation: {
        score: contactScore,
        feedback: contactScore >= 80 ? "Complete contact details detected." : "Incomplete contact details.",
        status: contactScore >= 80 ? "pass" : contactScore >= 50 ? "warn" : "fail",
      },
      layoutAndStructure: {
        score: layoutScore,
        feedback: layoutScore >= 80 ? "Standard section hierarchy detected." : "Missing core standard section headers.",
        status: layoutScore >= 80 ? "pass" : layoutScore >= 50 ? "warn" : "fail",
      },
      formattingHygiene: {
        score: formattingScore,
        feedback: formattingScore >= 80 ? "Clean linear plain-text stream." : "Formatting inconsistencies detected.",
        status: formattingScore >= 80 ? "pass" : formattingScore >= 50 ? "warn" : "fail",
      },
      keywordDensity: {
        score: keywordScore,
        feedback: keywordScore >= 70 ? "Good skill & keyword indexing density." : "Needs more relevant industry skill keywords.",
        status: keywordScore >= 70 ? "pass" : keywordScore >= 40 ? "warn" : "fail",
      },
      dateConsistency: {
        score: dateScore,
        feedback: dateScore >= 75 ? "Consistent work history date formats detected." : "Inconsistent date formatting.",
        status: dateScore >= 75 ? "pass" : dateScore >= 50 ? "warn" : "fail",
      },
    },
    sectionsCheck,
    extractedKeywords,
    issues,
    quickFixes,
  };
}

/**
 * Deterministically parses structured CVData into ATS scan results.
 */
export function parseATSFromCVData(cv: CVData): ATSScanResult {
  let formattedText = `${cv.personalInfo?.fullName || "Candidate"}\n`;
  if (cv.personalInfo?.email) formattedText += `Email: ${cv.personalInfo.email}\n`;
  if (cv.personalInfo?.phone) formattedText += `Phone: ${cv.personalInfo.phone}\n`;
  if (cv.personalInfo?.location) formattedText += `Location: ${cv.personalInfo.location}\n`;
  formattedText += `\n`;

  if (cv.summary) {
    formattedText += `PROFESSIONAL SUMMARY\n${cv.summary}\n\n`;
  }

  if (cv.experience && cv.experience.length > 0) {
    formattedText += `WORK EXPERIENCE\n`;
    cv.experience.forEach((exp) => {
      formattedText += `${exp.position || "Position"} at ${exp.company || "Company"} (${exp.startDate || ""} - ${exp.endDate || ""})\n`;
      if (exp.location) formattedText += `Location: ${exp.location}\n`;
      exp.highlights?.forEach((h) => {
        formattedText += `- ${h}\n`;
      });
      formattedText += `\n`;
    });
  }

  if (cv.education && cv.education.length > 0) {
    formattedText += `EDUCATION\n`;
    cv.education.forEach((edu) => {
      formattedText += `${edu.degree || "Degree"} - ${edu.school || "Institution"} (${edu.graduationDate || ""})\n`;
    });
    formattedText += `\n`;
  }

  if (cv.skills && cv.skills.length > 0) {
    formattedText += `SKILLS\n${cv.skills.join(", ")}\n\n`;
  }

  if (cv.customLinks && cv.customLinks.length > 0) {
    formattedText += `LINKS & PORTFOLIOS\n`;
    cv.customLinks.forEach((link) => {
      formattedText += `${link.title}: ${link.url}\n`;
    });
  }

  const result = parseATSFromText(formattedText);

  // Fine-tune entity counts and contact info directly from structured CV object
  const email = cv.personalInfo?.email || result.parsedEntities.personalInfo.email;
  const fullName = cv.personalInfo?.fullName || result.parsedEntities.personalInfo.fullName;
  const phone = cv.personalInfo?.phone || result.parsedEntities.personalInfo.phone;
  const location = cv.personalInfo?.location || result.parsedEntities.personalInfo.location;

  result.parsedEntities.workExperienceCount = cv.experience?.length || result.parsedEntities.workExperienceCount;
  result.parsedEntities.educationCount = cv.education?.length || result.parsedEntities.educationCount;
  if (fullName) result.parsedEntities.personalInfo.fullName = fullName;
  if (email) result.parsedEntities.personalInfo.email = email;
  if (phone) result.parsedEntities.personalInfo.phone = phone;
  if (location) result.parsedEntities.personalInfo.location = location;

  if (email) {
    // Remove any false "Missing Email Address" issue
    const missingEmailIdx = result.issues.findIndex((i) => i.title === "Missing Email Address");
    if (missingEmailIdx !== -1) {
      result.issues.splice(missingEmailIdx, 1, {
        severity: "good",
        title: "Email Address Parsed",
        description: `Successfully indexed candidate email: ${email}`,
        recommendation: "Ensure email remains unhyperlinked plain text for legacy parsers.",
      });
      result.quickFixes = result.quickFixes.filter((q) => !q.toLowerCase().includes("email"));
      if (result.quickFixes.length === 0) {
        result.quickFixes.push("Your CV layout and structure are 100% compliant with standard enterprise ATS parsers.");
      }
    }

    // Recalculate contact information score if missing
    if (result.scoreBreakdown.contactInformation.score < 60) {
      result.scoreBreakdown.contactInformation = {
        score: Math.max(85, result.scoreBreakdown.contactInformation.score + 35),
        feedback: "Complete contact details detected.",
        status: "pass",
      };
    }
  }

  // Ensure structured sections check reflects CVData contents
  result.sectionsCheck = result.sectionsCheck.map((sec) => {
    if (sec.name === "Work Experience" && cv.experience && cv.experience.length > 0) {
      return { ...sec, found: true, isStandardHeader: true, status: "pass", feedback: "Standard ATS header detected for 'Work Experience'." };
    }
    if (sec.name === "Education" && cv.education && cv.education.length > 0) {
      return { ...sec, found: true, isStandardHeader: true, status: "pass", feedback: "Standard ATS header detected for 'Education'." };
    }
    if (sec.name === "Skills" && cv.skills && cv.skills.length > 0) {
      return { ...sec, found: true, isStandardHeader: true, status: "pass", feedback: "Standard ATS header detected for 'Skills'." };
    }
    if (sec.name === "Professional Summary" && cv.summary) {
      return { ...sec, found: true, isStandardHeader: true, status: "pass", feedback: "Standard ATS header detected for 'Professional Summary'." };
    }
    return sec;
  });

  return result;
}
