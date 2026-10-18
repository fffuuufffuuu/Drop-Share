import type { NextFunction, Request, Response } from "express";
import { UserRole } from "@prisma/client";
import { prisma } from "./db";
import type { AuthUser } from "./types";
import { resolveAuthUser } from "./auth-identity";
import { AuthError } from "./cloudbase";

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthUser;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ message: "Missing token" });
    return;
  }

  const token = authHeader.replace("Bearer ", "").trim();
  try {
    req.authUser = await resolveAuthUser(token);
    next();
  } catch (error) {
    if (error instanceof AuthError && [429,503].includes(error.status)) {res.status(error.status).json({message:error.message});return;}
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
