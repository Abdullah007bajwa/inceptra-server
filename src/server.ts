import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import dotenv from "dotenv";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import "express-async-errors";

// Route imports
import stripeRoutes from "./routes/stripe";
import articleRoute from "./routes/article";
import imageRoute from "./routes/image";
import resumeRoute from "./routes/resume";
import historyRoute from "./routes/history";
import bgRemoveRoute from "./routes/bgRemove";
import { prisma } from "./utils/db";


dotenv.config();

// Global error handlers
process.on("uncaughtException", (err: unknown) => {  console.error("❌ Uncaught Exception:", err);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("❌ Unhandled Rejection at:", promise, "reason:", reason);
  process.exit(1);
});

if (!process.env.CLIENT_URL) {
  throw new Error("❌ CLIENT_URL missing from .env");
}

const app = express();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://api.clerk.dev", "https://api.huggingface.co"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    error: "Too many requests from this IP, please try again later.",
    code: "RATE_LIMIT_EXCEEDED"
  },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limiter);

// CORS middleware - Production ready
app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);
      
      const allowedOrigins = [
        process.env.CLIENT_URL,
        "https://frontend-lake-zeta-90.vercel.app"
      ];
      
      // Only allow development origins in development
      if (process.env.NODE_ENV === "development") {
        allowedOrigins.push(
          "http://localhost:5173",
          "http://127.0.0.1:5173",
          "http://192.168.56.1:5173"
        );
      }
      
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.log(`🚫 CORS blocked origin: ${origin}`);
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  })
);

// Parse JSON
app.use(express.json());

// Health check
app.get("/", (_, res) => {
  res.json({ message: "Inceptra AI API is running" });
});

app.get("/api/health", (_, res) => {
  res.json({ message: "Inceptra API is running" });
});

// Mount routes
app.use("/api/stripe", stripeRoutes);
app.use("/api/article", articleRoute);
app.use("/api/image", imageRoute);
app.use("/api/resume", resumeRoute);
app.use("/api/history", historyRoute);
app.use("/api/bg-remove", bgRemoveRoute);

// Error handler
app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
  const error = err as Error;
  console.error("❌ Unexpected error:", error.message);
  res.status(500).json({ message: "Internal server error", error: error.message });
});

// Start server
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

// Graceful shutdown handlers
const gracefulShutdown = async (signal: string) => {
  console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);
  
  // Stop accepting new connections
  server.close((err: unknown) => {    if (err) {
      console.error("❌ Error during server close:", err);
      process.exit(1);
    }
    
    console.log("✅ HTTP server closed");
    
    // Close database connections
    prisma.$disconnect()
      .then(() => {
        console.log("✅ Database connections closed");
        process.exit(0);
      })
      .catch((err: unknown) => {        console.error("❌ Error closing database connections:", err);
        process.exit(1);
      });
  });
};

// Handle shutdown signals
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// Handle uncaught exceptions with graceful shutdown
process.on("uncaughtException", async (err: unknown) => {  console.error("❌ Uncaught Exception:", err);
  await gracefulShutdown("uncaughtException");
});

