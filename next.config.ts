import type { NextConfig } from "next";
import path from "node:path";
import { execSync } from "node:child_process";

// Short commit hash shown in the footer. Inlined into the bundles at build
// time. Docker builds have no .git (see .dockerignore), so the deploy passes
// it via the GIT_SHA build arg; local dev asks git directly.
function resolveGitSha(): string {
  if (process.env.GIT_SHA) return process.env.GIT_SHA;
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return "unknown";
  }
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
