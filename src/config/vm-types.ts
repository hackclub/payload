export const vmTypeSeeds = [
  {
    slug: "linux",
    displayName: "Debian XFCE",
    proxmoxTemplateVmid: 67001,
    proxmoxNode: process.env.PROXMOX_DEFAULT_NODE ?? "pve",
    protocol: "rdp",
    defaultPort: 3389,
    enabled: true,
    description: "Debian XFCE 4.18 over RDP.",
  },
] as const;
