import type { NextConfig } from "next";
import path from "node:path";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

// Short commit hash shown in the footer. Inlined into the bundles at build
// time. Docker builds have no .git (see .dockerignore), so the deploy passes
// it via the GIT_SHA build arg; local dev asks the repo directly. Pinned to
// this file's directory — the dev server's cwd is not guaranteed to be the
// project root (pnpm workspace parent, IDE-spawned processes).
function resolveGitSha(): string {
  if (process.env.GIT_SHA) return process.env.GIT_SHA;
  try {
    return execSync("git rev-parse --short HEAD", { cwd: __dirname, stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    // No git binary (or it refused): read .git ourselves.
  }
  try {
    const gitDir = path.join(__dirname, ".git");
    const head = readFileSync(path.join(gitDir, "HEAD"), "utf8").trim();
    if (!head.startsWith("ref: ")) return head.slice(0, 7); // detached HEAD
    const ref = head.slice(5);
    try {
      return readFileSync(path.join(gitDir, ref), "utf8").trim().slice(0, 7);
    } catch {
      // Ref not loose — look it up in packed-refs.
      const packed = readFileSync(path.join(gitDir, "packed-refs"), "utf8");
      const line = packed.split("\n").find((l) => l.endsWith(` ${ref}`));
      if (line) return line.slice(0, 7);
    }
  } catch {
    // Not a git checkout at all (and no GIT_SHA passed in).
  }
  console.warn("[next.config] could not resolve a git commit sha; footer will show 'unknown'");
  return "unknown";
}

const nextConfig: NextConfig = {
  env: {
    GIT_COMMIT_SHA: resolveGitSha(),
  },
  // Emit a self-contained server bundle for the Docker image.
  // See: node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/output.md
  output: "standalone",
  // Pin tracing root to the project, otherwise the presence of
  // `pnpm-workspace.yaml` in a parent directory causes Next to emit the
  // standalone bundle under `.next/standalone/<relative-parent-path>/`
  // which breaks the Dockerfile's `COPY .next/standalone ./` assumption.
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
