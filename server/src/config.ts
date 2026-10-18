import dotenv from "dotenv";
import path from "node:path";

dotenv.config();

export const config = {
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: process.env.DATABASE_URL ?? "",
  jwtSecret: process.env.JWT_SECRET ?? "dev-secret",
  authProvider: process.env.AUTH_PROVIDER ?? "legacy",
  cloudbaseEnvId: process.env.CLOUDBASE_ENV_ID ?? "",
  cloudbaseLoginMethod: process.env.CLOUDBASE_LOGIN_METHOD ?? "sms",
  baseUrl: process.env.BASE_URL ?? "http://localhost:4000",
  defaultExpiresHours: Number(process.env.DEFAULT_EXPIRES_HOURS ?? 3),
  uploadRoot: path.resolve(process.cwd(), process.env.UPLOAD_ROOT ?? "./storage"),
};
