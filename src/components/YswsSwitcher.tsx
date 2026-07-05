import { getAccessContext } from "@/lib/access";
import YswsSwitcherClient from "./YswsSwitcherClient";

// Server wrapper: resolves the caller's workspaces + active one, hands them to
// the client dropdown. Renders nothing when the user has no workspace (the page
// itself shows the access-denied state in that case). See ADR-0036.
export default async function YswsSwitcher() {
  const ctx = await getAccessContext();
  if (!ctx || ctx.workspaces.length === 0) return null;

  return (
    <YswsSwitcherClient
      workspaces={ctx.workspaces}
      activeId={ctx.activeYsws?.id ?? null}
      isSuperadmin={ctx.isSuperadmin}
    />
  );
}
