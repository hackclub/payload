import "dotenv/config";
import { randomBytes } from "node:crypto";
import { db } from "../src/db";
import { vmTypes, vmSessions } from "../src/db/schema";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { createProxmoxClient, getProxmoxConfig } from "../src/lib/proxmox/config";
import { discoverIpFromProxmoxNeighborTable } from "../src/lib/proxmox/ip-discovery";
import { vmTypeSeeds } from "../src/config/vm-types";
import {
  createGuacamoleClient,
  getGuacamoleConfig,
} from "../src/lib/guacamole/config";
import type { GuacamoleProtocol } from "../src/lib/guacamole/client";
import type { ProxmoxClient } from "../src/lib/proxmox/client";

const command = process.argv[2];

async function main() {
  if (command === "proxmox:test-clone") {
    await testClone();
    return;
  }

  if (command === "seed:vm-types") {
    await seedVmTypes();
    return;
  }

  if (command === "guac:test-connection") {
    await testGuacamoleConnection();
    return;
  }

  if (command === "pool:destroy") {
    await poolDestroy();
    return;
  }

  console.error(
    "Usage: pnpm payload <proxmox:test-clone|seed:vm-types|guac:test-connection|pool:destroy [--zero]>",
  );
  process.exit(1);
}

/**
 * Stop and destroy every warm-pool VM: ownerless sessions in warm/warming
 * states (plus their Proxmox VMs and any Guacamole leftovers), and any
 * `payload-warm-*` Proxmox VM with no matching row. User-owned sessions are
 * never touched.
 *
 * Pass `--zero` to also set every `vm_types.warm_pool_size = 0`, so a running
 * reconciler won't immediately refill the pool.
 */
async function poolDestroy() {
  const zeroPool = process.argv.includes("--zero");
  const config = getProxmoxConfig();
  const proxmox = createProxmoxClient(config);
  const guac = createGuacamoleClient(getGuacamoleConfig());

  if (zeroPool) {
    // Disable first, so the reconciler can't boot new warm VMs mid-cleanup.
    await db.update(vmTypes).set({ warmPoolSize: 0, updatedAt: new Date() });
    console.log("Set warm_pool_size = 0 for all VM types.");
  }

  // 1. Ownerless pool sessions in the DB (warm = ready, pending/provisioning = still booting).
  const rows = await db
    .select()
    .from(vmSessions)
    .where(
      and(
        isNull(vmSessions.userId),
        inArray(vmSessions.state, ["warm", "pending", "provisioning"]),
      ),
    );
  console.log(`Found ${rows.length} warm/warming pool session(s) in the DB.`);

  const handledVmids = new Set<number>();
  for (const row of rows) {
    console.log(`→ Destroying pool session #${row.id} (state=${row.state}, vmid=${row.proxmoxVmid ?? "none"})`);
    if (row.guacamoleConnectionId) {
      try { await guac.deleteConnection(row.guacamoleConnectionId); } catch { /* idempotent */ }
    }
    if (row.guacamoleUsername) {
      try { await guac.deleteUser(row.guacamoleUsername); } catch { /* idempotent */ }
    }
    if (row.proxmoxVmid && row.proxmoxNode) {
      await destroyVm(proxmox, row.proxmoxNode, row.proxmoxVmid);
      handledVmids.add(row.proxmoxVmid);
    }
    await db
      .update(vmSessions)
      .set({ state: "terminated", terminatedAt: new Date(), terminationReason: "admin", updatedAt: new Date() })
      .where(eq(vmSessions.id, row.id));
  }

  // 2. Proxmox orphans named payload-warm-* with no live row we just handled.
  let orphanCount = 0;
  try {
    const vms = await proxmox.listVms(config.defaultNode);
    const orphans = vms.filter(
      (v) =>
        typeof v.name === "string" &&
        v.name.startsWith("payload-warm-") &&
        v.template !== 1 &&
        !handledVmids.has(v.vmid),
    );
    for (const vm of orphans) {
      console.log(`→ Destroying orphan warm VM ${vm.vmid} (${vm.name})`);
      await destroyVm(proxmox, config.defaultNode, vm.vmid);
      orphanCount += 1;
    }
  } catch (error) {
    console.warn("Could not list Proxmox VMs for orphan sweep:", error instanceof Error ? error.message : error);
  }

  console.log(`\nDone: destroyed ${rows.length} pool session(s) + ${orphanCount} orphan warm VM(s).`);
  if (!zeroPool) {
    console.log("Note: if the app is running, the reconciler will refill the pool within ~15s.");
    console.log("Re-run with `--zero` to also set warm_pool_size=0 and keep it empty.");
  }
}

async function destroyVm(proxmox: ProxmoxClient, node: string, vmid: number) {
  try {
    const stopUpid = await proxmox.stopVm(node, vmid);
    await proxmox.waitForTask({ node, upid: stopUpid });
  } catch {
    // may already be stopped
  }
  try {
    const deleteUpid = await proxmox.deleteVm(node, vmid);
    await proxmox.waitForTask({ node, upid: deleteUpid });
    console.log(`  deleted VM ${vmid}`);
  } catch (error) {
    console.warn(`  failed to delete VM ${vmid}:`, error instanceof Error ? error.message : error);
  }
}

async function testClone() {
  const config = getProxmoxConfig();
  const client = createProxmoxClient(config);
  const templateVmid = Number(process.env.PROXMOX_LINUX_TEMPLATE_VMID);

  if (!Number.isFinite(templateVmid)) {
    throw new Error("Set PROXMOX_LINUX_TEMPLATE_VMID to the Debian KDE template VMID");
  }

  const node = process.env.PROXMOX_TEST_NODE ?? config.defaultNode;
  const vmid = Number(process.env.PROXMOX_TEST_VMID) || (await client.getNextVmid());
  const name = process.env.PROXMOX_TEST_NAME ?? `payload-test-${Date.now()}`;
  let started = false;

  console.log(`Cloning template ${templateVmid} to VM ${vmid} on ${node}...`);
  const cloneUpid = await client.cloneVm({
    node,
    templateVmid,
    newVmid: vmid,
    name,
    full: process.env.PROXMOX_TEST_FULL_CLONE === "true",
  });
  await client.waitForTask({ node, upid: cloneUpid });

  try {
    const macAddress = await client.getPrimaryMacAddress(node, vmid);
    console.log(`Starting VM ${vmid} (${macAddress})...`);
    const startUpid = await client.startVm(node, vmid);
    await client.waitForTask({ node, upid: startUpid });
    started = true;

    console.log("Polling Proxmox host neighbor table for the VM IP...");
    const ip = await discoverIpFromProxmoxNeighborTable({
      macAddress,
      config,
      timeoutMs: Number(process.env.PROXMOX_IP_TIMEOUT_MS) || 120_000,
    });
    console.log(`VM ${vmid} is reachable at ${ip}:3389 for Guacamole RDP.`);
    return;
  } finally {
    if (false) {
      console.log(`Stopping VM ${vmid}...`);
      const stopUpid = await client.stopVm(node, vmid);
      await client.waitForTask({ node, upid: stopUpid });
    }

    // console.log(`Deleting VM ${vmid}...`);
    // const deleteUpid = await client.deleteVm(node, vmid);
    // await client.waitForTask({ node, upid: deleteUpid });
  }
}

async function seedVmTypes() {
  for (const vmType of vmTypeSeeds) {
    await db
      .insert(vmTypes)
      .values(vmType)
      .onConflictDoUpdate({
        target: vmTypes.slug,
        set: {
          displayName: vmType.displayName,
          proxmoxTemplateVmid: vmType.proxmoxTemplateVmid,
          proxmoxNode: vmType.proxmoxNode,
          protocol: vmType.protocol,
          defaultPort: vmType.defaultPort,
          enabled: vmType.enabled,
          description: vmType.description,
          username: vmType.username,
          password: vmType.password,
          iconUrl: vmType.iconUrl,
          bootDelayMs: vmType.bootDelayMs,
        },
      });
  }

  console.log(`Seeded ${vmTypeSeeds.length} VM type(s).`);
}

async function testGuacamoleConnection() {
  const config = getGuacamoleConfig();
  const client = createGuacamoleClient(config);

  const vmIp = process.env.GUAC_TEST_VM_IP;
  if (!vmIp) {
    throw new Error(
      "Set GUAC_TEST_VM_IP to the IPv4 address of a running test VM " +
        "(use the IP printed by `pnpm payload proxmox:test-clone`).",
    );
  }

  const protocol = (process.env.GUAC_TEST_PROTOCOL ?? "rdp").toLowerCase() as GuacamoleProtocol;
  if (protocol !== "vnc" && protocol !== "rdp") {
    throw new Error(`GUAC_TEST_PROTOCOL must be "vnc" or "rdp" (got ${protocol})`);
  }

  const port = process.env.GUAC_TEST_PORT ?? (protocol === "rdp" ? "3389" : "5900");
  const vmUsername = process.env.GUAC_TEST_VM_USERNAME ?? "shipwrights";
  const vmPassword = process.env.GUAC_TEST_VM_PASSWORD ?? "shipwrights";

  const suffix = randomBytes(4).toString("hex");
  const guacUsername = `payload-test-${suffix}`;
  const guacPassword = randomBytes(18).toString("base64url");
  const connectionName = `payload-test-${suffix}`;

  console.log(`→ Verifying admin token at ${config.baseUrl}...`);
  await client.getAdminToken(true);
  console.log("  admin token OK");

  console.log(`→ Creating one-shot Guacamole user ${guacUsername}...`);
  await client.createUser({ username: guacUsername, password: guacPassword });

  let connectionId: string | null = null;
  try {
    console.log(`→ Creating ${protocol.toUpperCase()} connection ${connectionName} → ${vmIp}:${port}...`);
    const parameters: Record<string, string> =
        protocol === "rdp"
            ? {
                  hostname: vmIp,
                  port,
                  username: vmUsername,
                  password: vmPassword,
                  "ignore-cert": "true",
                  security: process.env.GUAC_TEST_RDP_SECURITY ?? "any",
                  "disable-auth": "false",
                  "resize-method": "display-update",
                  "color-depth": "24",
                  "enable-wallpaper": "true",
                  "enable-theming": "true",
                  "enable-font-smoothing": "true",
                  "enable-full-window-drag": "true",
                  "enable-desktop-composition": "true",
                  "enable-menu-animations": "true",
                  "disable-copy": "true",
                  "disable-paste": "false",
              }
            : {
                  hostname: vmIp,
                  username: vmUsername,
                  port,
                  password: vmPassword,
                  "color-depth": "24",
                  "disable-copy": "true",
                  "disable-paste": "false",
              };

    const created = await client.createConnection({
      name: connectionName,
      protocol,
      parameters,
    });
    connectionId = created.identifier;
    console.log(`  connection identifier = ${connectionId}`);

    console.log(`→ Granting ${guacUsername} READ on connection ${connectionId}...`);
    await client.grantConnectionPermission({
      username: guacUsername,
      connectionIdentifier: connectionId,
    });

    console.log(`→ Issuing reviewer session token for ${guacUsername}...`);
    const auth = await client.issueToken(guacUsername, guacPassword);

    const iframeUrl = client.buildIframeUrl({
      publicBaseUrl: config.publicBaseUrl,
      connectionIdentifier: connectionId,
      token: auth.authToken,
    });

    console.log("");
    console.log("================================================================");
    console.log("Guacamole iframe URL (open in a browser to verify):");
    console.log("");
    console.log(iframeUrl);
    console.log("");
    console.log("================================================================");
    console.log("");
    console.log(
      "Press Enter to delete the connection + one-shot user and exit. " +
        "(Ctrl+C also cleans up.)",
    );

    await waitForEnterOrSignal();
  } finally {
    console.log("→ Cleaning up Guacamole resources...");
    if (connectionId) {
      await client.deleteConnection(connectionId);
      console.log(`  deleted connection ${connectionId}`);
    }
    await client.deleteUser(guacUsername);
    console.log(`  deleted user ${guacUsername}`);
  }
}

function waitForEnterOrSignal(): Promise<void> {
  return new Promise((resolve) => {
    const finish = () => {
      process.stdin.removeListener("data", finish);
      try {
        process.stdin.pause();
      } catch {
        // ignore
      }
      resolve();
    };

    process.once("SIGINT", () => {
      console.log("");
      finish();
    });

    process.stdin.resume();
    process.stdin.once("data", finish);
  });
}

main()
  .then(() => {
    // The postgres-js pool (and any other long-lived handles like ioredis)
    // keep the event loop alive forever, so without an explicit exit the
    // CLI hangs even after the requested command finished successfully.
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
