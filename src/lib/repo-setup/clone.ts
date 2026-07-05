import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { env } from "@/env";

const CLONE_TIMEOUT_MS = 120_000;

export class RepoCloneError extends Error {}

/**
 * Validate a repo URL for cloning. https only (no ssh/git/file schemes, which
 * could reach internal hosts or the local filesystem) and no embedded
 * credentials. Returns the normalized URL string.
 */
export function validateRepoUrl(input: string): string {
  const trimmed = input.trim();
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new RepoCloneError("Not a valid URL");
  }
  if (url.protocol !== "https:") {
    throw new RepoCloneError("Only https:// repository URLs are supported");
  }
  if (url.username || url.password) {
    throw new RepoCloneError("URLs with embedded credentials are not supported");
  }
  if (!url.hostname.includes(".")) {
    throw new RepoCloneError("Not a valid repository host");
  }
  // The URL is later embedded (single-quoted) in a generated shell runner on
  // the VM; quotes/whitespace/backslashes never appear in legitimate repo URLs.
  if (/['"\\\s]/.test(url.toString())) {
    throw new RepoCloneError("Repository URL contains unsupported characters");
  }
  return url.toString();
}

/**
 * Shallow-clone `url` into a fresh tmpdir and return its path. The caller MUST
 * remove the directory (see `cleanupClone`) when done. The URL goes to git as
 * an argv element — never through a shell.
 */
export async function cloneRepo(url: string): Promise<string> {
  const validated = validateRepoUrl(url);
  const dir = await mkdtemp(path.join(tmpdir(), "payload-repo-"));
  const target = path.join(dir, "repo");

  try {
    await runGit(
      [
        "clone",
        "--depth",
        "1",
        "--single-branch",
        "--no-tags",
        "--filter=blob:limit=512k",
        "--",
        validated,
        target,
      ],
      CLONE_TIMEOUT_MS,
    );
  } catch (error) {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
    throw error;
  }

  const sizeMb = await directorySizeMb(target);
  if (sizeMb > env.REPO_MAX_CLONE_MB) {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
    throw new RepoCloneError(
      `Repository is too large (${Math.round(sizeMb)} MB > ${env.REPO_MAX_CLONE_MB} MB limit)`,
    );
  }

  return target;
}

/** Remove a clone created by `cloneRepo` (pass the returned path). */
export async function cleanupClone(repoDir: string): Promise<void> {
  // cloneRepo returns <tmpdir>/repo; remove the whole tmpdir.
  await rm(path.dirname(repoDir), { recursive: true, force: true }).catch(() => {});
}

function runGit(args: string[], timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, {
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_ASKPASS: "true" },
      stdio: ["ignore", "ignore", "pipe"],
    });

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      if (stderr.length < 4_000) stderr += String(chunk);
    });

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new RepoCloneError("Cloning the repository timed out"));
    }, timeoutMs);

    child.on("error", (error) => {
      clearTimeout(timer);
      reject(new RepoCloneError(`git failed to start: ${error.message}`));
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) return resolve();
      reject(new RepoCloneError(`git clone failed: ${stderr.trim().slice(0, 500) || `exit ${code}`}`));
    });
  });
}

async function directorySizeMb(dir: string): Promise<number> {
  // `du` is universally available and far faster than a JS walk.
  return new Promise((resolve) => {
    const child = spawn("du", ["-sm", dir], { stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    child.stdout.on("data", (chunk) => (out += String(chunk)));
    child.on("close", () => resolve(Number(out.split("\t")[0]) || 0));
    child.on("error", () => resolve(0));
  });
}
