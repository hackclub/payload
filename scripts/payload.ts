import "dotenv/config";
import { randomBytes } from "node:crypto";
import { db } from "../src/db";
import { vmTypes } from "../src/db/schema";
import { createProxmoxClient, getProxmoxConfig } from "../src/lib/proxmox/config";
import { discoverIpFromProxmoxNeighborTable } from "../src/lib/proxmox/ip-discovery";
import { vmTypeSeeds } from "../src/config/vm-types";
import {
  createGuacamoleClient,
  getGuacamoleConfig,
} from "../src/lib/guacamole/config";
import type { GuacamoleProtocol } from "../src/lib/guacamole/client";

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

  console.error(
    "Usage: pnpm payload <proxmox:test-clone|seed:vm-types|guac:test-connection>",
  );
  process.exit(1);
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
            security: process.env.GUAC_TEST_RDP_SECURITY ?? "tls",
            "disable-auth": "false",
            "resize-method": "display-update",
            "disable-copy": "false",
            "disable-paste": "false",
          }
        : {
            hostname: vmIp,
            port,
            password: vmPassword,
            "color-depth": "24",
            "disable-copy": "false",
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

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
