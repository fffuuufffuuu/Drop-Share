import { AuthError, cloudbasePhone, cloudbaseRequest, cloudbaseSessionSchema, getCloudbaseUser } from "./cloudbase";

type Proof = { sms: boolean; identity: string; id: string; isUser: boolean };

// The provider must reject the credential itself. Schema errors and outages prove no revocation.
function credentialRejected(error: unknown): boolean {
  return error instanceof AuthError && error.status < 500 && !!error.diagnostic?.upstreamStatus
    && ["unauthenticated", "invalid_grant", "invalid_token", "login_required", "token_expired"].includes(error.code ?? "");
}

export async function verifyCloudbaseAcceptance(proof: Proof, code: string, onStage: (stage: string) => void = () => {}) {
  onStage("verification");
  const verification = await cloudbaseRequest("/verification/verify", { verification_id: proof.id, verification_code: code });
  onStage(proof.isUser ? "signin" : "signup");
  const initial = await cloudbaseRequest(proof.isUser ? "/signin" : "/signup", {
    verification_token: verification.verification_token,
    ...(proof.isUser ? {} : proof.sms ? { phone_number: cloudbasePhone(proof.identity) } : { email: proof.identity }),
  });
  let latestToken = typeof initial?.access_token === "string" && initial.access_token.length <= 8192 ? initial.access_token : undefined;
  let latestRefreshToken = "";
  try {
    const session = cloudbaseSessionSchema.parse(initial);
    latestToken = session.access_token;
    latestRefreshToken = session.refresh_token;
    const checkIdentity = async () => {
      const user = await getCloudbaseUser(latestToken!);
      const identity = proof.sms ? user.phone_number?.replace(/\s/g, "") : user.email?.toLowerCase();
      if (user.sub !== session.sub || identity !== proof.identity) throw new Error("认证身份不匹配");
    };
    onStage("initial_profile");
    await checkIdentity();
    onStage("refresh");
    const rawRefresh = await cloudbaseRequest("/token", { grant_type: "refresh_token", refresh_token: latestRefreshToken });
    if (typeof rawRefresh?.access_token === "string" && rawRefresh.access_token.length > 0 && rawRefresh.access_token.length <= 8192) latestToken = rawRefresh.access_token;
    const refreshed = cloudbaseSessionSchema.parse(rawRefresh);
    latestToken = refreshed.access_token;
    latestRefreshToken = refreshed.refresh_token;
    if (refreshed.sub !== session.sub || latestRefreshToken === session.refresh_token) throw new Error("刷新身份或刷新令牌轮换不符合预期");
    onStage("refreshed_profile");
    await checkIdentity();
  } finally {
    // Preserve the failing stage in diagnostics while always ending the issued session.
    if (latestToken) await cloudbaseRequest("/user/signout", {}, latestToken);
  }
  onStage("access_revocation");
  let accessRevoked = false;
  try { await cloudbaseRequest("/user/me", undefined, latestToken); }
  catch (error) { if (credentialRejected(error)) accessRevoked = true; else throw error; }
  if (!accessRevoked) throw new Error("退出后访问令牌仍可用，需要检查 CloudBase 会话撤销行为");
  onStage("refresh_revocation");
  let refreshRevoked = false;
  let unexpected: any;
  try {
    unexpected = await cloudbaseRequest("/token", { grant_type: "refresh_token", refresh_token: latestRefreshToken });
  } catch (error) { if (credentialRejected(error)) refreshRevoked = true; else throw error; }
  if (!refreshRevoked) {
    // If revocation failed, clean up the newly issued test session too.
    if (typeof unexpected?.access_token === "string") await cloudbaseRequest("/user/signout", {}, unexpected.access_token);
    throw new Error("退出后刷新令牌仍可用，需要检查 CloudBase 会话撤销行为");
  }
  onStage("complete");
  return { profileValidated: true, refreshRotated: true, accessRevoked, refreshRevoked };
}
