import { Prisma } from "@prisma/client";
import type { Request, Response, NextFunction } from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

import { config } from "./config";
import { prisma } from "./db";
import { isExpired } from "./retention";
import { randomSlug } from "./utils";
import {lockSpace} from "./space-contributors";

const mergeSchema = z.object({
  sourceIds: z.array(z.string().min(1)).min(2),
  name: z.string().trim().min(1).max(80),
  slug: z.string().regex(/^[a-z0-9-]{2,40}$/).optional(),
  sourceDisposition: z.enum(["keep", "remove"]),
});

class MergeError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function sourceTagNames(spaces: { name: string; slug: string }[]): string[] {
  const counts = new Map<string, number>();
  for (const space of spaces) {
    counts.set(space.name, (counts.get(space.name) ?? 0) + 1);
  }
  return spaces.map((space) => {
    if ((counts.get(space.name) ?? 0) === 1) return space.name;
    const suffix = ` (${space.slug})`;
    return `${space.name.slice(0, 80 - suffix.length)}${suffix}`;
  });
}

function temporarySlug(): string {
  return `z${randomSlug(18).replace(/_/g, "a")}`;
}

function assertSameOwner(spaces: { ownerUserId: string }[]) {
  if (spaces.some((space) => space.ownerUserId !== spaces[0].ownerUserId)) {
    throw new MergeError(403, "只能合并同一创建者的空间");
  }
}

export function isSlugReusableDuringMerge(
  existingId: string | undefined,
  sourceIds: string[],
  sourceDisposition: "keep" | "remove",
): boolean {
  if (!existingId) return true;
  return sourceDisposition === "remove" && sourceIds.includes(existingId);
}

export function mergeAvailabilityHandler(req: Request, res: Response, next: NextFunction) {
  const parsed = mergeSchema.safeParse(req.body);
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const slug = typeof req.body?.slug === "string" ? req.body.slug.trim() : "";
  const errors: { name?: string; slug?: string } = {};
  if (!name || name.length > 80) {
    errors.name = "新空间名称须为 1 至 80 个字，请修改后再合并";
  }
  if (slug && !/^[a-z0-9-]{2,40}$/.test(slug)) {
    errors.slug = "网址后缀须为 2 至 40 位小写字母、数字或连字符，请修改后再合并";
  }
  if (!parsed.success || new Set(parsed.data.sourceIds).size !== parsed.data.sourceIds.length) {
    if (!errors.name && !errors.slug) {
      res.status(400).json({ message: "请选择至少两个不同的空间，并填写有效的新空间名称和网址后缀" });
      return;
    }
    res.status(409).json({ message: errors.slug || errors.name, errors });
    return;
  }
  void (async () => {
    try {
      if (slug && !errors.slug) {
        const existing = await prisma.space.findUnique({ where: { slug }, select: { id: true } });
        if (!isSlugReusableDuringMerge(existing?.id, parsed.data.sourceIds, parsed.data.sourceDisposition)) {
          errors.slug = "该网址后缀已被使用，请修改后再合并";
        }
      }
      if (errors.name || errors.slug) {
        res.status(409).json({ message: errors.slug || errors.name, errors });
        return;
      }
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  })();
}

export function mergeSpacesHandler(admin: boolean) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const parsed = mergeSchema.safeParse(req.body);
    if (!parsed.success || new Set(parsed.data.sourceIds).size !== parsed.data.sourceIds.length) {
      res.status(400).json({ message: "请选择至少两个不同的空间，并填写有效的新空间名称和网址后缀" });
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
          createdAt: Date; rootPath:string;previousRootPath:string|null;
        };
        tagNames: string[];
        id: string; publicSlug: string; rootPath: string;previousRootPath:string|null;
      }[] = [];
      if (sourceDisposition === "keep") {
        const sources = await prisma.space.findMany({ where: { id: { in: sourceIds } } });
        if (sources.length !== sourceIds.length) throw new MergeError(404, "原空间不存在或已被删除");
        assertSameOwner(sources);
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
          const previousRootPath=source.previousRootPath?path.join(copyRoot,`${id}-previous`):null;
          if(previousRootPath)await fs.cp(source.previousRootPath!,previousRootPath,{recursive:true,errorOnExist:true,force:false});
          copiedDeployments.push({
            source, tagNames: source.tags.map(({ tag }) => tag.name),
            id, publicSlug: randomSlug(10), rootPath,previousRootPath,
          });
        }
      }
      const merged = await prisma.$transaction(async (tx) => {
        for(const sourceId of [...sourceIds].sort())await lockSpace(tx,sourceId);
        const found = await tx.space.findMany({ where: { id: { in: sourceIds } } });
        if (found.length !== sourceIds.length) throw new MergeError(404, "原空间不存在或已被删除");
        const spaces = sourceIds.map((id) => found.find((space) => space.id === id)!);
        assertSameOwner(spaces);
        if (!admin && spaces.some((space) => space.ownerUserId !== req.authUser?.userId)) {
          throw new MergeError(403, "只能合并自己创建的空间");
        }
        if (spaces.some((space) => isExpired(space.expiresAt))) {
          throw new MergeError(409, "过期空间不能合并");
        }
        if (sourceDisposition === "keep") {
          const current = await tx.deployment.findMany({
            where: { spaceId: { in: sourceIds }, deletedAt: null },
            select: { id: true,rootPath:true,previousRootPath:true },
          });
          const copiedIds = new Set(copiedDeployments.map(({ source }) => source.id));
          if (current.length !== copiedIds.size || current.some(({ id,rootPath,previousRootPath }) => {
            const source=copiedDeployments.find(copy=>copy.source.id===id)?.source;
            return !copiedIds.has(id)||source?.rootPath!==rootPath||(source?.previousRootPath??null)!==(previousRootPath??null);
          })) {
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
        let slug = parsed.data.slug ?? randomSlug(8);
        const slugSource = spaces.find((space) => space.slug === slug);
        if (slugSource) {
          if (sourceDisposition === "remove") {
            await tx.space.update({
              where: { id: slugSource.id },
              data: { slug: temporarySlug() },
            });
          } else {
            throw new MergeError(409, "该网址后缀已被使用，请修改后再合并");
          }
        } else if (parsed.data.slug) {
          const occupied = await tx.space.findUnique({ where: { slug }, select: { id: true } });
          if (occupied) {
            throw new MergeError(409, "该网址后缀已被使用，请修改后再合并");
          }
        }
        const space = await tx.space.create({
          data: {
            id: newSpaceId,
            name,
            slug,
            ownerUserId: spaces[0].ownerUserId,
            expiresAt,
          },
        });
        const grants=await tx.spaceAdministrator.findMany({where:{spaceId:{in:sourceIds}},select:{userId:true}});
        if(grants.length)await tx.spaceAdministrator.createMany({data:Array.from(new Set(grants.map(grant=>grant.userId))).map(userId=>({spaceId:space.id,userId})),skipDuplicates:true});
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
                  previousRootPath: copy.previousRootPath,
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
        res.status(409).json({ message: "该网址后缀已被使用，请修改后再合并", errors: { slug: "该网址后缀已被使用，请修改后再合并" } });
        return;
      }
      next(error);
    }
  };
}
