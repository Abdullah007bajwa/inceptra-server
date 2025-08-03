// server/src/routes/backgroundRemover.ts

import express, { Request, Response } from "express";
import multer from "multer";
import { InferenceClient } from "@huggingface/inference";
import { requireAuth } from "../middleware/clerkAuth";
import { enforceDailyLimit } from "../middleware/rateLimit";
import { prisma } from "../utils/db";
import { Blob } from "fetch-blob";
import { Buffer } from "buffer";
import sharp from "sharp";
// import type { AuthedRequest } from "../types/requests";
type AuthedRequest = Request & { auth?: { userId?: string } };

const router = express.Router();
const hf = new InferenceClient(process.env.HF_TOKEN!);

// Configure multer: allow only PNG/JPG and max 10MB
const upload = multer({
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png"];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error("Only JPG/PNG images are allowed."));
    }
    cb(null, true);
  },
});

router.post(
  "/",
  requireAuth,
  enforceDailyLimit("background-remover"),
  upload.single("image"),
  async (req: Request, res: Response) => {
    const userId = (req as AuthedRequest).auth?.userId;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized. Missing user ID." });
    }

    if (!req.file) {
      return res.status(422).json({ error: "Image file is required." });
    }

    try {
      // Step 1: Compress the image to fit within the 4MB API limit
      const compressedBuffer = await sharp(req.file.buffer)
        .resize(1024, 1024, { 
          fit: 'inside', 
          withoutEnlargement: true 
        })
        .jpeg({ quality: 85 })
        .toBuffer();

      console.log("📏 Original file size:", req.file.buffer.length, "bytes");
      console.log("📏 Compressed file size:", compressedBuffer.length, "bytes");
      console.log("📏 API limit:", 4 * 1024 * 1024, "bytes");

      // Step 2: Convert compressed file to base64
      const imageBase64 = compressedBuffer.toString("base64");

      // Step 3: Call the segmentation model with fallback
      const imageBlob = new Blob([compressedBuffer], { type: "image/jpeg" });
      
      // Try multiple models in case of credit limits
      const models = [
        "briaai/RMBG-2.0",
        "CIDAS/clipseg-rd64-refined", 
        "rembg/rembg"
      ];
      
      let maskResult;
      let lastError;
      
      for (const model of models) {
        try {
          console.log(`🔄 Trying model: ${model}`);
          const imagePromise = hf.imageSegmentation({
            model: model,
            inputs: imageBlob,
            options: { task: "image-segmentation" }
          });

          // Create a timeout promise
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error("Request timeout")), 60000);
          });

          // Race between image processing and timeout
          maskResult = await Promise.race([imagePromise, timeoutPromise]) as any;
          console.log(`✅ Success with model: ${model}`);
          break; // Exit loop on success
          
        } catch (error: any) {
          lastError = error;
          console.log(`❌ Failed with model ${model}:`, error.message);
          
          // If it's a credit limit error, try next model
          if (error?.response?.status === 402) {
            console.log("🔄 Credit limit reached, trying next model...");
            continue;
          }
          
          // For other errors, break and throw
          break;
        }
      }
      
      if (!maskResult) {
        throw lastError || new Error("All models failed");
      }

      console.log("🔍 Mask result type:", typeof maskResult);
      console.log("🔍 Mask result keys:", Object.keys(maskResult || {}));
      console.log("🔍 Mask result content:", JSON.stringify(maskResult, null, 2));

      // Step 3: Extract mask from response
      let maskBase64;
      if (maskResult instanceof Blob) {
        const arrayBuffer = await maskResult.arrayBuffer();
        maskBase64 = Buffer.from(arrayBuffer).toString("base64");
      } else if (typeof maskResult === 'string') {
        // Remove data URI prefix if present
        maskBase64 = maskResult.replace(/^data:image\/[^;]+;base64,/, '');
      } else if (maskResult && maskResult.mask) {
        maskBase64 = maskResult.mask.replace(/^data:image\/[^;]+;base64,/, '');
      } else if (maskResult && maskResult.image) {
        maskBase64 = maskResult.image.replace(/^data:image\/[^;]+;base64,/, '');
      } else if (maskResult && maskResult['0']) {
        // Handle the actual response format with numeric keys
        const maskData = maskResult['0'];
        if (typeof maskData === 'string') {
          maskBase64 = maskData.replace(/^data:image\/[^;]+;base64,/, '');
        } else if (maskData && maskData.mask) {
          maskBase64 = maskData.mask.replace(/^data:image\/[^;]+;base64,/, '');
        } else if (maskData && maskData.image) {
          maskBase64 = maskData.image.replace(/^data:image\/[^;]+;base64,/, '');
        } else {
          throw new Error("Could not extract mask from numeric key response");
        }
      } else {
        // Try to find any base64-like string in the response
        const responseStr = JSON.stringify(maskResult);
        const base64Match = responseStr.match(/"([A-Za-z0-9+/=]{100,})"/);
        if (base64Match) {
          maskBase64 = base64Match[1];
        } else {
          throw new Error("Could not extract mask from segmentation result");
        }
      }

      // Step 4: Decode to buffers
      const originalBuffer = req.file.buffer; // Use original for better quality output
      const maskBuffer = Buffer.from(maskBase64, "base64");

      // Step 5: Composite foreground + mask using sharp
      // Resize the original to match the mask dimensions if needed
      const outputBuffer = await sharp(originalBuffer)
        .resize(1024, 1024, { 
          fit: 'inside', 
          withoutEnlargement: true 
        })
        .joinChannel(maskBuffer)   // mask becomes alpha channel
        .png()
        .toBuffer();

      // Step 6: Re-encode to base64
      const resultBase64 = outputBuffer.toString("base64");
      const resultDataUri = `data:image/png;base64,${resultBase64}`;

      await prisma.generationHistory.create({
        data: {
          userId,
          feature: "background-remover",
          input: { filename: req.file.originalname },
          output: { image: resultBase64 },
        },
      });

      return res.json({ image: resultBase64 });
    } catch (err: any) {
      console.error("🧨 Background removal error:", err);
      
      // Provide user-friendly error messages
      let errorMessage = "Failed to process image.";
      if (err.message === "Request timeout") {
        errorMessage = "Image processing timed out. Please try again.";
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
