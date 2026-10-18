import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import jwt from "jsonwebtoken";
import {config} from "./config";
import {prisma} from "./db";
import {getCloudbaseUser,AuthError} from "./cloudbase";
import {resolveAuthUser} from "./auth-identity";
vi.mock("./db",()=>({prisma:{user:{findUnique:vi.fn()}}}));
vi.mock("./cloudbase",async original=>({...await original<any>(),getCloudbaseUser:vi.fn()}));
beforeEach(()=>{vi.clearAllMocks();config.authProvider="cloudbase";config.cloudbaseEnvId="test-env";});
afterEach(()=>{config.authProvider="legacy";});
describe("business authentication",()=>{
  it("rejects legacy JWTs when CloudBase is enabled without falling back",async()=>{
    const token=jwt.sign({userId:"admin",username:"admin"},config.jwtSecret);
    vi.mocked(getCloudbaseUser).mockRejectedValue(new AuthError("Invalid token",401));
    await expect(resolveAuthUser(token)).rejects.toThrow();expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
  it("uses the exact immutable identity and the original local ID",async()=>{
    vi.mocked(getCloudbaseUser).mockResolvedValue({sub:"AbC",status:"ACTIVE"});
    vi.mocked(prisma.user.findUnique).mockResolvedValue({id:"old-local",username:"teacher",cloudbaseSubject:"AbC",cloudbaseEnvId:"test-env"} as any);
    expect(await resolveAuthUser("provider-token")).toEqual({userId:"old-local",username:"teacher"});
  });
  it("rejects case-insensitive database matches for a different identity",async()=>{
    vi.mocked(getCloudbaseUser).mockResolvedValue({sub:"AbC",status:"ACTIVE"});
    vi.mocked(prisma.user.findUnique).mockResolvedValue({id:"other",username:"other",cloudbaseSubject:"abc",cloudbaseEnvId:"test-env"} as any);
    await expect(resolveAuthUser("provider-token")).rejects.toMatchObject({status:401});
  });
});
