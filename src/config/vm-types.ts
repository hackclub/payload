import { env } from "../env";

export const vmTypeSeeds = [
    {
        slug: "linux",
        displayName: "Debian XFCE",
        proxmoxTemplateVmid: 67001,
        proxmoxNode: env.PROXMOX_DEFAULT_NODE,
        protocol: "rdp",
        defaultPort: 3389,
        enabled: true,
        description: "Debian running XFCE",
        username: "shipwrights",
        password: "shipwrights",
        iconUrl:
            "https://cdn.hackclub.com/019e129d-bd95-7d3f-b952-eaffec41afc3/devicon--debian.png",
        bootDelayMs: 1000,
        expensive: false,
    },
    {
        slug: "windows",
        displayName: "Windows 11",
        proxmoxTemplateVmid: 67002,
        proxmoxNode: env.PROXMOX_DEFAULT_NODE,
        protocol: "rdp",
        defaultPort: 3389,
        enabled: true,
        description: "Windows 11 Enterprise Iot LTSC",
        username: "shipwrights",
        password: "shipwrights",
        iconUrl:
            "https://cdn.hackclub.com/019e129d-c001-7ffc-8288-0fd14cf9dae3/devicon--windows11.png",
        bootDelayMs: 1000,
        expensive: false,
    },
    {
        slug: "android",
        displayName: "Android",
        proxmoxTemplateVmid: 67003,
        proxmoxNode: env.PROXMOX_DEFAULT_NODE,
        protocol: "vnc",
        defaultPort: 5901,
        enabled: true,
        description: "Bliss OS on Android 13",
        username: "shipwrights",
        password: "",
        iconUrl:
            "https://cdn.hackclub.com/019e129d-bb06-7cbd-bc0f-b5ae86029a35/devicon--android.png",
        // droidVNC-NG only starts after Android finishes booting, so give it
        // a head start before we let Guacamole try the VNC handshake.
        bootDelayMs: 6000,
        expensive: false,
    },
    {
        slug: "macos",
        displayName: "MacOS",
        proxmoxTemplateVmid: 67005,
        proxmoxNode: env.PROXMOX_DEFAULT_NODE,
        protocol: "vnc",
        defaultPort: 5900,
        enabled: true,
        description: "MacOS Sequioa (15)",
        username: "shipwrights",
        password: "shipwrights",
        iconUrl:
            "https://cdn.hackclub.com/019e129d-b89d-708b-a515-d8979405d1a8/ic--baseline-apple.png",
        bootDelayMs: 1000,
        expensive: true,
    },
] as const;
