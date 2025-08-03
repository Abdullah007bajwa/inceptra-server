import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import dotenv from "dotenv";
import "express-async-errors";

// Route imports
import stripeRoutes from "./routes/stripe.ts";
import articleRoute from "./routes/article.ts";
import imageRoute from "./routes/image.js";
import resumeRoute from "./routes/resume.js";
import historyRoute from "./routes/history.js";
import bgRemoveRoute from "./routes/bgRemove.js";
import { prisma } from "./utils/db.js";


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

// CORS middleware
app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);
      
      const allowedOrigins = [
        process.env.CLIENT_URL || "http://localhost:5173",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://192.168.56.1:5173", // Your current IP
        "http://192.168.1.1:5173",
        "http://192.168.0.1:5173"
      ];
      
      if (allowedOrigins.indexOf(origin) !== -1) {
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

// Stripe webhook route
app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), stripeRoutes);

// Parse JSON
app.use(express.json());

// Health check
app.get("/api/health", (_, res) => {
  res.json({ message: "Inceptra API is running" });
});

// Mount routes
app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), stripeRoutes);
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

