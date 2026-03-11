import { LinearIssueData } from "../types/linear";
import { getProjectRepoName } from "../services/linear";
import { branchExists, closePR, deleteBranch } from "../services/github";
import { generateBranchName } from "../utils/branchName";

export async function handleIssueBackToTodo(data: LinearIssueData): Promise<void> {
  if (!data.projectId) return;

  const repoName = await getProjectRepoName(data.projectId);
  if (!repoName) return;

  const branchName = generateBranchName(data.identifier, data.title);

  if (!(await branchExists(repoName, branchName))) {
    console.log(`Branch "${branchName}" does not exist, nothing to clean up`);
    return;
  }

  console.log(`Closing PR and deleting branch "${branchName}" in repo "${repoName}"`);
  await closePR(repoName, branchName);
  await deleteBranch(repoName, branchName);
  console.log(`Branch "${branchName}" deleted`);
}
