import { Octokit } from "@octokit/rest";

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN! });
const owner = process.env.GITHUB_OWNER!;
const sourceBranch = () => process.env.SOURCE_BRANCH || "dev";
const targetBranch = () => process.env.TARGET_BRANCH || "main";

export async function branchExists(repo: string, branchName: string): Promise<boolean> {
  try {
    await octokit.rest.git.getRef({ owner, repo, ref: `heads/${branchName}` });
    return true;
  } catch {
    return false;
  }
}

export async function createBranch(
  repo: string,
  branchName: string
): Promise<string> {
  const { data: ref } = await octokit.rest.git.getRef({
    owner,
    repo,
    ref: `heads/${sourceBranch()}`,
  });

  await octokit.rest.git.createRef({
    owner,
    repo,
    ref: `refs/heads/${branchName}`,
    sha: ref.object.sha,
  });

  return ref.object.sha;
}

export async function deleteBranch(repo: string, branchName: string): Promise<void> {
  await octokit.rest.git.deleteRef({
    owner,
    repo,
    ref: `heads/${branchName}`,
  });
}


export async function createEmptyCommit(
  repo: string,
  branchName: string,
  baseSha: string,
  message: string
): Promise<void> {
  const { data: commit } = await octokit.rest.git.getCommit({
    owner,
    repo,
    commit_sha: baseSha,
  });

  const { data: newCommit } = await octokit.rest.git.createCommit({
    owner,
    repo,
    message,
    tree: commit.tree.sha,
    parents: [baseSha],
  });

  await octokit.rest.git.updateRef({
    owner,
    repo,
    ref: `heads/${branchName}`,
    sha: newCommit.sha,
  });
}

export async function createPR(
  repo: string,
  branchName: string,
  title: string,
  body: string
): Promise<string> {
  const { data: pr } = await octokit.rest.pulls.create({
    owner,
    repo,
    title,
    body,
    head: branchName,
    base: targetBranch(),
  });

  return pr.html_url;
}

export async function closePR(repo: string, branchName: string): Promise<void> {
  const { data: prs } = await octokit.rest.pulls.list({
    owner,
    repo,
    head: `${owner}:${branchName}`,
    state: "open",
  });

  for (const pr of prs) {
    await octokit.rest.pulls.update({
      owner,
      repo,
      pull_number: pr.number,
      state: "closed",
    });
    console.log(`PR #${pr.number} closed`);
  }
}
