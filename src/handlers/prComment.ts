import { aiHandlePRComment } from "../services/ai";
import { moveIssueToReview, moveIssueToAIFailed, addCommentToIssue } from "../services/linear";

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

const AI_TRIGGER = "@ai";

function extractIssueIdentifier(branchName: string): string | null {
  // Branch format: feat/{TEAM}-{NUMBER}-{slug}
  const match = branchName.match(/^feat\/([A-Z]+-\d+)/);
  return match ? match[1] : null;
}

export async function handlePRComment(payload: PRCommentPayload): Promise<void> {
  // Only handle new comments on PRs, ignore bot comments to prevent loops
  if (!payload.issue.pull_request) return;
  if (payload.comment.user.login.includes("[bot]")) return;
  if (payload.comment.user.login === "github-actions") return;

  const comment = payload.comment.body.trim();

  // Only trigger on comments starting with @ai
  if (!comment.toLowerCase().startsWith(AI_TRIGGER)) {
    return;
  }

  const repo = payload.repository.name;
  const aiPrompt = comment.slice(AI_TRIGGER.length).trim();
  const prTitle = payload.issue.title;
  const prNumber = payload.issue.number;

  if (!aiPrompt) {
    console.log(`PR #${prNumber}: @ai comment without instructions, skipping`);
    return;
  }

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

  const issueIdentifier = extractIssueIdentifier(branchName);

  console.log(`PR #${prNumber} @ai on branch "${branchName}": "${aiPrompt.substring(0, 100)}..."`);

  // Move Linear issue to AI status while processing
  if (issueIdentifier) {
    const statusAI = process.env.LINEAR_STATUS_AI || "AI";
    const { moveIssueToStatus } = await import("../services/linear");
    await moveIssueToStatus(issueIdentifier, statusAI);
    console.log(`Issue ${issueIdentifier} moved to AI`);
  }

  try {
    await aiHandlePRComment(repo, branchName, aiPrompt, prTitle);

    // Success: move back to Review
    if (issueIdentifier) {
      await moveIssueToReview(issueIdentifier);
      console.log(`Issue ${issueIdentifier} moved back to Review`);
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`AI failed handling PR comment on #${prNumber}: ${errorMsg}`);

    // Move issue to failed state
    if (issueIdentifier) {
      await addCommentToIssue(
        issueIdentifier,
        `🤖 AI kon de PR feedback niet verwerken:\n\n\`${errorMsg}\`\n\nProbeer het opnieuw of pas de code handmatig aan.`
      );
      await moveIssueToAIFailed(issueIdentifier);
    }

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
