interface SupabaseTestBucketOptions {
  supabaseUrl: string;
  secretKey: string;
  bucketName: string;
  fetcher?: typeof fetch;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireLoopbackUrl(value: string): URL {
  const url = new URL(value);
  const hostname = url.hostname.toLowerCase().replace(/^\[(.*)\]$/, "$1");

  if (
    url.protocol !== "http:" ||
    !["localhost", "127.0.0.1", "::1"].includes(hostname)
  ) {
    throw new Error(
      "Storage integration bucket setup is restricted to local Supabase.",
    );
  }

  return url;
}

export async function withSupabaseTestBucket<T>(
  options: SupabaseTestBucketOptions,
  run: () => Promise<T>,
): Promise<T> {
  const projectUrl = requireLoopbackUrl(options.supabaseUrl);
  const fetcher = options.fetcher ?? globalThis.fetch;
  const headers = new Headers({
    Accept: "application/json",
    apikey: options.secretKey,
    Authorization: `Bearer ${options.secretKey}`,
    "Content-Type": "application/json",
  });
  const bucketUrl = new URL("/storage/v1/bucket", projectUrl);
  const listResponse = await fetcher(bucketUrl, {
    headers,
    signal: AbortSignal.timeout(10_000),
  });

  if (!listResponse.ok) {
    throw new Error(
      `Could not inspect the local Storage test bucket (HTTP ${listResponse.status}).`,
    );
  }

  let bucketList: unknown;

  try {
    bucketList = await listResponse.json();
  } catch (cause) {
    throw new Error("Local Storage returned an invalid bucket list.", {
      cause,
    });
  }

  if (!Array.isArray(bucketList)) {
    throw new Error("Local Storage returned an invalid bucket list.");
  }

  const existingBucket = bucketList.find(
    (bucket) => isRecord(bucket) && bucket["id"] === options.bucketName,
  );
  const bucketExists = existingBucket !== undefined;

  if (
    bucketExists &&
    (!isRecord(existingBucket) || existingBucket["public"] !== false)
  ) {
    throw new Error("The existing local Storage test bucket must be private.");
  }
  let bucketCreated = false;
  let operationFailed = false;
  let operationFailure: unknown;
  let operationResult: { value: T } | undefined;
  const cleanupErrors: unknown[] = [];

  try {
    if (!bucketExists) {
      const createResponse = await fetcher(bucketUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({
          id: options.bucketName,
          name: options.bucketName,
          public: false,
          file_size_limit: "1MB",
          allowed_mime_types: ["text/plain"],
        }),
        signal: AbortSignal.timeout(10_000),
      });

      if (!createResponse.ok) {
        throw new Error(
          `Could not create the local Storage test bucket (HTTP ${createResponse.status}).`,
        );
      }

      bucketCreated = true;
    }

    operationResult = { value: await run() };
  } catch (error) {
    operationFailed = true;
    operationFailure = error;
  }

  if (bucketCreated) {
    try {
      const deleteResponse = await fetcher(
        new URL(
          `/storage/v1/bucket/${encodeURIComponent(options.bucketName)}`,
          projectUrl,
        ),
        {
          method: "DELETE",
          headers,
          body: JSON.stringify({}),
          signal: AbortSignal.timeout(10_000),
        },
      );

      if (!deleteResponse.ok) {
        cleanupErrors.push(
          new Error(
            `Could not remove the temporary local Storage test bucket (HTTP ${deleteResponse.status}).`,
          ),
        );
      }
    } catch (error) {
      cleanupErrors.push(error);
    }
  }

  if (operationFailed && cleanupErrors.length > 0) {
    throw new AggregateError(
      [operationFailure, ...cleanupErrors],
      "Storage test operation and bucket cleanup both failed.",
    );
  }

  if (operationFailed) {
    throw operationFailure;
  }

  if (cleanupErrors.length > 0) {
    throw new AggregateError(
      cleanupErrors,
      "Storage test bucket cleanup failed.",
    );
  }

  if (operationResult === undefined) {
    throw new Error("The Storage integration test did not complete.");
  }

  return operationResult.value;
}
