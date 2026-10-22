import { jsPDF } from "jspdf";
import { CVData, formatATSDate, repairBrokenMarkdown } from "./gemini";

export interface MarkdownToken {
  text: string;
  bold?: boolean;
  italic?: boolean;
  strikethrough?: boolean;
  code?: boolean;
  link?: string;
}

export interface MarkdownWord {
  text: string;
  bold?: boolean;
  italic?: boolean;
  strikethrough?: boolean;
  code?: boolean;
  link?: string;
}

export interface RenderMarkdownOptions {
  baseFont?: string;
  baseStyle?: "normal" | "bold" | "italic" | "bolditalic";
  fontSize?: number;
  color?: [number, number, number];
  bullet?: string;
  bulletColor?: [number, number, number];
  pageMargin?: number;
  maxY?: number;
  onNewPage?: () => void;
}

/**
 * Robust markdown tokenizer supporting links, bold+italic, bold, italic (both _ and *),
 * strikethrough, and inline code. Automatically repairs broken markdown markers first.
 */
export function tokenizeMarkdown(rawText: string): MarkdownToken[] {
  if (!rawText) return [];
  const text = repairBrokenMarkdown(rawText);
  const tokens: MarkdownToken[] = [];
  
  // Master regex matching inline markdown elements by precedence
  const masterRegex = /(\[(?<linkText>[^\]]+)\]\((?<linkUrl>[^)]+)\))|(?:\*\*\*(?<bi1>.+?)\*\*\*)|(?:\*\*_(?<bi2>.+?)_\*\*)|(?:_\*\*(?<bi3>.+?)\*\*_)|(?:___(?<bi4>[^_]+)___)|(?:\*\*(?<b1>.+?)\*\*)|(?:(?<!\w)__(?<b2>[^_]+)__(?!\w))|(?:\*(?<i1>[^*]+)\*)|(?:(?<!\w)_(?<i2>[^_]+)_(?!\w))|(?:~~(?<strike>[^~]+)~~)|(?:`(?<code>[^`]+)`)/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = masterRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ text: text.slice(lastIndex, match.index), bold: false, italic: false });
    }

    const groups = match.groups || {};
    if (groups.linkText && groups.linkUrl) {
      tokens.push({ text: groups.linkText, link: groups.linkUrl, bold: false, italic: false });
    } else if (groups.bi1 || groups.bi2 || groups.bi3 || groups.bi4) {
      const biText = groups.bi1 || groups.bi2 || groups.bi3 || groups.bi4;
      tokens.push({ text: biText, bold: true, italic: true });
    } else if (groups.b1 || groups.b2) {
      const bText = groups.b1 || groups.b2;
      tokens.push({ text: bText, bold: true, italic: false });
    } else if (groups.i1 || groups.i2) {
      const iText = groups.i1 || groups.i2;
      tokens.push({ text: iText, bold: false, italic: true });
    } else if (groups.strike) {
      tokens.push({ text: groups.strike, strikethrough: true, bold: false, italic: false });
    } else if (groups.code) {
      tokens.push({ text: groups.code, code: true, bold: false, italic: false });
    }

    lastIndex = masterRegex.lastIndex;
  }

  if (lastIndex < text.length) {
    tokens.push({ text: text.slice(lastIndex), bold: false, italic: false });
  }

  return tokens;
}

/**
 * Strips all markdown syntax leaving clean human-readable text for ATS / clipboard export.
 */
export function stripMarkdown(rawText: string): string {
  if (!rawText) return "";
  const text = repairBrokenMarkdown(rawText);
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/(?:\*\*\*|___|\*\*_\b|_<\*\*|\b_\*\*|\*\*_)(.+?)(?:\*\*\*|___|_\*\*|\*\*_)/g, "$1")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/(?<!\w)__(.+?)__(?!\w)/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/(?<!\w)_([^_]+)_(?!\w)/g, "$1")
    .replace(/~~(.+?)~~/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*{2,}/g, "")
    .trim();
}

/**
 * Converts formatted markdown tokens into individual printable words with trailing spaces,
 * enabling proper line wrapping while preserving exact styling flags.
 */
export function processTokensToWords(tokens: MarkdownToken[]): MarkdownWord[] {
  const words: MarkdownWord[] = [];
  let pendingSpace = "";

  tokens.forEach((token) => {
    const segments = token.text.match(/\S+|\s+/g) || [];
    segments.forEach((seg) => {
      if (/^\s+$/.test(seg)) {
        if (words.length > 0) {
          words[words.length - 1].text += seg;
        } else {
          pendingSpace += seg;
        }
      } else {
        words.push({
          text: pendingSpace + seg,
          bold: !!token.bold,
          italic: !!token.italic,
          strikethrough: !!token.strikethrough,
          code: !!token.code,
          link: token.link,
        });
        pendingSpace = "";
      }
    });
  });

  return words;
}

/**
 * Core multi-style markdown renderer for jsPDF. Renders text with bold, italic,
 * links, code, strikethrough, and clean bullet points with automatic line wrapping and pagination.
 */
export const renderMarkdownBlock = (
  doc: jsPDF,
  text: string,
  x: number,
  currentY: number,
  maxWidth: number,
  options: RenderMarkdownOptions = {}
): number => {
  if (!text) return currentY;

  const baseFont = options.baseFont || "helvetica";
  const baseStyle = options.baseStyle || "normal";
  const fontSize = options.fontSize || 10;
  const color = options.color || [50, 50, 50];
  const bullet = options.bullet || "";
  const bulletColor = options.bulletColor || [79, 70, 229];
  const pageMargin = options.pageMargin ?? 20;
  const maxY = options.maxY ?? 280;
  const onNewPage = options.onNewPage || (() => { doc.addPage(); });

  const lineHeight = fontSize * 0.46; // mm
  const rawLines = text.split("\n");
  let localY = currentY;

  rawLines.forEach((rawLine, lineIdx) => {
    if (!rawLine.trim()) {
      localY += lineHeight * 0.7;
      if (localY > maxY) {
        onNewPage();
        localY = pageMargin;
      }
      return;
    }

    const tokens = tokenizeMarkdown(rawLine);
    const lineWords = processTokensToWords(tokens);
    if (lineWords.length === 0) return;

    // Render bullet only on the first line of the markdown block
    if (bullet && lineIdx === 0) {
      doc.setFont(baseFont, "bold");
      doc.setFontSize(fontSize);
      doc.setTextColor(bulletColor[0], bulletColor[1], bulletColor[2]);
      doc.text(bullet, x - 4.5, localY);
    }

    let currentLineX = x;
    lineWords.forEach((wordObj) => {
      const isBold = wordObj.bold || baseStyle.includes("bold");
      const isItalic = wordObj.italic || baseStyle.includes("italic");
      let fontStyle: "normal" | "bold" | "italic" | "bolditalic" = "normal";
      if (isBold && isItalic) fontStyle = "bolditalic";
      else if (isBold) fontStyle = "bold";
      else if (isItalic) fontStyle = "italic";

      const fontName = wordObj.code ? "courier" : baseFont;
      doc.setFont(fontName, fontStyle);
      doc.setFontSize(fontSize);

      if (wordObj.link) {
        doc.setTextColor(79, 70, 229);
      } else if (wordObj.code) {
        doc.setTextColor(71, 85, 105);
      } else {
        doc.setTextColor(color[0], color[1], color[2]);
      }

      let printText = wordObj.text;
      if (currentLineX === x) {
        printText = printText.trimStart();
      }
      let wordWidth = doc.getTextWidth(printText);

      // Line wrapping check
      if (currentLineX + wordWidth > x + maxWidth && currentLineX > x) {
        currentLineX = x;
        localY += lineHeight;
        if (localY > maxY) {
          onNewPage();
          localY = pageMargin;
        }
        printText = wordObj.text.trimStart();
        wordWidth = doc.getTextWidth(printText);
      }

      doc.text(printText, currentLineX, localY);

      if (wordObj.link) {
        doc.link(currentLineX, localY - fontSize * 0.7, wordWidth, fontSize * 0.8, { url: wordObj.link });
        doc.setDrawColor(79, 70, 229);
        doc.setLineWidth(0.15);
        doc.line(currentLineX, localY + 0.3, currentLineX + wordWidth, localY + 0.3);
      }

      if (wordObj.strikethrough) {
        doc.setDrawColor(color[0], color[1], color[2]);
        doc.setLineWidth(0.2);
        const strikeY = localY - fontSize * 0.12;
        doc.line(currentLineX, strikeY, currentLineX + wordWidth, strikeY);
      }

      currentLineX += wordWidth;
    });

    localY += lineHeight;
    if (localY > maxY) {
      onNewPage();
      localY = pageMargin;
    }
  });

  return localY;
};

export const exportToSelectablePDF = (
  data: CVData, 
  filename: string, 
  template: string = "modern", 
  autoSave: boolean = true
): jsPDF | null => {
  try {
    const doc = new jsPDF({
      orientation: "p",
      unit: "mm",
      format: "a4",
    });

    const margin = template === "minimal" ? 25 : 20;
    const pageWidth = doc.internal.pageSize.getWidth();
    const contentWidth = pageWidth - margin * 2;
    let y = margin;

    const checkPageBreak = (neededHeight: number) => {
      if (y + neededHeight > 280) {
        doc.addPage();
        y = margin;
        return true;
      }
      return false;
    };

    const renderMarkdownText = (
      text: string,
      x: number,
      currentY: number,
      maxWidth: number,
      baseFont: string = "helvetica",
      fontSize: number = 10,
      color: [number, number, number] = [50, 50, 50],
      bullet: string = "",
      baseStyle: "normal" | "bold" | "italic" | "bolditalic" = "normal",
      bulletColor?: [number, number, number]
    ) => {
      return renderMarkdownBlock(doc, text, x, currentY, maxWidth, {
        baseFont,
        baseStyle,
        fontSize,
        color,
        bullet,
        bulletColor: bulletColor || (template === "minimal" ? [148, 163, 184] : [129, 140, 248]),
        pageMargin: margin,
        maxY: 280,
        onNewPage: () => {
          doc.addPage();
          y = margin;
        },
      });
    };

    const renderLinkedText = (text: string, x: number, currentY: number, url: string, fontSize: number) => {
      doc.text(text, x, currentY);
      const textWidth = doc.getTextWidth(text);
      // Create a clickable link area
      doc.link(x, currentY - (fontSize * 0.7), textWidth, fontSize * 0.8, { url });
    };

    if (template === "modern") {
      // --- Modern Template Style ---
      doc.setFont("helvetica", "bold");
      doc.setFontSize(28);
      doc.setTextColor(15, 23, 42); // Slate-900
      doc.text(data.personalInfo.fullName, margin, y);
      y += 10;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139); // Slate-500
      const contactParts = [
        data.personalInfo.phone,
        data.personalInfo.location,
      ].filter(Boolean);
      
      let currentContactX = margin;
      
      // Email as a link
      if (data.personalInfo.email) {
        doc.setTextColor(79, 70, 229);
        renderLinkedText(data.personalInfo.email, currentContactX, y, `mailto:${data.personalInfo.email}`, 9);
        currentContactX += doc.getTextWidth(data.personalInfo.email) + 6;
        doc.setTextColor(100, 116, 139);
      }

      contactParts.forEach((part) => {
        if (part) {
          doc.text(part, currentContactX, y);
          currentContactX += doc.getTextWidth(part) + 6;
        }
      });

      const headerLinks = data.customLinks?.filter(link => link.position === "header" || (!link.position && data.linksPlacement === "header")) || [];
      if (headerLinks.length > 0) {
        headerLinks.forEach((link) => {
          if (link.title && link.url) {
            doc.setTextColor(79, 70, 229); // Indigo-600 for links
            renderLinkedText(link.title, currentContactX, y, link.url, 9);
            currentContactX += doc.getTextWidth(link.title) + 6;
            doc.setTextColor(100, 116, 139); // Reset to Slate-500
          }
        });
      }
      y += 6;

      // Indigo Border Bottom
      doc.setDrawColor(79, 70, 229); // Indigo-600
      doc.setLineWidth(0.8);
      doc.line(margin, y, margin + 40, y); // Short thick line like the design
      y += 12;

      // Summary
      if (data.summary) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(79, 70, 229); // Indigo-600
        doc.text("PROFESSIONAL SUMMARY", margin, y);
        y += 6;

        y = renderMarkdownText(data.summary, margin, y, contentWidth, "helvetica", 9.5, [71, 85, 105]);
        y += 10;
      }

      // Experience
      if (data.experience && data.experience.length > 0) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(79, 70, 229);
        doc.text("EXPERIENCE", margin, y);
        y += 8;

        data.experience.forEach((exp, index) => {
          // Robust keep-together for header (Company, Position, Dates)
          checkPageBreak(35);
          
          // Clear separation between roles
          if (index > 0) {
            y += 15;
          }

          // 1. Company Name & Dates (Standard ATS Pattern)
          const dates = `${exp.startDate || ""} - ${exp.endDate || ""}`;
          doc.setFont("helvetica", "normal");
          doc.setFontSize(10);
          const datesWidth = doc.getTextWidth(dates);
          doc.text(dates, margin + contentWidth - datesWidth, y);

          const companyText = exp.company || exp.position || "Experience";
          const nextCompY = renderMarkdownText(companyText, margin, y, contentWidth - datesWidth - 5, "helvetica", 11, [15, 23, 42], "", "bold");
          y = Math.max(nextCompY, y + 5);

          // 2. Job Title & Location
          const positionText = exp.company ? exp.position : "";
          if (positionText) {
            let locWidth = 0;
            if (exp.location) {
              doc.setFont("helvetica", "normal");
              doc.setFontSize(9.5);
              locWidth = doc.getTextWidth(exp.location);
              doc.text(exp.location, margin + contentWidth - locWidth, y);
            }
            const nextPosY = renderMarkdownText(positionText, margin, y, contentWidth - locWidth - 5, "helvetica", 10, [51, 65, 85], "", "bold");
            y = Math.max(nextPosY, y + 6);
          } else {
            y += 2;
          }

          if (exp.highlights && Array.isArray(exp.highlights)) {
            exp.highlights.forEach((h) => {
              if (h) {
                checkPageBreak(15);
                // Reasonable indentation for bullet points
                y = renderMarkdownText(h, margin + 6, y, contentWidth - 6, "helvetica", 9.5, [71, 85, 105], "•");
                y += 2;
              }
            });
          }
        });
      }

      // Education & Skills Grid
      y += 12; // 2 line breaks vertical separation between experience section and education/skills columns
      checkPageBreak(40);
      const colWidth = (contentWidth / 2) - 5;
      const secondColX = margin + colWidth + 10;
      
      // Education
      let eduY = y;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(79, 70, 229);
      doc.text("EDUCATION", margin, eduY);
      eduY += 8;

      if (data.education && Array.isArray(data.education)) {
        data.education.forEach((edu) => {
          if (!edu) return;
          if (eduY + 20 > 280) {
            doc.addPage();
            eduY = margin;
          }
          if (edu.degree) {
            eduY = renderMarkdownText(edu.degree, margin, eduY, colWidth, "helvetica", 9, [15, 23, 42], "", "bold");
            eduY += 0.5;
          }
          if (edu.school) {
            eduY = renderMarkdownText(edu.school, margin, eduY, colWidth, "helvetica", 9, [51, 65, 85], "", "normal");
            eduY += 0.5;
          }
          const eduMeta = [edu.graduationDate, edu.location].filter(Boolean).join(" • ");
          if (eduMeta) {
            eduY = renderMarkdownText(eduMeta, margin, eduY, colWidth, "helvetica", 8, [148, 163, 184], "", "normal");
            eduY += 1;
          }
          if (Array.isArray((edu as any).highlights)) {
            (edu as any).highlights.forEach((h: string) => {
              if (h) {
                eduY = renderMarkdownText(h, margin + 4, eduY, colWidth - 4, "helvetica", 8, [71, 85, 105], "•");
                eduY += 1;
              }
            });
          }
          eduY += 4;
        });
      }

      // Skills
      let skillY = y;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(79, 70, 229);
      doc.text("SKILLS", secondColX, skillY);
      skillY += 8;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(51, 65, 85);
      
      let currentX = secondColX;
      if (data.skills && Array.isArray(data.skills)) {
        data.skills.forEach((skill) => {
          if (!skill) return;
          const cleanSkill = stripMarkdown(skill);
          const textWidth = doc.getTextWidth(cleanSkill);
          const pillPadding = 2;
          const pillWidth = textWidth + (pillPadding * 2);
          const pillHeight = 6;

          if (currentX + pillWidth > pageWidth - margin) {
            currentX = secondColX;
            skillY += pillHeight + 2;
            checkPageBreak(pillHeight + 2);
          }

          // Draw Pill Background (Slate-100)
          doc.setFillColor(241, 245, 249);
          doc.roundedRect(currentX, skillY - 4, pillWidth, pillHeight, 1, 1, "F");
          
          // Draw Skill Text
          doc.setTextColor(51, 65, 85);
          doc.text(cleanSkill, currentX + pillPadding, skillY);
          
          currentX += pillWidth + 2;
        });
      }

      // Bottom Links Section for Modern
      const bottomLinks = data.customLinks?.filter(link => link.position === "bottom" || (!link.position && data.linksPlacement === "bottom")) || [];
      if (bottomLinks.length > 0) {
        y = Math.max(eduY, skillY) + 15;
        checkPageBreak(20);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(79, 70, 229);
        doc.text("LINKS", margin, y);
        y += 8;
    
        let linkX = margin;
        bottomLinks.forEach((link) => {
          if (link.title && link.url) {
            const linkWidth = doc.getTextWidth(link.title);
            if (linkX + linkWidth > pageWidth - margin) {
              linkX = margin;
              y += 6;
              checkPageBreak(6);
            }
            doc.setFont("helvetica", "normal");
            doc.setFontSize(9);
            doc.setTextColor(79, 70, 229);
            renderLinkedText(link.title, linkX, y, link.url, 9);
            linkX += linkWidth + 10;
          }
        });
      }

    } else {
      // --- Minimal Template Style ---
      doc.setFont("helvetica", "normal");
      doc.setFontSize(36);
      doc.setTextColor(15, 23, 42);
      const nameWidth = doc.getTextWidth(data.personalInfo.fullName);
      doc.text(data.personalInfo.fullName, (pageWidth - nameWidth) / 2, y + 10);
      y += 20;

      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      
      const contactParts = [
        { text: data.personalInfo.email, isEmail: true },
        { text: data.personalInfo.phone },
        { text: data.personalInfo.location },
      ].filter(p => p.text);

      const headerLinks = data.customLinks?.filter(link => link.position === "header" || (!link.position && data.linksPlacement === "header")) || [];
      
      const allItems = [
        ...contactParts.map(p => ({ 
          text: p.text!.toUpperCase(), 
          url: p.isEmail ? `mailto:${p.text}` : null
        })),
        ...headerLinks.map(l => ({ text: l.title!.toUpperCase(), url: l.url!.startsWith('http') ? l.url : `https://${l.url}` }))
      ];

      const contactStr = allItems.map(i => i.text).join("  •  ");
      const contactWidth = doc.getTextWidth(contactStr);
      let startX = (pageWidth - contactWidth) / 2;
      
      allItems.forEach((item, i) => {
        if (item.url) {
          doc.setTextColor(79, 70, 229);
          renderLinkedText(item.text, startX, y, item.url, 8);
        } else {
          doc.setTextColor(100, 116, 139);
          doc.text(item.text, startX, y);
        }
        startX += doc.getTextWidth(item.text);
        if (i < allItems.length - 1) {
          doc.setTextColor(100, 116, 139);
          doc.text("  •  ", startX, y);
          startX += doc.getTextWidth("  •  ");
        }
      });
      y += 15;

      // Summary
      if (data.summary) {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(11);
        doc.setTextColor(71, 85, 105);
        y = renderMarkdownText(data.summary, margin + 10, y, contentWidth - 20, "helvetica", 11, [71, 85, 105]);
        y += 15;
      }

      // Experience
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(15, 23, 42);
      doc.text("EXPERIENCE", margin, y);
      y += 2;
      doc.setDrawColor(226, 232, 240);
      doc.line(margin, y, pageWidth - margin, y);
      y += 8;

      if (data.experience && Array.isArray(data.experience)) {
        data.experience.forEach((exp, index) => {
          checkPageBreak(35);
          
          if (index > 0) {
            y += 20;
          }

          // 1. Company & Dates
          const dates = `${exp.startDate || ""} - ${exp.endDate || ""}`;
          doc.setFont("helvetica", "normal");
          doc.setFontSize(11);
          const datesWidth = doc.getTextWidth(dates);
          doc.text(dates, margin + contentWidth - datesWidth, y);

          const companyText = exp.company || exp.position || "Experience";
          const nextCompY = renderMarkdownText(companyText, margin, y, contentWidth - datesWidth - 5, "helvetica", 12, [15, 23, 42], "", "bold");
          y = Math.max(nextCompY, y + 6);

          // 2. Position & Location
          const positionText = exp.company ? exp.position : "";
          if (positionText) {
            let locWidth = 0;
            if (exp.location) {
              doc.setFont("helvetica", "normal");
              doc.setFontSize(10);
              locWidth = doc.getTextWidth(exp.location);
              doc.text(exp.location, margin + contentWidth - locWidth, y);
            }
            const nextPosY = renderMarkdownText(positionText.toUpperCase(), margin, y, contentWidth - locWidth - 5, "helvetica", 11, [71, 85, 105], "", "bold");
            y = Math.max(nextPosY, y + 7);
          }

          if (exp.highlights && Array.isArray(exp.highlights)) {
            exp.highlights.forEach((h) => {
              if (h) {
                checkPageBreak(15);
                y = renderMarkdownText(h, margin + 6, y, contentWidth - 6, "helvetica", 10.5, [71, 85, 105], "•");
                y += 2;
              }
            });
          }
        });
      }

      // Education & Skills
      y += 12; // 2 line breaks vertical separation between experience section and education/skills
      const colWidth = contentWidth / 2;
      
      // Education
      let eduY = y;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(15, 23, 42);
      doc.text("EDUCATION", margin, eduY);
      eduY += 2;
      doc.line(margin, eduY, margin + colWidth - 5, eduY);
      eduY += 8;

      if (data.education && Array.isArray(data.education)) {
        data.education.forEach((edu) => {
          if (!edu) return;
          if (eduY + 20 > 280) {
            doc.addPage();
            eduY = margin;
          }
          if (edu.school) {
            eduY = renderMarkdownText(edu.school, margin, eduY, colWidth - 5, "helvetica", 10, [15, 23, 42], "", "bold");
            eduY += 0.5;
          }
          if (edu.degree) {
            eduY = renderMarkdownText(edu.degree, margin, eduY, colWidth - 5, "helvetica", 9, [100, 116, 139], "", "normal");
            eduY += 0.5;
          }
          const eduMeta = [edu.graduationDate, edu.location].filter(Boolean).join(" • ");
          if (eduMeta) {
            eduY = renderMarkdownText(eduMeta, margin, eduY, colWidth - 5, "helvetica", 8, [148, 163, 184], "", "italic");
            eduY += 1;
          }
          if (Array.isArray((edu as any).highlights)) {
            (edu as any).highlights.forEach((h: string) => {
              if (h) {
                eduY = renderMarkdownText(h, margin + 4, eduY, colWidth - 9, "helvetica", 8.5, [71, 85, 105], "•");
                eduY += 1;
              }
            });
          }
          eduY += 5;
        });
      }

      // Expertise
      let skillY = y;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(15, 23, 42);
      doc.text("EXPERTISE", margin + colWidth + 5, skillY);
      skillY += 2;
      doc.line(margin + colWidth + 5, skillY, pageWidth - margin, skillY);
      skillY += 8;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(71, 85, 105);
      if (data.skills && Array.isArray(data.skills)) {
        data.skills.forEach((skill) => {
          if (skill) {
            const cleanSkill = stripMarkdown(skill);
            doc.text(cleanSkill, margin + colWidth + 5, skillY);
            skillY += 5;
          }
        });
      }

      // Bottom Links Section for Minimal
      const bottomLinks = data.customLinks?.filter(link => link.position === "bottom" || (!link.position && data.linksPlacement === "bottom")) || [];
      if (bottomLinks.length > 0) {
        y = Math.max(eduY, skillY) + 15;
        checkPageBreak(20);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(15, 23, 42);
        doc.text("LINKS", margin, y);
        y += 2;
        doc.line(margin, y, pageWidth - margin, y);
        y += 8;

        let linkX = margin;
        bottomLinks.forEach((link) => {
          if (link.title && link.url) {
            const linkWidth = doc.getTextWidth(link.title);
            if (linkX + linkWidth > pageWidth - margin) {
              linkX = margin;
              y += 6;
              checkPageBreak(6);
            }
            doc.setFont("helvetica", "normal");
            doc.setFontSize(10);
            doc.setTextColor(79, 70, 229);
            renderLinkedText(link.title, linkX, y, link.url, 10);
            linkX += linkWidth + 15;
          }
        });
      }
    }

    if (autoSave) {
      doc.save(`${filename || "CV"}.pdf`);
    }
    return doc;
  } catch (error) {
    console.error("Error generating standard PDF:", error);
    return null;
  }
};

export const generatePlatformText = (data: CVData): string => {
  let text = "";

  // 1. Header
  const fullName = (data.personalInfo?.fullName || "RESUME").trim();
  text += `${fullName.toUpperCase()}\n`;
  text += "=".repeat(fullName.length) + "\n\n";

  const contactInfo = [
    data.personalInfo?.email,
    data.personalInfo?.phone,
    data.personalInfo?.location
  ].filter(Boolean).join("  |  ");
  
  if (contactInfo) {
    text += `${contactInfo}\n`;
  }

  const headerLinks = data.customLinks?.filter(link => link.position === "header" || (!link.position && data.linksPlacement === "header")) || [];
  if (headerLinks.length > 0) {
    text += headerLinks.map(l => `${l.title}: ${l.url}`).join("  |  ") + "\n";
  }
  text += "\n";

  // 2. Summary
  if (data.summary) {
    text += "PROFESSIONAL SUMMARY\n";
    text += "--------------------\n";
    text += `${stripMarkdown(data.summary)}\n\n`;
  }

  // 3. Experience
  if (data.experience && data.experience.length > 0) {
    text += "PROFESSIONAL EXPERIENCE\n";
    text += "-----------------------\n";

    data.experience.forEach((exp) => {
      if (!exp) return;
      
      // Consistent job structure: Job Title, Company Name, Location, Dates
      text += `${stripMarkdown(exp.position || "Position").toUpperCase()}\n`;
      text += `${stripMarkdown(exp.company || "Company")}\n`;
      if (exp.location) {
        text += `${stripMarkdown(exp.location)}\n`;
      }
      const start = formatATSDate(exp.startDate, false);
      const end = formatATSDate(exp.endDate, true);
      text += `${start || "Start Date"} - ${end || "Present"}\n`;

      if (exp.highlights && Array.isArray(exp.highlights)) {
        exp.highlights.forEach((h) => {
          if (!h) return;
          const cleanH = stripMarkdown(String(h));
          if (cleanH) {
            text += `- ${cleanH}\n`;
          }
        });
      }
      text += "\n";
    });
  }

  // 4. Education
  if (data.education && data.education.length > 0) {
    text += "EDUCATION\n";
    text += "---------\n";

    data.education.forEach((edu) => {
      if (!edu) return;
      text += `${stripMarkdown(edu.degree || "Degree").toUpperCase()}\n`;
      text += `${stripMarkdown(edu.school || "University")}\n`;
      if (edu.location) {
        text += `${stripMarkdown(edu.location)}\n`;
      }
      const gradDate = formatATSDate(edu.graduationDate, false);
      if (gradDate) {
        text += `${gradDate}\n`;
      }
      text += "\n";
    });
  }

  // 5. Skills
  if (data.skills && data.skills.length > 0) {
    text += "SKILLS & EXPERTISE\n";
    text += "------------------\n";
    const rawSkills = Array.isArray(data.skills) ? data.skills : [String(data.skills)];
    const skillsStr = rawSkills.map(s => stripMarkdown(String(s))).join(", ");
    text += `${skillsStr}\n\n`;
  }

  // 6. Additional Links
  const bottomLinks = data.customLinks?.filter(link => link.position === "bottom" || (!link.position && data.linksPlacement === "bottom")) || [];
  if (bottomLinks.length > 0) {
    text += "ADDITIONAL LINKS\n";
    text += "----------------\n";
    bottomLinks.forEach(link => {
      if (!link || !link.title || !link.url) return;
      text += `${stripMarkdown(link.title)}: ${link.url}\n`;
    });
    text += "\n";
  }

  return text;
};

export const exportForPlatforms = (data: CVData, filename: string, autoDownload: boolean = true): string => {
  console.log("Starting Plain Text Export for:", filename);
  try {
    const text = generatePlatformText(data);

    if (autoDownload && typeof document !== "undefined") {
      const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const finalFilename = (filename || "CV").trim() || "CV";
      link.download = `${finalFilename}_Platform.txt`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      console.log("Plain Text Export Complete");
    }

    return text;
  } catch (error) {
    console.error("Error generating plain text file:", error);
    return "";
  }
};

export const exportCoverLetterToPDF = (coverLetterText: string, filename: string = "Cover_Letter") => {
  try {
    const doc = new jsPDF({
      orientation: "p",
      unit: "mm",
      format: "a4",
    });

    const margin = 20;
    const pageWidth = doc.internal.pageSize.getWidth();
    const contentWidth = pageWidth - margin * 2;
    let y = margin;

    const paragraphs = coverLetterText.split(/\n\n+/);
    paragraphs.forEach((paragraph) => {
      if (!paragraph.trim()) return;

      y = renderMarkdownBlock(
        doc,
        paragraph.replace(/^#+\s*/, "").trim(),
        margin,
        y,
        contentWidth,
        {
          baseFont: "helvetica",
          baseStyle: "normal",
          fontSize: 10.5,
          color: [30, 41, 59],
          pageMargin: margin,
          maxY: 270,
          onNewPage: () => {
            doc.addPage();
            y = margin;
          },
        }
      );
      y += 4;
    });

    const cleanFilename = (filename || "Cover_Letter").replace(/[^a-zA-Z0-9_-]/g, "_");
    doc.save(`${cleanFilename}.pdf`);
  } catch (err) {
    console.error("Error generating Cover Letter PDF:", err);
    alert("Failed to export Cover Letter PDF.");
  }
};

