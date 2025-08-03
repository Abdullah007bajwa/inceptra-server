// server/src/routes/resume.ts

import express, { Request, Response } from "express";
import multer from "multer";
import { InferenceClient } from "@huggingface/inference";
import { requireAuth } from "../middleware/clerkAuth";
import { enforceDailyLimit } from "../middleware/rateLimit";
import { prisma } from "../utils/db";
import { extractTextFromPdf } from "../utils/pdfExtract";
type AuthedRequest = Request & { auth?: { userId?: string } };
const router = express.Router();
const hf = new InferenceClient(process.env.HF_TOKEN!);

// 🧾 Allow only PDF uploads up to 5MB
const upload = multer({
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "application/pdf") cb(null, true);
    else cb(new Error("Only PDF files are allowed."));
  },
});

router.post(
  "/",
  requireAuth,
  enforceDailyLimit("resume-analyzer"),
  upload.single("file"),
  async (req: Request, res: Response) => {
    const userId = (req as AuthedRequest).auth?.userId;

    if (!req.file) {
      return res.status(400).json({ error: "📎 No file uploaded." });
    }

    try {
      const resumeBuffer = req.file.buffer;
      const resumeText = await extractTextFromPdf(resumeBuffer);

      if (!resumeText || resumeText.length < 100) {
        return res.status(400).json({
          error: "❌ Resume too short or empty. Please upload a valid resume.",
        });
      }

      // Try multiple models with fallback system
      const models = [
        {
          model: "deepseek-ai/DeepSeek-R1-0528",
          timeout: 45000, // 45s for primary model
        },
        {
          model: "meta-llama/Llama-3.1-8B-Instruct",
          timeout: 40000, // 40s for secondary model
        },
        {
          model: "microsoft/DialoGPT-medium",
          timeout: 35000, // 35s for tertiary model
        }
      ];
      
      let completion;
      let lastError;
      
      for (const modelConfig of models) {
        try {
          console.log(`🔄 Trying resume analysis with model: ${modelConfig.model}`);
          
          const completionPromise = hf.chatCompletion({
            model: modelConfig.model,
            messages: [
              {
                role: "system",
                content:
                  "You are a professional career advisor. Provide feedback on resume strengths, weaknesses, missing skills, and suggest relevant job roles.",
              },
              {
                role: "user",
                content: resumeText,
              },
            ],
          });

          // Create a timeout promise
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error("Request timeout")), modelConfig.timeout);
          });

          // Race between completion and timeout
          completion = await Promise.race([completionPromise, timeoutPromise]) as any;
          console.log(`✅ Success with model: ${modelConfig.model}`);
          break; // Exit loop on success
          
        } catch (error: any) {
          lastError = error;
          console.log(`❌ Failed with model ${modelConfig.model}:`, error.message);
          
          // If it's a timeout or credit limit error, try next model
          if (error.message === "Request timeout" || error?.response?.status === 402) {
            console.log("🔄 Model failed, trying next model...");
            continue;
          }
          
          // For other errors, break and throw
          break;
        }
      }
      
      if (!completion) {
        throw lastError || new Error("All models failed");
      }

      const analysis = completion.choices?.[0]?.message?.content || "No analysis returned.";
      if (!userId) {
            return res.status(401).json({ error: "User ID not found in auth context" });
          }
      await prisma.generationHistory.create({
        data: {
          userId,
          feature: "resume-analyzer",
          input: { filename: req.file.originalname },
          output: { analysis },
        },
      });

      return res.json({ analysis });
    } catch (err: any) {
      console.error("🧨 Resume Analyzer Error:", err);
      
      // Provide user-friendly error messages
      let errorMessage = "Resume analysis failed. Try again later.";
      if (err.message === "Request timeout") {
        errorMessage = "Resume analysis timed out. Please try again.";
      } else if (err?.response?.status === 429) {
        errorMessage = "Rate limit exceeded. Please try again later.";
      }

      return res.status(500).json({
        error: errorMessage,
      });
    }
  }
);

export default router;
