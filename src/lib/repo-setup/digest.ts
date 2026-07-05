import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

// Build a bounded plain-text digest of a cloned repo for the LLM: file tree +
// README + manifests + entrypoint excerpts. The agent has read tools for
// anything the digest misses, so this favors breadth over completeness.

const DIGEST_BUDGET_BYTES = 100_000;
const TREE_MAX_DEPTH = 4;
const TREE_MAX_ENTRIES = 400;
const FILE_EXCERPT_BYTES = 6_000;

const SKIP_DIRS = new Set([
  ".git", "node_modules", "vendor", "dist", "build", "out", "target",
  ".next", ".nuxt", "__pycache__", ".venv", "venv", ".idea", ".vscode",
  "coverage", ".cache",
]);

// Files worth including in full (up to the per-file excerpt cap) because they
// define how the project is built and run.
const MANIFEST_NAMES = new Set([
  "package.json", "requirements.txt", "pyproject.toml", "setup.py", "Pipfile",
  "Cargo.toml", "go.mod", "Gemfile", "composer.json", "pom.xml",
  "build.gradle", "build.gradle.kts", "CMakeLists.txt", "Makefile",
  "docker-compose.yml", "docker-compose.yaml", "Dockerfile", "Procfile",
  ".nvmrc", ".python-version", ".tool-versions", ".ruby-version",
  "deno.json", "bun.lockb", "flake.nix", "shell.nix",
]);

// Lockfiles: name-only in the tree is enough (they're huge), but their
// presence tells the model which package manager to use — call them out.
const LOCKFILE_NAMES = new Set([
  "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "poetry.lock",
  "Cargo.lock", "go.sum", "Gemfile.lock", "composer.lock", "uv.lock",
]);

export async function buildRepoDigest(repoDir: string): Promise<string> {
  const sections: string[] = [];
  let budget = DIGEST_BUDGET_BYTES;

  const { tree, manifests, readmes, lockfiles } = await walk(repoDir);

  const treeText = `## File tree (depth ≤ ${TREE_MAX_DEPTH})\n${tree.join("\n")}`;
  sections.push(treeText);
  budget -= treeText.length;

  if (lockfiles.length > 0) {
    const text = `## Lockfiles present\n${lockfiles.join("\n")}`;
    sections.push(text);
    budget -= text.length;
  }

  for (const file of [...readmes, ...manifests]) {
    if (budget <= 0) break;
    const excerpt = await readExcerpt(path.join(repoDir, file), Math.min(FILE_EXCERPT_BYTES, budget));
    if (!excerpt) continue;
    const text = `## ${file}\n\`\`\`\n${excerpt}\n\`\`\``;
    sections.push(text);
    budget -= text.length;
  }

  return sections.join("\n\n");
}

async function walk(repoDir: string): Promise<{
  tree: string[];
  manifests: string[];
  readmes: string[];
  lockfiles: string[];
}> {
  const tree: string[] = [];
  const manifests: string[] = [];
  const readmes: string[] = [];
  const lockfiles: string[] = [];

  async function visit(rel: string, depth: number): Promise<void> {
    if (depth > TREE_MAX_DEPTH || tree.length >= TREE_MAX_ENTRIES) return;
    const entries = await readdir(path.join(repoDir, rel), { withFileTypes: true }).catch(() => []);
    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      if (tree.length >= TREE_MAX_ENTRIES) {
        tree.push("… (tree truncated)");
        return;
      }
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        tree.push(`${relPath}/`);
        await visit(relPath, depth + 1);
      } else {
        tree.push(relPath);
        if (LOCKFILE_NAMES.has(entry.name)) lockfiles.push(relPath);
        else if (MANIFEST_NAMES.has(entry.name)) manifests.push(relPath);
        else if (/^readme(\..*)?$/i.test(entry.name) && depth <= 1) readmes.push(relPath);
      }
    }
  }

  await visit("", 0);
  return { tree, manifests, readmes, lockfiles };
}

async function readExcerpt(filePath: string, maxBytes: number): Promise<string | null> {
  try {
    const info = await stat(filePath);
    if (!info.isFile() || info.size === 0) return null;
    const buf = await readFile(filePath);
    if (buf.includes(0)) return null; // binary
    const text = buf.toString("utf8");
    return text.length > maxBytes ? `${text.slice(0, maxBytes)}\n… (truncated)` : text;
  } catch {
    return null;
  }
}
