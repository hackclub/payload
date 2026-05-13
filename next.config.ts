import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
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
