import { Request, Response, NextFunction } from "express";
import { verifyToken } from "@clerk/backend";
import { prisma } from "../utils/db";
import dotenv from "dotenv";

dotenv.config();

export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    
    // Check for Authorization header
    if (!authHeader) {
      console.log('❌ No Authorization header provided');
      return res.status(401).json({ 
        error: "Missing Authorization header",
        code: "MISSING_AUTH_HEADER"
      });
    }
    
    if (!authHeader.startsWith("Bearer ")) {
      console.log('❌ Invalid Authorization header format');
      return res.status(401).json({ 
        error: "Invalid Authorization header format. Expected 'Bearer <token>'",
        code: "INVALID_AUTH_FORMAT"
      });
    }

    const token = authHeader.split(" ")[1];
    
    if (!token) {
      console.log('❌ Empty token provided');
      return res.status(401).json({ 
        error: "Empty token provided",
        code: "EMPTY_TOKEN"
      });
    }

    // Verify the token with Clerk
    const payload = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY!,
    });

    if (!payload.sub) {
      console.log('❌ Token payload missing user ID');
      return res.status(401).json({ 
        error: "Invalid token payload",
        code: "INVALID_TOKEN_PAYLOAD"
      });
    }

    const userId = payload.sub;
    const email = typeof payload.email === "string" ? payload.email : "";

    // Upsert user in database
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

    req.auth = { userId };
    
    // Log authentication success
    console.log(`✅ User authenticated successfully | User: ${userId} | Route: ${req.path}`);
    
    next();
  } catch (err: unknown) {
    const error = err as Error;
    
    // Log the specific error for debugging
    console.error("❌ Clerk token verification failed:", {
      message: error.message,
      route: req.path,
      headers: {
        authorization: req.headers.authorization ? 'Bearer ***' : 'missing',
        origin: req.headers.origin,
        'user-agent': req.headers['user-agent']
      }
    });
    
    // Return appropriate error response
    return res.status(401).json({
      error: "Token verification failed",
      detail: error.message,
      code: "TOKEN_VERIFICATION_FAILED"
    });
  }
};
