export const vmTypeSeeds = [
  {
    slug: "linux",
    displayName: "Debian KDE",
    proxmoxTemplateVmid: Number(process.env.PROXMOX_LINUX_TEMPLATE_VMID ?? 9001),
    proxmoxNode: process.env.PROXMOX_DEFAULT_NODE ?? "pve",
    protocol: "rdp",
    defaultPort: 3389,
    enabled: true,
    description: "Debain running KDE Plasma.",
  },
] as const;
