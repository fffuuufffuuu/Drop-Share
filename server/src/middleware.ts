import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";

import { config } from "./config";
import type { AuthUser } from "./types";

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthUser;
    }
  }
}

const authPayloadSchema = z.object({
  userId: z.string(),
  username: z.string(),
});

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ message: "Missing token" });
    return;
  }

  const token = authHeader.replace("Bearer ", "").trim();
  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    const parsed = authPayloadSchema.parse(decoded);
    req.authUser = parsed;
    next();
  } catch {
    res.status(401).json({ message: "Invalid token" });
  }
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  const message = err instanceof Error ? err.message : "Internal server error";
  res.status(400).json({ message });
}
