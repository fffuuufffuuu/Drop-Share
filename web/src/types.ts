export type Deployment = {
  id: string;
  title: string;
  publicSlug: string;
  expiresAt: string;
  visibility: "visible" | "hidden";
  createdAt: string;
};

export type Space = {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
};
