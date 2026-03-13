import { LinearClient } from "@linear/sdk";

const linear = new LinearClient({ apiKey: process.env.LINEAR_API_KEY! });

export async function getProjectRepoName(projectId: string): Promise<string | null> {
  const result = await linear.client.rawRequest(
    `query($id: String!) { project(id: $id) { name } }`,
    { id: projectId }
  );
  return (result.data as any)?.project?.name ?? null;
}

export async function getIssueDescription(issueId: string): Promise<string> {
  const result = await linear.client.rawRequest(
    `query($id: String!) { issue(id: $id) { description } }`,
    { id: issueId }
  );
  return (result.data as any)?.issue?.description ?? "";
}

function parseIdentifier(issueIdentifier: string): { teamKey: string; number: number } | null {
  const match = issueIdentifier.match(/^([A-Z]+)-(\d+)$/);
  if (!match) return null;
  return { teamKey: match[1], number: parseInt(match[2], 10) };
}

async function findIssueWithStates(issueIdentifier: string): Promise<{ id: string; states: { id: string; name: string }[] } | null> {
  const parsed = parseIdentifier(issueIdentifier);
  if (!parsed) return null;

  const result = await linear.client.rawRequest(
    `query($number: NumberComparator!, $team: TeamFilter!) {
      issues(filter: { number: $number, team: $team }, first: 1) {
        nodes { id identifier team { states { nodes { id name } } } }
      }
    }`,
    { number: { eq: parsed.number }, team: { key: { eq: parsed.teamKey } } }
  );

  const issue = (result.data as any)?.issues?.nodes?.[0];
  if (!issue) return null;

  return {
    id: issue.id,
    states: issue.team?.states?.nodes ?? [],
  };
}

async function findIssueId(issueIdentifier: string): Promise<string | null> {
  const parsed = parseIdentifier(issueIdentifier);
  if (!parsed) return null;

  const result = await linear.client.rawRequest(
    `query($number: NumberComparator!, $team: TeamFilter!) {
      issues(filter: { number: $number, team: $team }, first: 1) {
        nodes { id }
      }
    }`,
    { number: { eq: parsed.number }, team: { key: { eq: parsed.teamKey } } }
  );

  return (result.data as any)?.issues?.nodes?.[0]?.id ?? null;
}

export async function moveIssueToStatus(issueIdentifier: string, statusName: string): Promise<void> {
  const issue = await findIssueWithStates(issueIdentifier);
  if (!issue) {
    console.log(`Issue ${issueIdentifier} not found in Linear`);
    return;
  }

  const targetState = issue.states.find((s) => s.name === statusName);
  if (!targetState) {
    console.log(`State "${statusName}" not found for team`);
    return;
  }

  await linear.client.rawRequest(
    `mutation($id: String!, $input: IssueUpdateInput!) { issueUpdate(id: $id, input: $input) { success } }`,
    { id: issue.id, input: { stateId: targetState.id } }
  );
  console.log(`Issue ${issueIdentifier} moved to "${statusName}"`);
}

export async function moveIssueToDone(issueIdentifier: string): Promise<void> {
  await moveIssueToStatus(issueIdentifier, process.env.LINEAR_STATUS_DONE || "Done");
}

export async function moveIssueToTodo(issueIdentifier: string): Promise<void> {
  await moveIssueToStatus(issueIdentifier, process.env.LINEAR_STATUS_TODO || "Todo");
}

export async function moveIssueToReview(issueIdentifier: string): Promise<void> {
  await moveIssueToStatus(issueIdentifier, process.env.LINEAR_STATUS_REVIEW || "Review");
}

export async function moveIssueToAIFailed(issueIdentifier: string): Promise<void> {
  await moveIssueToStatus(issueIdentifier, process.env.LINEAR_STATUS_AI_FAILED || "Todo");
}

export async function addCommentToIssue(issueIdentifier: string, body: string): Promise<void> {
  const issueId = await findIssueId(issueIdentifier);
  if (!issueId) {
    console.log(`Issue ${issueIdentifier} not found, cannot add comment`);
    return;
  }
  await linear.client.rawRequest(
    `mutation($input: CommentCreateInput!) { commentCreate(input: $input) { success } }`,
    { input: { issueId, body } }
  );
  console.log(`Comment added to ${issueIdentifier}`);
}
