import { Prisma } from "@prisma/client";
import type { Request, Response, NextFunction } from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

import { config } from "./config";
import { prisma } from "./db";
import { isExpired } from "./retention";
import { randomSlug } from "./utils";

const mergeSchema = z.object({
  sourceIds: z.array(z.string().min(1)).length(2),
  name: z.string().trim().min(1).max(80),
  slug: z.string().regex(/^[a-z0-9-]{2,40}$/).optional(),
  sourceDisposition: z.enum(["keep", "remove"]),
});

class MergeError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function sourceTagNames(spaces: { name: string; slug: string }[]): [string, string] {
  if (spaces[0].name !== spaces[1].name) return [spaces[0].name, spaces[1].name];
  return spaces.map((space) => {
    const suffix = ` (${space.slug})`;
    return `${space.name.slice(0, 80 - suffix.length)}${suffix}`;
  }) as [string, string];
}

export function mergeSpacesHandler(admin: boolean) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const parsed = mergeSchema.safeParse(req.body);
    if (!parsed.success || (parsed.success && parsed.data.sourceIds[0] === parsed.data.sourceIds[1])) {
      res.status(400).json({ message: "请选择两个不同的空间，并填写有效的新空间名称和网址后缀" });
      return;
    }
    const { sourceIds, name, sourceDisposition } = parsed.data;
    const newSpaceId = randomSlug(18);
    const copyRoot = path.join(config.uploadRoot, "spaces", newSpaceId);
    let copied = false;

    try {
      const copiedDeployments: {
        source: {
          id: string; spaceId: string | null; title: string; ownerUserId: string | null;
          visibility: "visible" | "hidden"; uploaderIp: string | null; uploaderAgent: string | null;
          createdAt: Date;
        };
        tagNames: string[];
        id: string; publicSlug: string; rootPath: string;
      }[] = [];
      if (sourceDisposition === "keep") {
        const sources = await prisma.space.findMany({ where: { id: { in: sourceIds } } });
        if (sources.length !== 2) throw new MergeError(404, "原空间不存在或已被删除");
        if (sources[0].ownerUserId !== sources[1].ownerUserId) {
          throw new MergeError(403, "只能合并同一创建者的空间");
        }
        if (!admin && sources[0].ownerUserId !== req.authUser?.userId) {
          throw new MergeError(403, "只能合并自己创建的空间");
        }
        if (sources.some((space) => isExpired(space.expiresAt))) {
          throw new MergeError(409, "过期空间不能合并");
        }
        const deployments = await prisma.deployment.findMany({
          where: { spaceId: { in: sourceIds }, deletedAt: null },
          include: { tags: { include: { tag: { select: { name: true } } } } },
        });
        await fs.mkdir(path.dirname(copyRoot), { recursive: true });
        await fs.mkdir(copyRoot);
        copied = true;
        for (const source of deployments) {
          const id = randomSlug(18);
          const rootPath = path.join(copyRoot, id);
          await fs.cp(source.rootPath, rootPath, { recursive: true, errorOnExist: true, force: false });
          copiedDeployments.push({
            source, tagNames: source.tags.map(({ tag }) => tag.name),
            id, publicSlug: randomSlug(10), rootPath,
          });
        }
      }
      const merged = await prisma.$transaction(async (tx) => {
        const found = await tx.space.findMany({ where: { id: { in: sourceIds } } });
        if (found.length !== 2) throw new MergeError(404, "原空间不存在或已被删除");
        const spaces = sourceIds.map((id) => found.find((space) => space.id === id)!);
        if (spaces[0].ownerUserId !== spaces[1].ownerUserId) {
          throw new MergeError(403, "只能合并同一创建者的空间");
        }
        if (!admin && spaces.some((space) => space.ownerUserId !== req.authUser?.userId)) {
          throw new MergeError(403, "只能合并自己创建的空间");
        }
        if (spaces.some((space) => isExpired(space.expiresAt))) {
          throw new MergeError(409, "过期空间不能合并");
        }
        if (sourceDisposition === "keep") {
          const current = await tx.deployment.findMany({
            where: { spaceId: { in: sourceIds }, deletedAt: null },
            select: { id: true },
          });
          const copiedIds = new Set(copiedDeployments.map(({ source }) => source.id));
          if (current.length !== copiedIds.size || current.some(({ id }) => !copiedIds.has(id))) {
            throw new MergeError(409, "原空间作品在合并期间发生变化，请重试");
          }
        }
        const sourceWorks = sourceDisposition === "remove"
          ? await tx.deployment.findMany({
              where: { spaceId: { in: sourceIds }, deletedAt: null },
              include: { tags: { include: { tag: { select: { name: true } } } } },
            })
          : [];
        const oldTags = await tx.spaceTag.findMany({ where: { spaceId: { in: sourceIds } } });
        const expiresAt = new Date(Math.max(...spaces.map((space) => space.expiresAt.getTime())));
        const space = await tx.space.create({
          data: {
            id: newSpaceId,
            name,
            slug: parsed.data.slug ?? randomSlug(8),
            ownerUserId: spaces[0].ownerUserId,
            expiresAt,
          },
        });
        const sourceNames = sourceTagNames(spaces);
        const tagNames = Array.from(new Set([...sourceNames, ...oldTags.map((tag) => tag.name)]));
        const tagIds = new Map(tagNames.map((tagName) => [tagName, randomSlug(18)]));
        await tx.spaceTag.createMany({
          data: tagNames.map((tagName) => ({
            id: tagIds.get(tagName)!, spaceId: space.id, name: tagName,
          })),
        });
        for (const [index, source] of spaces.entries()) {
          if (sourceDisposition === "keep") {
            const copies = copiedDeployments
              .filter(({ source: deployment }) => deployment.spaceId === source.id)
              .map((copy) => ({
                  id: copy.id,
                  title: copy.source.title,
                  publicSlug: copy.publicSlug,
                  ownerUserId: copy.source.ownerUserId,
                  spaceId: space.id,
                  rootPath: copy.rootPath,
                  expiresAt,
                  createdAt: copy.source.createdAt,
                  visibility: copy.source.visibility,
                  uploaderIp: copy.source.uploaderIp,
                  uploaderAgent: copy.source.uploaderAgent,
              }));
            if (copies.length) await tx.deployment.createMany({ data: copies });
            const assignments = copiedDeployments
              .filter(({ source: deployment }) => deployment.spaceId === source.id)
              .flatMap((copy) => Array.from(new Set([sourceNames[index], ...copy.tagNames]))
                .map((tagName) => ({ deploymentId: copy.id, tagId: tagIds.get(tagName)! })));
            if (assignments.length) await tx.deploymentTag.createMany({ data: assignments });
          } else {
            await tx.deployment.updateMany({
              where: { spaceId: source.id, deletedAt: null },
              data: { spaceId: space.id, expiresAt },
            });
            const assignments = sourceWorks
              .filter((deployment) => deployment.spaceId === source.id)
              .flatMap((deployment) => Array.from(new Set([
                sourceNames[index], ...deployment.tags.map(({ tag }) => tag.name),
              ])).map((tagName) => ({ deploymentId: deployment.id, tagId: tagIds.get(tagName)! })));
            if (assignments.length) await tx.deploymentTag.createMany({ data: assignments });
            await tx.deployment.deleteMany({
              where: { spaceId: source.id, deletedAt: { not: null } },
            });
            await tx.space.delete({ where: { id: source.id } });
          }
        }
        return space;
      }, { timeout: 120_000 });
      res.status(201).json({ ...merged, entryUrl: `${config.baseUrl}/s/${merged.slug}` });
    } catch (error) {
      if (copied) {
        try {
          await fs.rm(copyRoot, { recursive: true, force: true });
        } catch (cleanupError) {
          next(cleanupError);
          return;
        }
      }
      if (error instanceof MergeError) {
        res.status(error.status).json({ message: error.message });
        return;
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        res.status(409).json({ message: "网址后缀已被其他空间使用" });
        return;
      }
      next(error);
    }
  };
}
