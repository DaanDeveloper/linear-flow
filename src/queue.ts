import fs from "fs";
import path from "path";

export interface Job {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  status: "pending" | "running" | "completed" | "failed";
  retries: number;
  createdAt: string;
  updatedAt: string;
  error?: string;
}

interface QueueData {
  jobs: Job[];
}

const QUEUE_DIR = path.join(process.cwd(), "data");
const QUEUE_FILE = path.join(QUEUE_DIR, "queue.json");
const MAX_RETRIES = 1;
const WORKER_INTERVAL_MS = 5000;
const CLEANUP_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

type JobHandler = (payload: Record<string, unknown>) => Promise<void>;
const handlers = new Map<string, JobHandler>();

let workerTimer: ReturnType<typeof setInterval> | null = null;

function readQueue(): QueueData {
  try {
    if (fs.existsSync(QUEUE_FILE)) {
      return JSON.parse(fs.readFileSync(QUEUE_FILE, "utf-8"));
    }
  } catch (err) {
    console.error("Failed to read queue file, starting fresh:", err);
  }
  return { jobs: [] };
}

function writeQueue(data: QueueData): void {
  if (!fs.existsSync(QUEUE_DIR)) {
    fs.mkdirSync(QUEUE_DIR, { recursive: true });
  }
  fs.writeFileSync(QUEUE_FILE, JSON.stringify(data, null, 2));
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function registerHandler(type: string, fn: JobHandler): void {
  handlers.set(type, fn);
}

export function enqueue(type: string, payload: Record<string, unknown>, dedupeKey?: string): Job | null {
  const data = readQueue();

  // Duplicate prevention: skip if same dedupeKey already pending/running
  if (dedupeKey) {
    const existing = data.jobs.find(
      (j) => j.payload._dedupeKey === dedupeKey && (j.status === "pending" || j.status === "running")
    );
    if (existing) {
      console.log(`Queue: skipping duplicate job (dedupeKey=${dedupeKey})`);
      return null;
    }
  }

  const job: Job = {
    id: generateId(),
    type,
    payload: { ...payload, ...(dedupeKey ? { _dedupeKey: dedupeKey } : {}) },
    status: "pending",
    retries: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  data.jobs.push(job);
  writeQueue(data);
  console.log(`Queue: enqueued job ${job.id} (type=${type})`);
  return job;
}

export function isProcessing(issueIdentifier: string): boolean {
  const data = readQueue();
  return data.jobs.some(
    (j) =>
      j.payload.issueIdentifier === issueIdentifier &&
      (j.status === "pending" || j.status === "running")
  );
}

async function processNextJob(): Promise<void> {
  const data = readQueue();

  // Recover crashed jobs (running but no active process)
  for (const job of data.jobs) {
    if (job.status === "running") {
      const runningFor = Date.now() - new Date(job.updatedAt).getTime();
      // If running for more than 15 minutes, consider it crashed
      if (runningFor > 15 * 60 * 1000) {
        if (job.retries < MAX_RETRIES) {
          job.status = "pending";
          job.retries++;
          job.updatedAt = new Date().toISOString();
          console.log(`Queue: recovered crashed job ${job.id}, retry ${job.retries}`);
        } else {
          job.status = "failed";
          job.error = "Job timed out after max retries";
          job.updatedAt = new Date().toISOString();
          console.log(`Queue: job ${job.id} failed after timeout`);
        }
      }
    }
  }

  // Cleanup old completed/failed jobs
  const cutoff = Date.now() - CLEANUP_AGE_MS;
  data.jobs = data.jobs.filter((j) => {
    if ((j.status === "completed" || j.status === "failed") && new Date(j.updatedAt).getTime() < cutoff) {
      return false;
    }
    return true;
  });

  // Find next pending job
  const nextJob = data.jobs.find((j) => j.status === "pending");
  if (!nextJob) {
    writeQueue(data);
    return;
  }

  const handler = handlers.get(nextJob.type);
  if (!handler) {
    nextJob.status = "failed";
    nextJob.error = `No handler registered for type: ${nextJob.type}`;
    nextJob.updatedAt = new Date().toISOString();
    writeQueue(data);
    console.error(`Queue: no handler for job type "${nextJob.type}"`);
    return;
  }

  // Mark as running
  nextJob.status = "running";
  nextJob.updatedAt = new Date().toISOString();
  writeQueue(data);

  console.log(`Queue: processing job ${nextJob.id} (type=${nextJob.type})`);

  try {
    await handler(nextJob.payload);
    // Re-read in case queue changed during processing
    const freshData = readQueue();
    const freshJob = freshData.jobs.find((j) => j.id === nextJob.id);
    if (freshJob) {
      freshJob.status = "completed";
      freshJob.updatedAt = new Date().toISOString();
      writeQueue(freshData);
    }
    console.log(`Queue: job ${nextJob.id} completed`);
  } catch (error) {
    const freshData = readQueue();
    const freshJob = freshData.jobs.find((j) => j.id === nextJob.id);
    if (freshJob) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (freshJob.retries < MAX_RETRIES) {
        freshJob.status = "pending";
        freshJob.retries++;
        freshJob.error = errorMsg;
        freshJob.updatedAt = new Date().toISOString();
        console.log(`Queue: job ${nextJob.id} failed, retrying (${freshJob.retries}/${MAX_RETRIES}): ${errorMsg}`);
      } else {
        freshJob.status = "failed";
        freshJob.error = errorMsg;
        freshJob.updatedAt = new Date().toISOString();
        console.error(`Queue: job ${nextJob.id} failed permanently: ${errorMsg}`);
      }
      writeQueue(freshData);
    }
  }
}

export function startWorker(): void {
  if (workerTimer) return;
  console.log("Queue: worker started");
  workerTimer = setInterval(async () => {
    try {
      await processNextJob();
    } catch (error) {
      console.error("Queue: worker error:", error);
    }
  }, WORKER_INTERVAL_MS);
}

export function getQueueStats(): { pending: number; running: number; completed: number; failed: number; total: number } {
  const data = readQueue();
  return {
    pending: data.jobs.filter((j) => j.status === "pending").length,
    running: data.jobs.filter((j) => j.status === "running").length,
    completed: data.jobs.filter((j) => j.status === "completed").length,
    failed: data.jobs.filter((j) => j.status === "failed").length,
    total: data.jobs.length,
  };
}
