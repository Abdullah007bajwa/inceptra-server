// src/utils/db.ts
import prismaPkg from '@prisma/client';

const PrismaClient = (prismaPkg as typeof import('@prisma/client')).PrismaClient;

export const prisma = new PrismaClient();
