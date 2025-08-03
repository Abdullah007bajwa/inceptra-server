import { Request, Response, NextFunction } from "express";
import { verifyToken } from "@clerk/backend";
import { prisma } from "../utils/db";
import dotenv from "dotenv";

dotenv.config();

export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing or invalid Authorization header" });
    }

    const token = authHeader.split(" ")[1];

    const payload = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY!,
    });

    const userId = payload.sub;
    const email = typeof payload.email === "string" ? payload.email : "";

    await prisma.user.upsert({
      where: { id: userId },
      create: {
        id: userId,
        email,
        isPremium: false,
      },
      update: {
        email,
      },
    });

    req.auth = { userId }; // ✅ Custom type works because of `types/express/index.d.ts`
    
    // Log authentication success without sensitive data
    console.log(`✅ User authenticated successfully | Route: ${req.path}`);
    
    next();
  } catch (err: unknown) {
    const error = err as Error;
    console.error("❌ Clerk token verification failed:", error.message);
    return res.status(401).json({
      error: "Unauthorized",
      detail: error.message,
    });
  }
};
