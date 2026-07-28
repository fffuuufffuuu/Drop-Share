import type { NextFunction, Request, Response } from "express";
import { UserRole } from "@prisma/client";
import jwt from "jsonwebtoken";
import { z } from "zod";

import { config } from "./config";
import { prisma } from "./db";
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

export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.authUser) {
    res.status(401).json({ message: "请先登录" });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: req.authUser.userId },
    select: { role: true },
  });

  if (!user || user.role !== UserRole.ADMIN) {
    res.status(403).json({ message: "仅管理员可访问" });
    return;
  }

  next();
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  const message = err instanceof Error ? err.message : "Internal server error";
  res.status(400).json({ message });
}
