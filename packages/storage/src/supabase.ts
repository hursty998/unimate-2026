import {
  ObjectStorageError,
  type ObjectKey,
  type ObjectStorage,
  type ReadPermission,
  type UploadPermission,
} from "./index.js";

const SIGNED_UPLOAD_LIFETIME_SECONDS = 2 * 60 * 60;
const DEFAULT_TIMEOUT_MILLISECONDS = 10_000;

export interface SupabaseObjectStorageOptions {
  supabaseUrl: string;
  secretKey: string;
  bucketName: string;
  fetcher?: typeof fetch;
  timeoutMilliseconds?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateSupabaseUrl(value: string): URL {
  const url = new URL(value);
  const isLoopback =
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "[::1]" ||
    url.hostname === "::1";

  if (
    (url.protocol !== "https:" && url.protocol !== "http:") ||
    (url.protocol === "http:" && !isLoopback) ||
    url.pathname !== "/" ||
    url.search.length > 0 ||
    url.hash.length > 0 ||
    url.username.length > 0 ||
    url.password.length > 0
  ) {
    throw new TypeError(
      "SUPABASE_URL must be an HTTPS origin, except for a loopback local Supabase origin.",
    );
  }

  return url;
}

function validateBucketName(value: string): void {
  if (!/^[a-z0-9][a-z0-9_-]{0,62}$/.test(value)) {
    throw new TypeError("The Supabase Storage bucket name is invalid.");
  }
}

function encodeObjectKey(key: ObjectKey): string {
  return key.split("/").map(encodeURIComponent).join("/");
}

function parseSignedUrl(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new ObjectStorageError(
      "invalid-response",
      "Supabase Storage returned an invalid signed URL.",
    );
  }

  return value;
}

export class SupabaseObjectStorage implements ObjectStorage {
  private readonly baseUrl: URL;
  private readonly fetcher: typeof fetch;
  private readonly timeoutMilliseconds: number;

  constructor(private readonly options: SupabaseObjectStorageOptions) {
    this.baseUrl = validateSupabaseUrl(options.supabaseUrl);

    if (!options.secretKey.startsWith("sb_secret_")) {
      throw new TypeError(
        "Supabase Storage requires a server-side sb_secret_ key.",
      );
    }

    validateBucketName(options.bucketName);
    this.fetcher = options.fetcher ?? globalThis.fetch;
    this.timeoutMilliseconds =
      options.timeoutMilliseconds ?? DEFAULT_TIMEOUT_MILLISECONDS;

    if (
      !Number.isSafeInteger(this.timeoutMilliseconds) ||
      this.timeoutMilliseconds < 1
    ) {
      throw new TypeError(
        "Storage request timeout must be a positive integer.",
      );
    }
  }

  async createUploadPermission({
    key,
    contentType,
  }: {
    key: ObjectKey;
    contentType: string;
  }): Promise<UploadPermission> {
    if (contentType.trim().length === 0) {
      throw new TypeError("The object content type must not be empty.");
    }

    const createdAt = Date.now();
    const response = await this.request(
      "POST",
      `/object/upload/sign/${this.options.bucketName}/${encodeObjectKey(key)}`,
      {},
    );
    const body = await this.readJson(response);
    const url = parseSignedUrl(isRecord(body) ? body["url"] : undefined);
    const expiresAt = new Date(
      createdAt + SIGNED_UPLOAD_LIFETIME_SECONDS * 1000,
    );

    return {
      url: this.resolveSignedUrl(url),
      method: "PUT",
      headers: {
        "content-type": contentType,
        "cache-control": "max-age=3600",
        "x-upsert": "false",
      },
      expiresAt,
    };
  }

  async createReadPermission({
    key,
    expiresInSeconds,
  }: {
    key: ObjectKey;
    expiresInSeconds: number;
  }): Promise<ReadPermission> {
    if (!Number.isSafeInteger(expiresInSeconds) || expiresInSeconds < 1) {
      throw new TypeError("Signed read URL expiry must be a positive integer.");
    }

    const createdAt = Date.now();
    const response = await this.request(
      "POST",
      `/object/sign/${this.options.bucketName}/${encodeObjectKey(key)}`,
      { expiresIn: expiresInSeconds },
    );
    const body = await this.readJson(response);
    const signedUrl = parseSignedUrl(
      isRecord(body) ? body["signedURL"] : undefined,
    );

    return {
      url: this.resolveSignedUrl(signedUrl),
      expiresAt: new Date(createdAt + expiresInSeconds * 1000),
    };
  }

  async deleteObject(key: ObjectKey): Promise<void> {
    await this.request("DELETE", `/object/${this.options.bucketName}`, {
      prefixes: [key],
    });
  }

  private async request(
    method: string,
    path: string,
    body: unknown,
  ): Promise<Response>;
  private async request(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<Response> {
    const requestBody = body === undefined ? undefined : JSON.stringify(body);
    const headers = new Headers({
      Accept: "application/json",
      apikey: this.options.secretKey,
      Authorization: `Bearer ${this.options.secretKey}`,
    });

    if (requestBody !== undefined) {
      headers.set("Content-Type", "application/json");
    }

    let response: Response;

    try {
      response = await this.fetcher(
        new URL(`/storage/v1${path}`, this.baseUrl),
        {
          method,
          headers,
          ...(requestBody === undefined ? {} : { body: requestBody }),
          signal: AbortSignal.timeout(this.timeoutMilliseconds),
        },
      );
    } catch (cause) {
      throw new ObjectStorageError(
        "unavailable",
        "Supabase Storage could not complete the request.",
        { cause },
      );
    }

    if (!response.ok) {
      throw new ObjectStorageError(
        response.status === 429 || response.status >= 500
          ? "unavailable"
          : "rejected",
        "Supabase Storage rejected the operation.",
        { status: response.status },
      );
    }

    return response;
  }

  private async readJson(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch (cause) {
      throw new ObjectStorageError(
        "invalid-response",
        "Supabase Storage returned invalid JSON.",
        { cause },
      );
    }
  }

  private resolveSignedUrl(value: string): string {
    const urlPath = value.startsWith("/storage/v1/")
      ? value
      : `/storage/v1/${value.replace(/^\/+/, "")}`;
    const signedUrl = new URL(urlPath, this.baseUrl);

    if (
      signedUrl.origin !== this.baseUrl.origin ||
      !signedUrl.pathname.startsWith("/storage/v1/object/")
    ) {
      throw new ObjectStorageError(
        "invalid-response",
        "Supabase Storage returned a signed URL for an unexpected origin.",
      );
    }

    return signedUrl.toString();
  }
}
