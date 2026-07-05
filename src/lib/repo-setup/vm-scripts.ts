// Shell scripts written to the Linux VM by the run-setup job. Three pieces:
//  - payload-setup.sh  = PRELUDE (progress-bar helpers) + the AI-generated script
//  - run-setup.sh      = runner executed INSIDE the visible terminal: clones the
//                        repo, runs the setup, records the exit code, holds the
//                        window open
//  - launch script     = tiny spool run-script payload that opens the HTML
//                        guide in the default browser and the runner in a
//                        comfortably-sized (not maximized) xfce4-terminal
//
// Everything is transferred as files (never shell-interpolated); the only
// dynamic value embedded is the repo URL, which validateRepoUrl restricts to
// https URLs without quotes/whitespace/backslashes.

const LINUX_HOME = "/home/shipwrights";

export const GUIDE_PATH = `${LINUX_HOME}/REVIEW_GUIDE.html`;
export const SETUP_SCRIPT_PATH = `${LINUX_HOME}/payload-setup.sh`;
export const RUNNER_PATH = `${LINUX_HOME}/.payload/run-setup.sh`;
export const EXIT_CODE_PATH = `${LINUX_HOME}/.payload/setup-exit-code`;
export const LOG_PATH = `${LINUX_HOME}/payload-setup.log`;
export const PROJECT_DIR = `${LINUX_HOME}/project`;

// The progress helpers the AI script is instructed to call. Prepended to the
// generated script, so `payload_steps_total` / `payload_step` always exist.
const PRELUDE = `#!/usr/bin/env bash
# ─── Payload progress helpers (injected by the platform) ────────────────────
PAYLOAD_TOTAL_STEPS=0
PAYLOAD_CURRENT_STEP=0
payload_steps_total() { PAYLOAD_TOTAL_STEPS=$1; }
payload_step() {
  PAYLOAD_CURRENT_STEP=$((PAYLOAD_CURRENT_STEP + 1))
  local total=$PAYLOAD_TOTAL_STEPS
  if [ "$total" -lt "$PAYLOAD_CURRENT_STEP" ]; then total=$PAYLOAD_CURRENT_STEP; fi
  local width=30
  local filled=$((width * PAYLOAD_CURRENT_STEP / total))
  local bar="" i
  for ((i = 0; i < filled; i++)); do bar+="█"; done
  for ((i = filled; i < width; i++)); do bar+="░"; done
  printf '\\n\\033[1;35m[%s]\\033[0m \\033[1m%d/%d\\033[0m  %s\\n\\n' "$bar" "$PAYLOAD_CURRENT_STEP" "$total" "$1"
}
export -f payload_steps_total payload_step
# ─── end helpers — AI-generated setup script follows ─────────────────────────

`;

export function buildSetupScript(aiScript: string): string {
  return PRELUDE + aiScript + "\n";
}

/**
 * The runner executed inside the visible terminal window. Clones the repo
 * (visibly — network fetch is the one thing the server can't pre-stage),
 * streams the setup through tee, writes the exit-code sentinel the run-setup
 * job polls, and keeps the window open so the reviewer can read the output.
 */
export function buildRunnerScript(repoUrl: string): string {
  return `#!/usr/bin/env bash
REPO_URL='${repoUrl}'

printf '\\033[1;35m╔══════════════════════════════════════════════╗\\n'
printf '║        Payload — AI project setup            ║\\n'
printf '╚══════════════════════════════════════════════╝\\033[0m\\n'
printf 'Repository: %s\\n\\n' "$REPO_URL"

run_all() {
  set -e
  if ! command -v git >/dev/null 2>&1; then
    echo "Installing git…"
    sudo apt-get update -qq && sudo apt-get install -y -qq git
  fi
  if [ ! -e '${PROJECT_DIR}' ]; then
    echo "Cloning repository to ~/project…"
    git clone --depth 1 -- "$REPO_URL" '${PROJECT_DIR}'
    echo
  fi
  bash '${SETUP_SCRIPT_PATH}'
}

rm -f '${EXIT_CODE_PATH}'
run_all 2>&1 | tee '${LOG_PATH}'
code=\${PIPESTATUS[0]}
echo "$code" > '${EXIT_CODE_PATH}'

echo
if [ "$code" -eq 0 ]; then
  printf '\\033[1;32m✔ Setup complete.\\033[0m The reviewer guide is open in the browser.\\n'
else
  printf '\\033[1;31m✘ Setup failed (exit %s).\\033[0m Full log: ${LOG_PATH}\\n' "$code"
  printf 'The VM is still usable — you can finish the setup manually.\\n'
fi
echo
read -rp 'Press Enter to close this window… '
`;
}

/**
 * Spool run-script payload: runs in the desktop session via the companion
 * agent. Opens the guide and the runner terminal, both detached, and returns
 * immediately so the companion can report the task done.
 */
export function buildLaunchScript(): string {
  return `#!/usr/bin/env bash
(xdg-open '${GUIDE_PATH}' >/dev/null 2>&1 &)
(xfce4-terminal --geometry=110x30 --title 'Project Setup — Payload' -x bash '${RUNNER_PATH}' >/dev/null 2>&1 &)
exit 0
`;
}
