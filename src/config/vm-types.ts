export const vmTypeSeeds = [
    {
        slug: "linux",
        displayName: "Debian XFCE",
        proxmoxTemplateVmid: 67001,
        proxmoxNode: process.env.PROXMOX_DEFAULT_NODE ?? "pve",
        protocol: "rdp",
        defaultPort: 3389,
        enabled: true,
        description: "Debian XFCE 4.18.",
        username: process.env.VM_DEFAULT_USERNAME ?? "shipwrights",
        password: process.env.VM_DEFAULT_PASSWORD ?? "shipwrights",
        iconUrl:
            "https://cdn.hackclub.com/019e129d-bd95-7d3f-b952-eaffec41afc3/devicon--debian.png",
    },
    {
        slug: "windows",
        displayName: "Windows 11",
        proxmoxTemplateVmid: 67002,
        proxmoxNode: process.env.PROXMOX_DEFAULT_NODE ?? "pve",
        protocol: "rdp",
        defaultPort: 3389,
        enabled: true,
        description: "Windows 11.",
        username: process.env.VM_DEFAULT_USERNAME ?? "shipwrights",
        password: process.env.VM_DEFAULT_PASSWORD ?? "shipwrights",
        iconUrl:
            "https://cdn.hackclub.com/019e129d-c001-7ffc-8288-0fd14cf9dae3/devicon--windows11.png",
    },
] as const;
