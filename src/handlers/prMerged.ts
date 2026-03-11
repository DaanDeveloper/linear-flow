import { moveIssueToDone } from "../services/linear";

export async function handlePRMerged(branchName: string): Promise<void> {
  const match = branchName.match(/^feat\/([A-Z]+-\d+)/);
  if (!match) {
    console.log(`Branch "${branchName}" does not match expected format, skipping`);
    return;
  }

  const issueIdentifier = match[1];
  console.log(`PR merged for ${issueIdentifier}, moving to Done in Linear`);
  await moveIssueToDone(issueIdentifier);
}

export async function handlePRClosed(branchName: string): Promise<void> {
  const match = branchName.match(/^feat\/([A-Z]+-\d+)/);
  if (!match) {
    console.log(`Branch "${branchName}" does not match expected format, skipping`);
    return;
  }

  const issueIdentifier = match[1];
  console.log(`PR closed for ${issueIdentifier}, moving back to Todo in Linear`);

  const { moveIssueToTodo } = await import("../services/linear");
  await moveIssueToTodo(issueIdentifier);
}
