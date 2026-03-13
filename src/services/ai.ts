import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import os from "os";

const execAsync = promisify(exec);

type AIProvider = "claude" | "codex";

function getProvider(): AIProvider {
  const provider = (process.env.AI_PROVIDER || "claude").toLowerCase();
  if (provider !== "claude" && provider !== "codex") {
    console.warn(`Unknown AI_PROVIDER "${provider}", falling back to claude`);
    return "claude";
  }
  return provider;
}

function cloneUrl(repo: string): string {
  const owner = process.env.GITHUB_OWNER!;
  const token = process.env.GITHUB_TOKEN!;
  return `https://${token}@github.com/${owner}/${repo}.git`;
}

async function cloneRepo(repo: string, branchName: string): Promise<string> {
  const tmpDir = path.join(os.tmpdir(), `ai-${branchName.replace(/\//g, "-")}-${Date.now()}`);
  await execAsync(`git clone --branch "${branchName}" --single-branch "${cloneUrl(repo)}" "${tmpDir}"`, {
    timeout: 60000,
  });
  return tmpDir;
}

async function runAI(cwd: string, prompt: string): Promise<string> {
  const provider = getProvider();
  const model = process.env.AI_MODEL || "";
  const escapedPrompt = prompt.replace(/\\/g, "\\\\").replace(/'/g, "'\\''");

  let command: string;

  if (provider === "codex") {
    const modelFlag = model ? ` --model ${model}` : "";
    command = `echo '${escapedPrompt}' | codex exec --full-auto${modelFlag}`;
  } else {
    const modelFlag = model ? ` --model ${model}` : "";
    command = `echo '${escapedPrompt}' | claude -p --dangerously-skip-permissions${modelFlag}`;
  }

  console.log(`Running ${provider}${model ? ` (${model})` : ""}...`);

  const { stdout } = await execAsync(command, {
    cwd,
    timeout: 600000,
    env: { ...process.env, PATH: process.env.PATH },
    maxBuffer: 10 * 1024 * 1024,
  });
  return stdout;
}

async function commitAndPush(cwd: string, message: string): Promise<boolean> {
  const { stdout: status } = await execAsync("git status --porcelain -- ':!CLAUDE.md'", { cwd });

  if (!status.trim()) {
    return false;
  }

  const escapedMessage = message.replace(/"/g, '\\"');
  await execAsync(`git add -A -- ':!CLAUDE.md' && git commit -m "${escapedMessage}" && git push`, { cwd });
  return true;
}

export async function aiFixIssue(
  repo: string,
  branchName: string,
  issueIdentifier: string,
  issueTitle: string,
  issueDescription: string
): Promise<void> {
  let tmpDir: string | null = null;

  try {
    console.log(`Cloning ${repo}/${branchName}...`);
    tmpDir = await cloneRepo(repo, branchName);

    const prompt = [
      `Issue: ${issueIdentifier}`,
      `Titel: ${issueTitle}`,
      `Beschrijving: ${issueDescription || "Geen beschrijving."}`,
      "",
      "Analyseer de codebase en los dit issue op. Maak de nodige wijzigingen in de code.",
    ].join("\n");

    await runAI(tmpDir, prompt);

    const pushed = await commitAndPush(tmpDir, `${issueIdentifier}: ${issueTitle}`);
    if (pushed) {
      console.log(`AI changes pushed for ${issueIdentifier}`);
    } else {
      throw new Error(`AI made no changes for ${issueIdentifier}`);
    }
  } finally {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

export async function aiHandlePRComment(
  repo: string,
  branchName: string,
  comment: string,
  prTitle: string
): Promise<void> {
  let tmpDir: string | null = null;

  try {
    console.log(`Cloning ${repo}/${branchName} for PR comment...`);
    tmpDir = await cloneRepo(repo, branchName);

    const prompt = [
      `PR: ${prTitle}`,
      `Feedback van reviewer:`,
      comment,
      "",
      "Pas de code aan op basis van deze feedback. Maak de nodige wijzigingen.",
    ].join("\n");

    await runAI(tmpDir, prompt);

    const pushed = await commitAndPush(tmpDir, `Address review feedback`);
    if (pushed) {
      console.log(`AI changes pushed for PR comment`);
    } else {
      throw new Error("AI made no changes for PR comment feedback");
    }
  } finally {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
