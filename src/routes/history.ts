// server/src/routes/history.ts

import express, { Request, Response } from "express";
import { requireAuth } from "../middleware/clerkAuth";
import { prisma } from "../utils/db";
type AuthedRequest = Request & { auth?: { userId?: string } };
const router = express.Router();

// Rate limits for free users
const FREE_LIMITS: Record<string, number> = {
  "article-generator": 10,
  "image-generator": 10,
  "background-remover": 10,
  "resume-analyzer": 10,
};

router.get("/", requireAuth, async (req: Request, res: Response) => {
  const userId = (req as AuthedRequest).auth?.userId;

  try {
    // Parse pagination parameters with sensible defaults
    const limit = Math.min(Number(req.query.limit) || 20, 50); // Reduced max limit
    const cursor = req.query.cursor as string | undefined;
    const page = Math.max(Number(req.query.page) || 1, 1);

    // Build query with pagination
    const query: any = {
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        feature: true,
        input: true,
        output: true,
        createdAt: true,
      },
    };

    // Add cursor for pagination
    if (cursor) {
      query.cursor = { id: cursor };
      query.skip = 1; // Skip the cursor item
    }

    // Execute query
    const history = await prisma.generationHistory.findMany(query);

    // Get total count for pagination info
    const totalCount = await prisma.generationHistory.count({
      where: { userId },
    });

    // Get next cursor
    const nextCursor = history.length > 0 ? history[history.length - 1].id : null;

    // Calculate pagination metadata
    const hasNextPage = history.length === limit;
    const hasPreviousPage = page > 1;

    return res.json({
      history,
      pagination: {
        currentPage: page,
        totalCount,
        hasNextPage,
        hasPreviousPage,
        nextCursor,
        limit,
      },
    });
  } catch (err: any) {
    console.error("❌ Error fetching generation history:", err);
    return res.status(500).json({
      error: "Failed to fetch history",
      detail: err.message || err,
    });
  }
});

// New endpoint to check usage and limits
router.get("/usage", requireAuth, async (req: Request, res: Response) => {
  const userId = (req as AuthedRequest).auth?.userId;

  try {
    // Get user info
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(401).json({ error: "User not found." });
    }

    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);

    // Get usage for each feature
    const usage = await Promise.all(
      Object.keys(FREE_LIMITS).map(async (feature) => {
        const count = await prisma.generationHistory.count({
          where: {
            userId,
            feature,
            createdAt: { gte: startOfDay },
          },
        });

        const limit = user.isPremium ? Infinity : FREE_LIMITS[feature];
        const remaining = user.isPremium ? Infinity : Math.max(0, limit - count);

        return {
          feature,
          used: count,
          limit: user.isPremium ? 'Unlimited' : limit,
          remaining: user.isPremium ? 'Unlimited' : remaining,
          isPremium: user.isPremium,
        };
      })
    );

    return res.json({
      usage,
      isPremium: user.isPremium,
      resetTime: new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000).toISOString(), // Next day
    });
  } catch (err: any) {
    console.error("❌ Error fetching usage:", err);
    return res.status(500).json({
      error: "Failed to fetch usage",
      detail: err.message || err,
    });
  }
});

export default router;
