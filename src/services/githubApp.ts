import crypto from "crypto";
import fs from "fs";
import { Octokit } from "@octokit/rest";

interface CachedToken {
  token: string;
  expiresAt: number;
}

let cachedToken: CachedToken | null = null;

function getPrivateKey(): string {
  const keyPath = process.env.GITHUB_APP_PRIVATE_KEY_PATH;
  if (keyPath) {
    return fs.readFileSync(keyPath, "utf8");
  }

  const keyBase64 = process.env.GITHUB_APP_PRIVATE_KEY_BASE64;
  if (keyBase64) {
    return Buffer.from(keyBase64, "base64").toString("utf8");
  }

  throw new Error("Set GITHUB_APP_PRIVATE_KEY_PATH or GITHUB_APP_PRIVATE_KEY_BASE64");
}

function generateJWT(): string {
  const appId = process.env.GITHUB_APP_ID;
  if (!appId) throw new Error("GITHUB_APP_ID is not set");

  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      iat: now - 60,
      exp: now + 600,
      iss: appId,
    })
  ).toString("base64url");

  const privateKey = getPrivateKey();
  const signature = crypto
    .createSign("RSA-SHA256")
    .update(`${header}.${payload}`)
    .sign(privateKey, "base64url");

  return `${header}.${payload}.${signature}`;
}

async function getInstallationToken(): Promise<string> {
  // Return cached token if still valid (5 min buffer)
  if (cachedToken && cachedToken.expiresAt > Date.now() + 5 * 60 * 1000) {
    return cachedToken.token;
  }

  const installationId = process.env.GITHUB_APP_INSTALLATION_ID;
  if (!installationId) throw new Error("GITHUB_APP_INSTALLATION_ID is not set");

  const jwt = generateJWT();
  const appOctokit = new Octokit({ auth: jwt });

  const { data } = await appOctokit.rest.apps.createInstallationAccessToken({
    installation_id: Number(installationId),
  });

  cachedToken = {
    token: data.token,
    expiresAt: new Date(data.expires_at).getTime(),
  };

  return data.token;
}

export async function getOctokit(): Promise<Octokit> {
  const token = await getInstallationToken();
  return new Octokit({ auth: token });
}

export async function getToken(): Promise<string> {
  return getInstallationToken();
}
