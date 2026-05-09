import "dotenv/config";
import { db } from "../src/db";
import { vmTypes } from "../src/db/schema";
import { createProxmoxClient, getProxmoxConfig } from "../src/lib/proxmox/config";
import { discoverIpFromProxmoxNeighborTable } from "../src/lib/proxmox/ip-discovery";
import { vmTypeSeeds } from "../src/config/vm-types";

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

  console.error("Usage: pnpm payload <proxmox:test-clone|seed:vm-types>");
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
  } finally {
    if (started) {
      console.log(`Stopping VM ${vmid}...`);
      const stopUpid = await client.stopVm(node, vmid);
      await client.waitForTask({ node, upid: stopUpid });
    }

    console.log(`Deleting VM ${vmid}...`);
    const deleteUpid = await client.deleteVm(node, vmid);
    await client.waitForTask({ node, upid: deleteUpid });
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

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
