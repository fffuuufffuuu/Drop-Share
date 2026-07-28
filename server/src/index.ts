import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import morgan from "morgan";
import fs from "node:fs/promises";
import path from "node:path";

import { startCleanupJob } from "./cleanup";
import { config } from "./config";
import { prisma } from "./db";
import { errorHandler } from "./middleware";
import { authRouter } from "./routes.auth";
import { deploymentRouter } from "./routes.deployments";
import { spaceRouter } from "./routes.spaces";
import { ensureStorageRoot } from "./storage";
import { sanitizeRelativePath } from "./utils";

function getAllowedOrigin(): string | string[] | true {
  try {
    const u = new URL(config.baseUrl);
    const origin = u.origin;
    if (origin.includes("localhost") || origin.includes("127.0.0.1")) return true;
    return origin;
  } catch {
    return true;
  }
}

async function bootstrap(): Promise<void> {
  await ensureStorageRoot();
  startCleanupJob();

  const app = express();
  app.set("trust proxy", 1); // behind Nginx/宝塔反代时需要开启

  app.use(
    cors({
      origin: getAllowedOrigin(),
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
    }),
  );
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(express.json({ limit: "10mb" }));
  app.use(morgan("dev"));
  // app.use(
  //   "/api",
  //   rateLimit({
  //     windowMs: 60 * 1000,
  //     max: 80,
  //     standardHeaders: true,
  //     legacyHeaders: false,
  //   }),
  // );

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/deployments", deploymentRouter);
  app.use("/api/spaces", spaceRouter);

  app.get(/^\/p\/([^/]+)(?:\/(.*))?$/, async (req, res) => {
    const slug = req.params[0];
    const asset = req.params[1] ? sanitizeRelativePath(req.params[1]) : "index.html";

    const deployment = await prisma.deployment.findUnique({
      where: { publicSlug: slug },
    });

    if (
      !deployment ||
      deployment.deletedAt ||
      deployment.expiresAt < new Date() ||
      deployment.visibility === "hidden"
    ) {
      res.status(404).send("Site not available.");
      return;
    }

    const targetPath = path.join(deployment.rootPath, asset);
    const targetNormalized = path.normalize(targetPath);
    if (!targetNormalized.startsWith(path.normalize(deployment.rootPath))) {
      res.status(403).send("Forbidden");
      return;
    }

    try {
      await fs.access(targetPath);
      res.sendFile(targetPath);
    } catch {
      if (asset !== "index.html") {
        res.sendFile(path.join(deployment.rootPath, "index.html"));
        return;
      }
      res.status(404).send("File not found.");
    }
  });

  app.use(errorHandler);

  app.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.log(`Server running at ${config.baseUrl}`);
  });
}

bootstrap().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
