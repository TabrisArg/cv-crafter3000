import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import cors from "cors";
import {
  generateCVFromMultimodalServer,
  generateCVFromTextServer,
  identifyMissingSkillsServer,
  optimizeCVForJobServer,
  adaptCVForRoleServer,
  translateCVServer,
  scanCVForATSFromMultimodalServer,
  generateCoverLetterServer,
} from "./src/server/geminiService";

dotenv.config();

const currentFilename = typeof fileURLToPath !== "undefined" && import.meta && import.meta.url ? fileURLToPath(import.meta.url) : (typeof __filename !== "undefined" ? __filename : "");
const currentDirname = currentFilename ? path.dirname(currentFilename) : (typeof __dirname !== "undefined" ? __dirname : process.cwd());

async function startServer() {
  try {
    const app = express();
    const PORT = 3000;

    console.log(`Starting server in ${process.env.NODE_ENV} mode`);

    app.set("trust proxy", 1);
    
    app.use(cors({
      origin: true,
      credentials: true,
    }));

    app.use(express.json({ limit: "50mb" }));

    // API Router
    const apiRouter = express.Router();

    apiRouter.get("/config", (req, res) => {
      res.json({ 
        authEnabled: false,
        persistenceType: "local",
        isProduction: process.env.NODE_ENV === "production",
        appUrl: process.env.APP_URL,
      });
    });

    apiRouter.get("/ping", (req, res) => {
      res.json({ status: "ok", time: new Date().toISOString() });
    });

    // Gemini API routes
    apiRouter.post("/gemini/generate-cv-multimodal", async (req, res) => {
      try {
        const { parts } = req.body;
        if (!parts || !Array.isArray(parts)) {
          return res.status(400).json({ error: "Missing or invalid parts parameter" });
        }
        const result = await generateCVFromMultimodalServer(parts);
        res.json(result);
      } catch (err: any) {
        console.error("Error in /api/gemini/generate-cv-multimodal:", err);
        res.status(500).json({ error: err.message || "Failed to process document with AI" });
      }
    });

    apiRouter.post("/gemini/generate-cv-text", async (req, res) => {
      try {
        const { text } = req.body;
        if (!text || typeof text !== "string") {
          return res.status(400).json({ error: "Missing or invalid text parameter" });
        }
        const result = await generateCVFromTextServer(text);
        res.json(result);
      } catch (err: any) {
        console.error("Error in /api/gemini/generate-cv-text:", err);
        res.status(500).json({ error: err.message || "Failed to parse text with AI" });
      }
    });

    apiRouter.post("/gemini/identify-missing-skills", async (req, res) => {
      try {
        const { cv, jobDescription, jobUrl, targetRole } = req.body;
        if (!cv) {
          return res.status(400).json({ error: "Missing CV parameter" });
        }
        const result = await identifyMissingSkillsServer(cv, jobDescription || "", jobUrl, targetRole);
        res.json(result);
      } catch (err: any) {
        console.error("Error in /api/gemini/identify-missing-skills:", err);
        res.status(500).json({ error: err.message || "Failed to identify missing skills" });
      }
    });

    apiRouter.post("/gemini/adapt-role", async (req, res) => {
      try {
        const { cv, targetRole, focusAreas, additionalSkills } = req.body;
        if (!cv || !targetRole) {
          return res.status(400).json({ error: "Missing required parameters: cv and targetRole are required." });
        }
        const result = await adaptCVForRoleServer(cv, targetRole, focusAreas, additionalSkills);
        res.json(result);
      } catch (err: any) {
        console.error("Error in /api/gemini/adapt-role:", err);
        res.status(500).json({ error: err.message || "Failed to adapt CV for target role" });
      }
    });

    apiRouter.post("/gemini/optimize-cv", async (req, res) => {
      try {
        const { cv, jobDescription, jobUrl, additionalSkills } = req.body;
        if (!cv) {
          return res.status(400).json({ error: "Missing CV parameter" });
        }
        const result = await optimizeCVForJobServer(cv, jobDescription || "", jobUrl, additionalSkills);
        res.json(result);
      } catch (err: any) {
        console.error("Error in /api/gemini/optimize-cv:", err);
        res.status(500).json({ error: err.message || "Failed to optimize CV" });
      }
    });

    apiRouter.post("/gemini/cover-letter", async (req, res) => {
      try {
        const { cv, companyName, jobTitle, jobDescription, hiringManager, tone } = req.body;
        if (!cv || !companyName || !jobTitle) {
          return res.status(400).json({ error: "Missing required parameters: cv, companyName, and jobTitle are required." });
        }
        const result = await generateCoverLetterServer({ cv, companyName, jobTitle, jobDescription, hiringManager, tone });
        res.json(result);
      } catch (err: any) {
        console.error("Error in /api/gemini/cover-letter:", err);
        res.status(500).json({ error: err.message || "Failed to generate cover letter" });
      }
    });

    apiRouter.post("/gemini/translate-cv", async (req, res) => {
      try {
        const { cv, targetLanguage } = req.body;
        if (!cv || !targetLanguage) {
          return res.status(400).json({ error: "Missing cv or targetLanguage parameter" });
        }
        const result = await translateCVServer(cv, targetLanguage);
        res.json(result);
      } catch (err: any) {
        console.error("Error in /api/gemini/translate-cv:", err);
        res.status(500).json({ error: err.message || "Failed to translate CV" });
      }
    });

    apiRouter.post("/gemini/scan-ats-multimodal", async (req, res) => {
      try {
        const { parts } = req.body;
        if (!parts || !Array.isArray(parts)) {
          return res.status(400).json({ error: "Missing or invalid parts parameter" });
        }
        const result = await scanCVForATSFromMultimodalServer(parts);
        res.json(result);
      } catch (err: any) {
        console.error("Error in /api/gemini/scan-ats-multimodal:", err);
        res.status(500).json({ error: err.message || "Failed to run ATS scan" });
      }
    });

    // Mount apiRouter on /api
    app.use("/api", apiRouter);

    // API 404 fallback for unhandled /api requests
    app.use("/api/*", (req, res) => {
      res.status(404).json({ error: `API route ${req.originalUrl} not found` });
    });

    // Vite middleware for development
    if (process.env.NODE_ENV !== "production") {
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
    } else {
      const distPath = path.join(process.cwd(), "dist");
      app.use(express.static(distPath));
      app.get("*", (req, res) => {
        res.sendFile(path.join(distPath, "index.html"));
      });
    }

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  } catch (startupErr: any) {
    console.error("FATAL STARTUP ERROR:", startupErr);
    process.exit(1);
  }
}

startServer();
