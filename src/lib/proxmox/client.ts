type ProxmoxResponse<T> = {
  data: T;
};

type ProxmoxTaskStatus = {
  status: "running" | "stopped";
  exitstatus?: string;
};

export type ProxmoxClientOptions = {
  baseUrl: string;
  tokenId: string;
  tokenSecret: string;
  timeoutMs?: number;
  retryCount?: number;
};

type ProxmoxRequestOptions = Omit<RequestInit, "body"> & {
  body?: Record<string, string | number | boolean | undefined>;
  retry?: boolean;
};

export class ProxmoxApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly path: string,
    readonly body: string,
  ) {
    super(message);
    this.name = "ProxmoxApiError";
  }
}

export class ProxmoxClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly retryCount: number;

  constructor(private readonly options: ProxmoxClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.retryCount = options.retryCount ?? 2;
  }

  async request<T>(path: string, init: ProxmoxRequestOptions = {}): Promise<T> {
    const attempts = init.retry === false ? 1 : this.retryCount + 1;
    let lastError: unknown;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const requestInit = { ...init };
        delete requestInit.retry;
        return await this.fetchOnce<T>(path, requestInit);
      } catch (error) {
        lastError = error;
        if (!shouldRetry(error) || attempt === attempts) {
          throw error;
        }
        await sleep(250 * 2 ** (attempt - 1));
      }
    }

    throw lastError;
  }

  async getNextVmid(): Promise<number> {
    const data = await this.request<string | number>("/cluster/nextid");
    return Number(data);
  }

  async cloneVm(input: {
    node: string;
    templateVmid: number;
    newVmid: number;
    name: string;
    full?: boolean;
  }): Promise<string> {
    return this.request<string>(
      `/nodes/${input.node}/qemu/${input.templateVmid}/clone`,
      {
        method: "POST",
        body: {
          newid: input.newVmid,
          name: input.name,
          full: input.full === true ? 1 : 0,
          target: input.node,
        },
        retry: false,
      },
    );
  }

  /**
   * Update VM config (POST /config). Used to rebrand a warm-pool clone to its
   * claimant (`name`) and to adjust its CPU weight (`cpuunits`) — ADR-0033.
   * `cpuunits` applies live to a running VM's cgroup.
   */
  async updateVmConfig(
    node: string,
    vmid: number,
    params: Record<string, string | number>,
  ): Promise<void> {
    await this.request<unknown>(`/nodes/${node}/qemu/${vmid}/config`, {
      method: "POST",
      body: params,
      retry: false,
    });
  }

  /** List all QEMU VMs on a node (used by the orphan sweep). */
  async listVms(node: string): Promise<
    Array<{ vmid: number; name?: string; status?: string; template?: number }>
  > {
    return this.request<
      Array<{ vmid: number; name?: string; status?: string; template?: number }>
    >(`/nodes/${node}/qemu`);
  }

  /** Current run status of a VM; used for warm-VM health checks before bind. */
  async getVmStatus(node: string, vmid: number): Promise<{ status: string }> {
    return this.request<{ status: string }>(
      `/nodes/${node}/qemu/${vmid}/status/current`,
    );
  }

  async getTaskStatus(node: string, upid: string): Promise<ProxmoxTaskStatus> {
    return this.request<ProxmoxTaskStatus>(
      `/nodes/${node}/tasks/${encodeURIComponent(upid)}/status`,
    );
  }

  async waitForTask(input: {
    node: string;
    upid: string;
    timeoutMs?: number;
    intervalMs?: number;
  }): Promise<void> {
    const timeoutAt = Date.now() + (input.timeoutMs ?? 180_000);
    const intervalMs = input.intervalMs ?? 2_000;

    while (Date.now() < timeoutAt) {
      const status = await this.getTaskStatus(input.node, input.upid);
      if (status.status === "stopped") {
        if (status.exitstatus && status.exitstatus !== "OK") {
          throw new Error(`Proxmox task failed with exit status ${status.exitstatus}`);
        }
        return;
      }
      await sleep(intervalMs);
    }

    throw new Error(`Timed out waiting for Proxmox task ${input.upid}`);
  }

  async startVm(node: string, vmid: number): Promise<string> {
    return this.request<string>(`/nodes/${node}/qemu/${vmid}/status/start`, {
      method: "POST",
      retry: false,
    });
  }

  async stopVm(node: string, vmid: number): Promise<string> {
    return this.request<string>(`/nodes/${node}/qemu/${vmid}/status/stop`, {
      method: "POST",
      retry: false,
    });
  }

  async deleteVm(node: string, vmid: number): Promise<string> {
    return this.request<string>(`/nodes/${node}/qemu/${vmid}?purge=1`, {
      method: "DELETE",
      retry: false,
    });
  }

  async getVmConfig(node: string, vmid: number): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>(`/nodes/${node}/qemu/${vmid}/config`);
  }

  async getPrimaryMacAddress(node: string, vmid: number): Promise<string> {
    const config = await this.getVmConfig(node, vmid);
    const net0 = config.net0;
    if (typeof net0 !== "string") {
      throw new Error(`VM ${vmid} does not have a net0 config with a MAC address`);
    }

    const mac = net0.match(/(?:^|=)([0-9a-f]{2}(?::[0-9a-f]{2}){5})(?:,|$)/i)?.[1];
    if (!mac) {
      throw new Error(`Could not parse VM ${vmid} MAC address from net0 config`);
    }

    return mac.toLowerCase();
  }

  private async fetchOnce<T>(
    path: string,
    { body, headers, ...init }: ProxmoxRequestOptions,
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}/api2/json${path}`, {
        ...init,
        body: body ? encodeFormBody(body) : undefined,
        headers: {
          authorization: `PVEAPIToken=${this.options.tokenId}=${this.options.tokenSecret}`,
          ...(body ? { "content-type": "application/x-www-form-urlencoded" } : {}),
          ...headers,
        },
        signal: controller.signal,
      });

      const responseBody = await response.text();
      if (!response.ok) {
        throw new ProxmoxApiError(
          `Proxmox ${response.status} ${response.statusText} for ${path}`,
          response.status,
          path,
          responseBody,
        );
      }

      return (JSON.parse(responseBody) as ProxmoxResponse<T>).data;
    } finally {
      clearTimeout(timeout);
    }
  }
}

function encodeFormBody(body: Record<string, string | number | boolean | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(body)) {
    if (value !== undefined) {
      params.set(key, String(value));
    }
  }
  return params;
}

function shouldRetry(error: unknown) {
  if (error instanceof ProxmoxApiError) {
    return error.status === 408 || error.status === 429 || error.status >= 500;
  }

  return error instanceof TypeError || (error instanceof Error && error.name === "AbortError");
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
