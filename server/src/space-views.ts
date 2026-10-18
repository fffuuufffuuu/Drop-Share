import { prisma } from "./db";

export async function getSpaceViewCounts(spaceIds: string[]): Promise<Map<string, number>> {
  if (!spaceIds.length) return new Map();
  const totals = await prisma.deployment.groupBy({
    by: ["spaceId"],
    where: { spaceId: { in: spaceIds }, deletedAt: null },
    _sum: { viewCount: true },
  });
  return new Map(totals.map((total) => [total.spaceId!, total._sum.viewCount ?? 0]));
}

export function sumWorkViews(works: { viewCount?: number }[]): number {
  return works.reduce((total, work) => total + (work.viewCount ?? 0), 0);
}
