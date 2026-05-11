export const vmTypeSeeds = [
    {
        slug: "linux",
        displayName: "Debian XFCE",
        proxmoxTemplateVmid: 67001,
        proxmoxNode: process.env.PROXMOX_DEFAULT_NODE ?? "pve",
        protocol: "rdp",
        defaultPort: 3389,
        enabled: true,
        description: "Debian running XFCE",
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
        description: "Windows 11 Enterprise Iot LTSC",
        username: process.env.VM_DEFAULT_USERNAME ?? "shipwrights",
        password: process.env.VM_DEFAULT_PASSWORD ?? "shipwrights",
        iconUrl:
            "https://cdn.hackclub.com/019e129d-c001-7ffc-8288-0fd14cf9dae3/devicon--windows11.png",
    },
    {
        slug: "android",
        displayName: "Android",
        proxmoxTemplateVmid: 67003,
        proxmoxNode: process.env.PROXMOX_DEFAULT_NODE ?? "pve",
        protocol: "vnc",
        defaultPort: 5901,
        enabled: true,
        description: "Bliss OS on Android 13",
        username: process.env.VM_DEFAULT_USERNAME ?? "shipwrights",
        password: "",
        iconUrl:
            "https://cdn.hackclub.com/019e129d-bb06-7cbd-bc0f-b5ae86029a35/devicon--android.png",
    },
] as const;
