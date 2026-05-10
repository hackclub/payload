type GuacamoleAuthResponse = {
  authToken: string;
  username: string;
  dataSource: string;
  availableDataSources?: string[];
};

export type GuacamoleProtocol = "vnc" | "rdp";

export type GuacamoleClientOptions = {
  baseUrl: string;
  dataSource: string;
  adminUsername: string;
  adminPassword: string;
  /** Token cache TTL in ms; should be slightly below `api-session-timeout`. */
  adminTokenTtlMs?: number;
  timeoutMs?: number;
  retryCount?: number;
};

type GuacamoleRequestOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
  formBody?: Record<string, string>;
  retry?: boolean;
  /** When true, the request includes the cached admin token. */
  withAdminToken?: boolean;
  /** Override token (used when issuing tokens for a non-admin user). */
  token?: string;
};

export class GuacamoleApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly path: string,
    readonly body: string,
  ) {
    super(message);
    this.name = "GuacamoleApiError";
  }
}

export class GuacamoleClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly retryCount: number;
  private readonly adminTokenTtlMs: number;

  private adminToken: string | null = null;
  private adminTokenExpiresAt = 0;

  constructor(private readonly options: GuacamoleClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.retryCount = options.retryCount ?? 2;
    // Default to 12 minutes; Guacamole default api-session-timeout is 15.
    this.adminTokenTtlMs = options.adminTokenTtlMs ?? 12 * 60_000;
  }

  /** Returns the currently configured Guacamole REST data source identifier. */
  get dataSource(): string {
    return this.options.dataSource;
  }

  /**
   * Issues a fresh auth token for the configured admin user. Cached in memory
   * until `adminTokenTtlMs` elapses or a 401 forces a refresh.
   */
  async getAdminToken(forceRefresh = false): Promise<string> {
    if (
      !forceRefresh &&
      this.adminToken &&
      Date.now() < this.adminTokenExpiresAt
    ) {
      return this.adminToken;
    }

    const auth = await this.issueToken(
      this.options.adminUsername,
      this.options.adminPassword,
    );

    this.adminToken = auth.authToken;
    this.adminTokenExpiresAt = Date.now() + this.adminTokenTtlMs;
    return auth.authToken;
  }

  /**
   * Issues an auth token for an arbitrary username/password. Used both
   * internally for the admin and externally to mint short-lived reviewer
   * session tokens.
   */
  async issueToken(
    username: string,
    password: string,
  ): Promise<GuacamoleAuthResponse> {
    return this.request<GuacamoleAuthResponse>("/api/tokens", {
      method: "POST",
      formBody: { username, password },
      retry: false,
    });
  }

  async createUser(input: { username: string; password: string }): Promise<void> {
    await this.adminRequest(
      `/api/session/data/${this.dataSource}/users`,
      {
        method: "POST",
        body: {
          username: input.username,
          password: input.password,
          attributes: {},
        },
      },
    );
  }

  async deleteUser(username: string): Promise<void> {
    await this.adminRequest(
      `/api/session/data/${this.dataSource}/users/${encodeURIComponent(username)}`,
      { method: "DELETE", treat404AsSuccess: true },
    );
  }

  async createConnection(input: {
    name: string;
    protocol: GuacamoleProtocol;
    parameters: Record<string, string>;
    attributes?: Record<string, string>;
    parentIdentifier?: string;
  }): Promise<{ identifier: string }> {
    return this.adminRequest<{ identifier: string }>(
      `/api/session/data/${this.dataSource}/connections`,
      {
        method: "POST",
        body: {
          parentIdentifier: input.parentIdentifier ?? "ROOT",
          name: input.name,
          protocol: input.protocol,
          parameters: input.parameters,
          attributes: input.attributes ?? {
            "max-connections": "1",
            "max-connections-per-user": "1",
          },
        },
      },
    );
  }

  async deleteConnection(identifier: string): Promise<void> {
    await this.adminRequest(
      `/api/session/data/${this.dataSource}/connections/${encodeURIComponent(identifier)}`,
      { method: "DELETE", treat404AsSuccess: true },
    );
  }

  async grantConnectionPermission(input: {
    username: string;
    connectionIdentifier: string;
    permission?: "READ" | "UPDATE" | "DELETE" | "ADMINISTER";
  }): Promise<void> {
    await this.adminRequest(
      `/api/session/data/${this.dataSource}/users/${encodeURIComponent(input.username)}/permissions`,
      {
        method: "PATCH",
        body: [
          {
            op: "add",
            path: `/connectionPermissions/${input.connectionIdentifier}`,
            value: input.permission ?? "READ",
          },
        ],
      },
    );
  }

  /**
   * Builds the iframe identifier param. Guacamole encodes
   * `<id>\0c\0<dataSource>` as base64 (URL-safe, no padding stripped).
   */
  buildClientIdentifier(connectionIdentifier: string): string {
    const raw = `${connectionIdentifier}\0c\0${this.dataSource}`;
    return Buffer.from(raw, "utf8").toString("base64");
  }

  /**
   * Convenience: full iframe URL for a session. `publicBaseUrl` should be the
   * URL the reviewer's browser uses to reach Guacamole, e.g.
   * `https://payload.hackclub.com/guac`.
   */
  buildIframeUrl(input: {
    publicBaseUrl: string;
    connectionIdentifier: string;
    token: string;
  }): string {
    const idParam = this.buildClientIdentifier(input.connectionIdentifier);
    const base = input.publicBaseUrl.replace(/\/$/, "");
    return `${base}/#/client/${idParam}?token=${encodeURIComponent(input.token)}`;
  }

  private async adminRequest<T = void>(
    path: string,
    init: GuacamoleRequestOptions & { treat404AsSuccess?: boolean } = {},
  ): Promise<T> {
    const treat404AsSuccess = init.treat404AsSuccess === true;
    delete (init as { treat404AsSuccess?: boolean }).treat404AsSuccess;

    try {
      return await this.request<T>(path, { ...init, withAdminToken: true });
    } catch (error) {
      if (error instanceof GuacamoleApiError && error.status === 401) {
        // Token may have expired before TTL; refresh and try once more.
        await this.getAdminToken(true);
        try {
          return await this.request<T>(path, { ...init, withAdminToken: true });
        } catch (retryError) {
          if (
            treat404AsSuccess &&
            retryError instanceof GuacamoleApiError &&
            retryError.status === 404
          ) {
            return undefined as T;
          }
          throw retryError;
        }
      }

      if (
        treat404AsSuccess &&
        error instanceof GuacamoleApiError &&
        error.status === 404
      ) {
        return undefined as T;
      }

      throw error;
    }
  }

  async request<T>(
    path: string,
    init: GuacamoleRequestOptions = {},
  ): Promise<T> {
    const attempts = init.retry === false ? 1 : this.retryCount + 1;
    let lastError: unknown;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        return await this.fetchOnce<T>(path, init);
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

  private async fetchOnce<T>(
    path: string,
    options: GuacamoleRequestOptions,
  ): Promise<T> {
    const { body, formBody, headers, withAdminToken, token, ...init } = options;

    const url = new URL(`${this.baseUrl}${path}`);

    let resolvedToken = token;
    if (withAdminToken && !resolvedToken) {
      resolvedToken = await this.getAdminToken();
    }
    if (resolvedToken) {
      url.searchParams.set("token", resolvedToken);
    }

    const requestHeaders: Record<string, string> = { ...(headers as Record<string, string>) };
    let requestBody: BodyInit | undefined;

    if (formBody) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(formBody)) {
        params.set(key, value);
      }
      requestBody = params;
      requestHeaders["content-type"] = "application/x-www-form-urlencoded";
    } else if (body !== undefined) {
      requestBody = JSON.stringify(body);
      requestHeaders["content-type"] = "application/json";
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url.toString(), {
        ...init,
        body: requestBody,
        headers: requestHeaders,
        signal: controller.signal,
      });

      const responseText = await response.text();

      if (!response.ok) {
        throw new GuacamoleApiError(
          `Guacamole ${response.status} ${response.statusText} for ${path}`,
          response.status,
          path,
          responseText,
        );
      }

      // PATCH/DELETE often return 204 No Content with empty body.
      if (!responseText) {
        return undefined as T;
      }

      try {
        return JSON.parse(responseText) as T;
      } catch {
        return responseText as unknown as T;
      }
    } finally {
      clearTimeout(timeout);
    }
  }
}

function shouldRetry(error: unknown) {
  if (error instanceof GuacamoleApiError) {
    return error.status === 408 || error.status === 429 || error.status >= 500;
  }
  return error instanceof TypeError || (error instanceof Error && error.name === "AbortError");
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
