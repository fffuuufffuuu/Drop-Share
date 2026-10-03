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

export type PersonalDeployment = Deployment & {
  deletedAt: string | null;
};

export type SpaceUploadDeployment = PersonalDeployment & {
  space: {
    id: string;
    name: string;
    slug: string;
  };
};

export type SpaceDeployment = Deployment & {
  uploaderName: string;
  tagIds: string[];
};

export type AdminDeployment = Deployment & {
  ownerLabel: string;
  tagIds?: string[];
};

export type SpaceTag = {
  id: string;
  spaceId: string;
  name: string;
  createdAt: string;
};

export type Space = {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  expiresAt: string;
  downloadsEnabled: boolean;
  deploymentCount: number;
};

export type AdminSpace = Space & {
  ownerUserId: string;
  ownerUsername: string;
  deploymentCount: number;
};

export type AdminSpaceDetail = Omit<AdminSpace, "deploymentCount"> & {
  deployments: AdminDeployment[];
  tags: SpaceTag[];
};
