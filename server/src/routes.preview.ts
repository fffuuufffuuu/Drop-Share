import { Router } from "express";
import fs from "node:fs/promises";
import path from "node:path";

import { prisma } from "./db";
import { isDeploymentAvailable } from "./deployment-access";
import { sanitizeRelativePath } from "./utils";

export const previewRouter = Router();

previewRouter.get(/^\/p\/([^/]+)(?:\/(.*))?$/, async (req, res, next) => {
  const slug = req.params[0];
  const asset = req.params[1] ? sanitizeRelativePath(req.params[1]) : "index.html";

  const deployment = await prisma.deployment.findUnique({
    where: { publicSlug: slug },
    include: {
      space: {
        select: { expiresAt: true },
      },
    },
  });

  if (!deployment || !isDeploymentAvailable(deployment)) {
    res.status(404).send("Site not available.");
    return;
  }

  const targetPath = path.join(deployment.rootPath, asset);
  const targetNormalized = path.normalize(targetPath);
  if (!targetNormalized.startsWith(path.normalize(deployment.rootPath))) {
    res.status(403).send("Forbidden");
    return;
  }

  let filePath = targetPath;
  try {
    await fs.access(filePath);
  } catch {
    if (asset === "index.html") {
      res.status(404).send("File not found.");
      return;
    }
    filePath = path.join(deployment.rootPath, "index.html");
  }

  const isHtml = /\.html?$/i.test(filePath);
  const destination = req.get("Sec-Fetch-Dest");
  const isDocument = destination === "document"
    || (!destination && (/\.html?$/i.test(asset) || !path.extname(asset)));
  const shouldCount = req.method === "GET" && isHtml && isDocument
    && req.query.preview !== "1"
    && !/prefetch/i.test(`${req.get("Sec-Purpose") ?? ""} ${req.get("Purpose") ?? ""}`);

  // Document reloads must reach the server; preview frames never count.
  if (isHtml) res.setHeader("Cache-Control", "no-store");
  res.sendFile(path.resolve(filePath), (error) => {
    if (error) {
      next(error);
      return;
    }
    if (shouldCount && res.statusCode >= 200 && res.statusCode < 400) {
      // Atomic increment prevents simultaneous visits from overwriting each other.
      void prisma.deployment.update({
        where: { id: deployment.id },
        data: { viewCount: { increment: 1 } },
      }).catch((error) => console.error("[views] failed to record visit", deployment.id, error));
    }
  });
});
