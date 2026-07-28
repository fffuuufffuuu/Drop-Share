export type UserRole = "USER" | "ADMIN";

export type CurrentUser = {
  id: string;
  username: string;
  role: UserRole;
};

export type AuthResponse = {
  token: string;
  user: CurrentUser & {
    createdAt: string;
  };
};

export type Deployment = {
  id: string;
  title: string;
  publicSlug: string;
  expiresAt: string;
  visibility: "visible" | "hidden";
  createdAt: string;
};

export type AdminDeployment = Deployment & {
  ownerLabel: string;
};

export type Space = {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
};

export type AdminSpace = Space & {
  ownerUsername: string;
  deploymentCount: number;
};

export type AdminSpaceDetail = Omit<AdminSpace, "deploymentCount"> & {
  deployments: AdminDeployment[];
};
