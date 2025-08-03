import { Request, Response, NextFunction } from "express";
import { prisma } from "../utils/db.js";

type AuthedRequest = Request & { auth: { userId: string } };

const FREE_LIMITS: Record<string, number> = {
  "article-generator": 10,
  "image-generator": 10,
  "background-remover": 10,
  "resume-analyzer": 10,
};

export function enforceDailyLimit(feature: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const { userId } = (req as AuthedRequest).auth;

    // ✅ Rest of your logic
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(401).json({ error: "User not found." });
    if (user.isPremium) return next();

    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);

    const count = await prisma.generationHistory.count({
      where: {
        userId,
        feature,
        createdAt: { gte: startOfDay },
      },
    });

    const limit = FREE_LIMITS[feature] ?? 0;
    if (count >= limit) {
      return res.status(429).json({
        error: `Free limit of ${limit} per day reached for ${feature}. Upgrade to Premium for unlimited access.`,
      });
    }

    return next();
  };
}
