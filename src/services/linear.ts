import { LinearClient } from "@linear/sdk";

const linear = new LinearClient({ apiKey: process.env.LINEAR_API_KEY! });

export async function getProjectRepoName(projectId: string): Promise<string | null> {
  const project = await linear.project(projectId);
  return project?.name ?? null;
}

export async function getIssueDescription(issueId: string): Promise<string> {
  const issue = await linear.issue(issueId);
  return issue?.description ?? "";
}

export async function moveIssueToStatus(issueIdentifier: string, statusName: string): Promise<void> {
  const issues = await linear.issueSearch({ query: issueIdentifier });
  const issue = issues.nodes.find((i) => i.identifier === issueIdentifier);
  if (!issue) {
    console.log(`Issue ${issueIdentifier} not found in Linear`);
    return;
  }

  const team = await issue.team;
  if (!team) return;

  const states = await team.states();
  const targetState = states.nodes.find((s) => s.name === statusName);
  if (!targetState) {
    console.log(`State "${statusName}" not found for team`);
    return;
  }

  await linear.updateIssue(issue.id, { stateId: targetState.id });
  console.log(`Issue ${issueIdentifier} moved to "${statusName}"`);
}

export async function moveIssueToDone(issueIdentifier: string): Promise<void> {
  const statusName = process.env.LINEAR_STATUS_DONE || "Done";
  await moveIssueToStatus(issueIdentifier, statusName);
}

export async function moveIssueToTodo(issueIdentifier: string): Promise<void> {
  const statusName = process.env.LINEAR_STATUS_TODO || "Todo";
  await moveIssueToStatus(issueIdentifier, statusName);
}

export async function moveIssueToReview(issueIdentifier: string): Promise<void> {
  const statusName = process.env.LINEAR_STATUS_REVIEW || "Review";
  await moveIssueToStatus(issueIdentifier, statusName);
}

export async function moveIssueToAIFailed(issueIdentifier: string): Promise<void> {
  const statusName = process.env.LINEAR_STATUS_AI_FAILED || "Todo";
  await moveIssueToStatus(issueIdentifier, statusName);
}

export async function addCommentToIssue(issueIdentifier: string, body: string): Promise<void> {
  const issues = await linear.issueSearch({ query: issueIdentifier });
  const issue = issues.nodes.find((i) => i.identifier === issueIdentifier);
  if (!issue) {
    console.log(`Issue ${issueIdentifier} not found, cannot add comment`);
    return;
  }
  await linear.createComment({ issueId: issue.id, body });
  console.log(`Comment added to ${issueIdentifier}`);
}
