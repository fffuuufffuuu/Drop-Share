import { Router } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";

import { config } from "./config";
import { prisma } from "./db";

const registerSchema = z.object({
  username: z
    .string()
    .min(3)
    .max(32)
    .regex(/^[a-zA-Z0-9_]+$/, "用户名只能包含字母、数字和下划线"),
  password: z.string().min(8).max(100),
});

const loginSchema = z.object({
  username: z.string().min(3).max(32),
  password: z.string().min(8).max(100),
});

export const authRouter = Router();

authRouter.post("/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid payload" });
    return;
  }

  const bcrypt = await import("bcryptjs");
  const passwordHash = await bcrypt.hash(parsed.data.password, 10);

  try {
    const user = await prisma.user.create({
      data: {
        username: parsed.data.username,
        passwordHash,
      },
    });

    const token = jwt.sign(
      {
        userId: user.id,
        username: user.username,
      },
      config.jwtSecret,
      { expiresIn: "7d" },
    );

    res.status(201).json({
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        createdAt: user.createdAt,
      },
    });
  } catch (error: any) {
    if (error.code === "P2002") {
      res.status(400).json({ message: "用户名已被占用" });
      return;
    }
    res.status(500).json({ message: "注册失败" });
  }
});

authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid payload" });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { username: parsed.data.username },
  });

  if (!user) {
    res.status(400).json({ message: "用户名或密码错误" });
    return;
  }

  const bcrypt = await import("bcryptjs");
  const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!ok) {
    res.status(400).json({ message: "用户名或密码错误" });
    return;
  }

  const token = jwt.sign(
    {
      userId: user.id,
      username: user.username,
    },
    config.jwtSecret,
    { expiresIn: "7d" },
  );

  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      createdAt: user.createdAt,
    },
  });
});
