import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import os from "os";

const execAsync = promisify(exec);

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

async function runClaude(cwd: string, prompt: string): Promise<string> {
  const escapedPrompt = prompt.replace(/\\/g, "\\\\").replace(/'/g, "'\\''");
  const { stdout } = await execAsync(`echo '${escapedPrompt}' | claude -p --dangerously-skip-permissions`, {
    cwd,
    timeout: 600000,
    env: { ...process.env, PATH: process.env.PATH },
    maxBuffer: 10 * 1024 * 1024,
  });
  return stdout;
}

async function commitAndPush(cwd: string, message: string): Promise<boolean> {
  const { stdout: status } = await execAsync("git status --porcelain", { cwd });

  if (!status.trim()) {
    return false;
  }

  const escapedMessage = message.replace(/"/g, '\\"');
  await execAsync(`git add -A && git commit -m "${escapedMessage}" && git push`, { cwd });
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

    console.log(`Running Claude AI on ${issueIdentifier}...`);
    await runClaude(tmpDir, prompt);

    const pushed = await commitAndPush(tmpDir, `${issueIdentifier}: ${issueTitle}`);
    if (pushed) {
      console.log(`AI changes pushed for ${issueIdentifier}`);
    } else {
      console.log(`No changes made by AI for ${issueIdentifier}`);
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

    console.log(`Running Claude AI on PR comment...`);
    await runClaude(tmpDir, prompt);

    const pushed = await commitAndPush(tmpDir, `Address review feedback`);
    if (pushed) {
      console.log(`AI changes pushed for PR comment`);
    } else {
      console.log(`No changes made by AI for PR comment`);
    }
  } finally {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
