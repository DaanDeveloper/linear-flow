import { LinearIssueData } from "../types/linear";
import { getProjectRepoName, getIssueDescription, moveIssueToReview, addCommentToIssue, moveIssueToAIFailed } from "../services/linear";
import { branchExists, createBranch, createEmptyCommit, createPR, deleteBranch } from "../services/github";
import { aiFixIssue } from "../services/ai";
import { generateBranchName } from "../utils/branchName";

async function setupBranch(data: LinearIssueData): Promise<{ repoName: string; branchName: string; description: string } | null> {
  if (!data.projectId) {
    console.log(`Issue ${data.identifier} has no project, skipping`);
    return null;
  }

  const repoName = await getProjectRepoName(data.projectId);
  if (!repoName) {
    console.log(`Could not find project for issue ${data.identifier}`);
    return null;
  }

  const branchName = generateBranchName(data.identifier, data.title);
  const description = data.description || await getIssueDescription(data.id);

  if (await branchExists(repoName, branchName)) {
    console.log(`Branch "${branchName}" already exists, skipping`);
    return null;
  }

  console.log(`Creating branch "${branchName}" in repo "${repoName}"`);
  const baseSha = await createBranch(repoName, branchName);
  console.log(`Branch "${branchName}" created`);

  return { repoName, branchName, description };
}

// In Progress: branch + empty commit + PR (handmatig werken)
export async function handleInProgress(data: LinearIssueData): Promise<void> {
  const result = await setupBranch(data);
  if (!result) return;

  const { repoName, branchName, description } = result;

  const { Octokit } = await import("@octokit/rest");
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN! });
  const { data: ref } = await octokit.rest.git.getRef({
    owner: process.env.GITHUB_OWNER!,
    repo: repoName,
    ref: `heads/${branchName}`,
  });
  await createEmptyCommit(repoName, branchName, ref.object.sha, `${data.identifier}: ${data.title}`);

  const prBody = `## ${data.identifier}: ${data.title}\n\n${description || "Geen beschrijving."}`;
  const prUrl = await createPR(repoName, branchName, `${data.identifier}: ${data.title}`, prBody);
  console.log(`PR created: ${prUrl}`);
}

// AI: branch + Claude fixt het + PR
export async function handleAI(data: LinearIssueData): Promise<void> {
  const result = await setupBranch(data);
  if (!result) return;

  const { repoName, branchName, description } = result;

  try {
    await aiFixIssue(repoName, branchName, data.identifier, data.title, description);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`AI fix failed for ${data.identifier}: ${errorMsg}`);

    // Cleanup: delete branch, move issue to failed state, add comment
    try {
      await deleteBranch(repoName, branchName);
      console.log(`Branch "${branchName}" deleted after AI failure`);
    } catch (delErr) {
      console.error(`Failed to delete branch "${branchName}":`, delErr);
    }

    await addCommentToIssue(
      data.identifier,
      `🤖 AI kon dit issue niet automatisch oplossen:\n\n\`${errorMsg}\`\n\nHet issue is teruggezet. Probeer het opnieuw of los het handmatig op.`
    );
    await moveIssueToAIFailed(data.identifier);
    console.log(`Issue ${data.identifier} moved to AI failed state`);
    return;
  }

  const prBody = `## ${data.identifier}: ${data.title}\n\n${description || "Geen beschrijving."}`;
  const prUrl = await createPR(repoName, branchName, `${data.identifier}: ${data.title}`, prBody);
  console.log(`PR created: ${prUrl}`);

  await moveIssueToReview(data.identifier);
  console.log(`Issue ${data.identifier} moved to Review`);
}
