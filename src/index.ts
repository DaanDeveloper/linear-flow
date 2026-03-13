import "dotenv/config";
import express from "express";
import crypto from "crypto";
import { LinearWebhookPayload } from "./types/linear";
import { handleInProgress, handleAI } from "./handlers/issueCreated";
import { handleIssueBackToTodo } from "./handlers/issueBackToTodo";
import { handlePRMerged, handlePRClosed } from "./handlers/prMerged";
import { handlePRComment } from "./handlers/prComment";
import { enqueue, isProcessing, registerHandler, startWorker, getQueueStats } from "./queue";
import { debug } from "./utils/debug";

const app = express();
const port = process.env.PORT || 3000;

const statusInProgress = () => process.env.LINEAR_STATUS_IN_PROGRESS || "In Progress";
const statusAI = () => process.env.LINEAR_STATUS_AI || "AI";
const statusTodo = () => process.env.LINEAR_STATUS_TODO || "Todo";

// Register queue handlers
registerHandler("ai-fix", async (payload) => {
  const { handleAI: aiHandler } = await import("./handlers/issueCreated");
  await aiHandler(payload.issueData as any);
});

registerHandler("pr-comment", async (payload) => {
  const { handlePRComment: prHandler } = await import("./handlers/prComment");
  await prHandler(payload.commentPayload as any);
});

app.use((req: any, _res, next) => {
  let data = Buffer.alloc(0);
  req.on("data", (chunk: Buffer) => { data = Buffer.concat([data, chunk]); });
  req.on("end", () => {
    req.rawBody = data.toString("utf-8");
    try {
      // GitHub may send as form-encoded: payload={json}
      if (req.rawBody.startsWith("payload=")) {
        const decoded = decodeURIComponent(req.rawBody.slice("payload=".length).replace(/\+/g, " "));
        req.body = JSON.parse(decoded);
      } else {
        req.body = JSON.parse(req.rawBody);
      }
    } catch {
      req.body = {};
    }
    next();
  });
});

function verifyLinearSignature(body: string, signature: string): boolean {
  const hmac = crypto.createHmac("sha256", process.env.LINEAR_WEBHOOK_SECRET!);
  const digest = hmac.update(body).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
}

function verifyGitHubSignature(body: string, signature: string): boolean {
  const hmac = crypto.createHmac("sha256", process.env.GITHUB_WEBHOOK_SECRET!);
  const digest = "sha256=" + hmac.update(body).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
}

app.post("/", async (req, res) => {
  const rawBody: string = (req as any).rawBody || JSON.stringify(req.body);
  const linearSignature = req.headers["linear-signature"] as string;
  const githubSignature = req.headers["x-hub-signature-256"] as string;
  const githubEvent = req.headers["x-github-event"] as string;

  // --- GitHub webhook ---
  if (githubSignature && githubEvent) {
    debug(`GitHub webhook: event=${githubEvent} action=${req.body?.action} bodyType=${typeof req.body} bodyKeys=${Object.keys(req.body || {}).slice(0, 5)} hasRawBody=${!!(req as any).rawBody} rawBodyLen=${rawBody?.length}`);

    if (!verifyGitHubSignature(rawBody, githubSignature)) {
      const hmac = crypto.createHmac("sha256", process.env.GITHUB_WEBHOOK_SECRET!);
      const expected = "sha256=" + hmac.update(rawBody).digest("hex");
      debug(`GitHub signature MISMATCH: received=${githubSignature} expected=${expected}`);
      res.status(401).json({ error: "Invalid GitHub signature" });
      return;
    }
    debug(`GitHub signature OK`);

    const payload = typeof req.body === "string" ? JSON.parse(req.body) : req.body;

    // PR merged or closed
    if (githubEvent === "pull_request" && payload.action === "closed" && payload.pull_request) {
      const branch = payload.pull_request.head.ref;

      if (payload.pull_request.merged) {
        console.log(`GitHub: PR merged for branch "${branch}"`);
        res.status(200).json({ success: true });
        try {
          await handlePRMerged(branch);
        } catch (error) {
          console.error("Error handling PR merged:", error);
        }
      } else {
        console.log(`GitHub: PR closed (not merged) for branch "${branch}"`);
        res.status(200).json({ success: true });
        try {
          await handlePRClosed(branch);
        } catch (error) {
          console.error("Error handling PR closed:", error);
        }
      }
      return;
    }

    // PR comment → enqueue
    if (githubEvent === "issue_comment" && payload.action === "created") {
      debug(`GitHub: comment on #${payload.issue?.number} by ${payload.comment?.user?.login}`);
      res.status(200).json({ success: true });

      const prTitle = payload.issue?.title || "";
      const idMatch = prTitle.match(/^([A-Z]+-\d+)/);
      const issueIdentifier = idMatch ? idMatch[1] : undefined;

      const dedupeKey = `pr-comment-${payload.repository?.name}-${payload.issue?.number}-${payload.comment?.id}`;
      enqueue("pr-comment", { commentPayload: payload, issueIdentifier }, dedupeKey);
      return;
    }

    res.status(200).json({ ignored: true });
    return;
  }

  // --- Linear webhook ---
  if (!linearSignature) {
    res.status(401).json({ error: "Missing signature" });
    return;
  }

  if (!verifyLinearSignature(rawBody, linearSignature)) {
    res.status(401).json({ error: "Invalid signature" });
    return;
  }

  const payload: LinearWebhookPayload = typeof req.body === "string" ? JSON.parse(req.body) : req.body;

  debug(`Linear: action=${payload.action} type=${payload.type} state=${payload.data?.state?.name}`);

  if (payload.type === "Issue") {
    const stateName = payload.data.state?.name;

    // In Progress → branch + PR (handmatig)
    if (stateName === statusInProgress() && (payload.action === "create" || payload.action === "update")) {
      res.status(200).json({ success: true });
      try {
        await handleInProgress(payload.data);
      } catch (error) {
        console.error("Error handling In Progress:", error);
      }
      return;
    }

    // AI → enqueue (branch + Claude fixt + PR)
    if (stateName === statusAI() && (payload.action === "create" || payload.action === "update")) {
      res.status(200).json({ success: true });

      const issueIdentifier = payload.data.identifier;

      // Loop prevention: skip if already processing (ai-fix or pr-comment)
      if (isProcessing(issueIdentifier)) {
        debug(`Issue ${issueIdentifier} is already being processed, skipping`);
        return;
      }

      const dedupeKey = `ai-fix-${issueIdentifier}`;
      enqueue("ai-fix", { issueData: payload.data, issueIdentifier }, dedupeKey);
      return;
    }

    // Back to Todo → delete branch + close PR
    if (stateName === statusTodo() && payload.action === "update") {
      res.status(200).json({ success: true });
      try {
        await handleIssueBackToTodo(payload.data);
      } catch (error) {
        console.error("Error handling back to Todo:", error);
      }
      return;
    }
  }

  res.status(200).json({ ignored: true });
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", queue: getQueueStats() });
});

// Start queue worker
startWorker();

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
