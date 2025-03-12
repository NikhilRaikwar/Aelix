// server.ts
import { createServer } from "http";
import { parse } from "url";
import handler from "./api/agent"; // Changed from { handler } to default import
import cors from "cors";

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err.stack || err);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  process.exit(1);
});

const server = createServer(async (req, res) => {
  try {
    const corsHandler = cors({ origin: "*" }); // Allow all origins for now
    await new Promise((resolve, reject) => {
      corsHandler(req, res, (err) => (err ? reject(err) : resolve(null)));
    });
    const url = parse(req.url || "", true);
    if (url.pathname === "/api/agent") {
      await handler(req as any, res as any);
    } else {
      res.writeHead(404).end("Not Found");
    }
  } catch (error) {
    console.error("Server Error:", error.stack || error);
    res.writeHead(500).end("Internal Server Error");
  }
});

const PORT = process.env.PORT || 3000; // Render uses PORT env variable
server.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});