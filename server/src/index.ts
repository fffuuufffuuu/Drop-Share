import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import morgan from "morgan";

import { startCleanupJob } from "./cleanup";
import { config } from "./config";
import { errorHandler } from "./middleware";
import { authRouter } from "./routes.auth";
import { adminRouter } from "./routes.admin";
import { deploymentRouter } from "./routes.deployments";
import { previewRouter } from "./routes.preview";
import { spaceRouter } from "./routes.spaces";
import { ensureStorageRoot } from "./storage";

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
  if(!["legacy","cloudbase"].includes(config.authProvider)) throw new Error("Invalid AUTH_PROVIDER");
  if(config.authProvider==="cloudbase" && !["sms","email"].includes(config.cloudbaseLoginMethod)) throw new Error("Invalid CLOUDBASE_LOGIN_METHOD");
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
  app.use("/api/admin", adminRouter);
  app.use("/api/deployments", deploymentRouter);
  app.use("/api/spaces", spaceRouter);

  app.use(previewRouter);

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
