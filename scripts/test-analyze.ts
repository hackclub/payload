// Standalone driver for the AI repo analysis — no DB, no Redis, no VMs.
// Usage: pnpm tsx scripts/test-analyze.ts <repo-url> [out-dir]
import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

async function main() {
  const [repoUrl, outDir = "/tmp/payload-analyze"] = process.argv.slice(2);
  if (!repoUrl) {
    console.error("Usage: pnpm tsx scripts/test-analyze.ts <repo-url> [out-dir]");
    process.exit(1);
  }

  // Import after dotenv so src/env.ts sees the vars.
  const { cloneRepo, cleanupClone } = await import("../src/lib/repo-setup/clone");
  const { buildRepoDigest } = await import("../src/lib/repo-setup/digest");
  const { analyzeRepo } = await import("../src/lib/repo-setup/agent");

  console.log(`Cloning ${repoUrl} …`);
  const started = Date.now();
  const repoDir = await cloneRepo(repoUrl);
  try {
    console.log(`Cloned to ${repoDir} in ${Date.now() - started}ms`);

    const digest = await buildRepoDigest(repoDir);
    console.log(`Digest: ${digest.length} chars`);

    const aiStarted = Date.now();
    const analysis = await analyzeRepo({
      repoUrl,
      repoDir,
      digest,
      log: (m) => console.log(`  [agent] ${m}`),
    });
    console.log(`Analysis took ${Math.round((Date.now() - aiStarted) / 1000)}s`);

    await mkdir(outDir, { recursive: true });
    const scriptPath = path.join(outDir, "setup.sh");
    const guidePath = path.join(outDir, "REVIEW_GUIDE.html");
    const digestPath = path.join(outDir, "digest.txt");
    await writeFile(scriptPath, analysis.setupScript);
    await writeFile(guidePath, analysis.reviewerGuide);
    await writeFile(digestPath, digest);
    console.log(`\nWrote:\n  ${scriptPath}\n  ${guidePath}\n  ${digestPath}`);
  } finally {
    await cleanupClone(repoDir);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
