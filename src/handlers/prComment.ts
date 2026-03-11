import { aiHandlePRComment } from "../services/ai";

interface PRCommentPayload {
  action: string;
  comment: {
    body: string;
    user: {
      login: string;
    };
  };
  issue: {
    pull_request?: {
      url: string;
    };
    title: string;
    number: number;
  };
  repository: {
    name: string;
  };
}

export async function handlePRComment(payload: PRCommentPayload): Promise<void> {
  // Only handle new comments on PRs, ignore bot comments to prevent loops
  if (!payload.issue.pull_request) return;
  if (payload.comment.user.login.includes("[bot]")) return;
  if (payload.comment.user.login === "github-actions") return;

  const repo = payload.repository.name;
  const comment = payload.comment.body;
  const prTitle = payload.issue.title;
  const prNumber = payload.issue.number;

  // Get the branch name from the PR
  const { Octokit } = await import("@octokit/rest");
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN! });
  const owner = process.env.GITHUB_OWNER!;

  const { data: pr } = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number: prNumber,
  });

  const branchName = pr.head.ref;

  // Only handle branches that match our format
  if (!branchName.startsWith("feat/")) {
    console.log(`Branch "${branchName}" is not a feat branch, skipping`);
    return;
  }

  console.log(`PR #${prNumber} comment on branch "${branchName}": "${comment.substring(0, 100)}..."`);

  try {
    await aiHandlePRComment(repo, branchName, comment, prTitle);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`AI failed handling PR comment on #${prNumber}: ${errorMsg}`);

    // Reply on PR with error message
    try {
      await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: prNumber,
        body: `🤖 AI kon de feedback niet verwerken:\n\n\`${errorMsg}\`\n\nProbeer het opnieuw of pas de code handmatig aan.`,
      });
    } catch (commentErr) {
      console.error(`Failed to post error comment on PR #${prNumber}:`, commentErr);
    }
  }
}
