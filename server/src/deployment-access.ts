import { isExpired } from "./retention";

type DeploymentAvailability = {
  deletedAt: Date | null;
  visibility: string;
  expiresAt: Date;
  space: { expiresAt: Date } | null;
};

export function isDeploymentAvailable(
  deployment: DeploymentAvailability,
  now = new Date(),
): boolean {
  if (deployment.deletedAt || deployment.visibility === "hidden") {
    return false;
  }

  return !isExpired(deployment.space?.expiresAt ?? deployment.expiresAt, now);
}
