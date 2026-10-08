export interface SecureKeyValueStore {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

interface SessionManifest {
  version: 1;
  generation: string;
  chunkCount: number;
  byteLength: number;
}

// Keep each entry below SecureStore's documented historical ~2 KB limit.
const MAX_SECURE_VALUE_BYTES = 1800;

function utf8ByteLength(value: string): number {
  let length = 0;

  for (const character of value) {
    const codePoint = character.codePointAt(0);

    if (codePoint === undefined) {
      throw new Error("Could not measure a secure session storage value.");
    }

    length +=
      codePoint <= 0x7f
        ? 1
        : codePoint <= 0x7ff
          ? 2
          : codePoint <= 0xffff
            ? 3
            : 4;
  }

  return length;
}

function splitIntoSecureValues(value: string): string[] {
  const chunks: string[] = [];
  let currentChunk = "";
  let currentChunkBytes = 0;

  for (const character of value) {
    const characterBytes = utf8ByteLength(character);

    if (currentChunkBytes + characterBytes > MAX_SECURE_VALUE_BYTES) {
      chunks.push(currentChunk);
      currentChunk = "";
      currentChunkBytes = 0;
    }

    currentChunk += character;
    currentChunkBytes += characterBytes;
  }

  if (currentChunk.length > 0 || chunks.length === 0) {
    chunks.push(currentChunk);
  }

  return chunks;
}

function parseManifest(value: string): SessionManifest {
  let parsed: unknown;

  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("The secure authentication session index is invalid.");
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("version" in parsed) ||
    parsed.version !== 1 ||
    !("generation" in parsed) ||
    typeof parsed.generation !== "string" ||
    !/^[a-zA-Z0-9-]+$/.test(parsed.generation) ||
    !("chunkCount" in parsed) ||
    typeof parsed.chunkCount !== "number" ||
    !Number.isSafeInteger(parsed.chunkCount) ||
    parsed.chunkCount < 1 ||
    !("byteLength" in parsed) ||
    typeof parsed.byteLength !== "number" ||
    !Number.isSafeInteger(parsed.byteLength) ||
    parsed.byteLength < 0
  ) {
    throw new Error("The secure authentication session index is invalid.");
  }

  return {
    version: 1,
    generation: parsed.generation,
    chunkCount: parsed.chunkCount,
    byteLength: parsed.byteLength,
  };
}

export function createSecureSessionStorage(
  secureStore: SecureKeyValueStore,
  storageNamespace: string,
) {
  if (!/^[a-zA-Z0-9._-]+$/.test(storageNamespace)) {
    throw new Error("The secure authentication storage key is invalid.");
  }

  const namespacePrefix = `unimate-auth-v1.${storageNamespace}`;
  let generationSequence = 0;
  let operationQueue: Promise<void> = Promise.resolve();

  function baseKeyFor(key: string): string {
    if (!/^[a-zA-Z0-9._-]+$/.test(key)) {
      throw new Error("The Supabase authentication storage key is invalid.");
    }

    return `${namespacePrefix}.${key}`;
  }

  function serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = operationQueue.then(operation, operation);
    operationQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  function manifestKey(baseKey: string): string {
    return `${baseKey}.manifest`;
  }

  function chunkKey(
    baseKey: string,
    generation: string,
    index: number,
  ): string {
    return `${baseKey}.${generation}.${index}`;
  }

  async function readManifest(
    baseKey: string,
  ): Promise<SessionManifest | null> {
    const value = await secureStore.getItemAsync(manifestKey(baseKey));
    return value === null ? null : parseManifest(value);
  }

  async function deleteGeneration(
    baseKey: string,
    manifest: SessionManifest,
  ): Promise<void> {
    for (let index = 0; index < manifest.chunkCount; index += 1) {
      await secureStore.deleteItemAsync(
        chunkKey(baseKey, manifest.generation, index),
      );
    }
  }

  return {
    getItem(key: string): Promise<string | null> {
      const baseKey = baseKeyFor(key);

      return serialize(async () => {
        const manifest = await readManifest(baseKey);

        if (!manifest) {
          return null;
        }

        const chunks: string[] = [];
        for (let index = 0; index < manifest.chunkCount; index += 1) {
          const chunk = await secureStore.getItemAsync(
            chunkKey(baseKey, manifest.generation, index),
          );

          if (chunk === null) {
            throw new Error("The secure authentication session is incomplete.");
          }

          chunks.push(chunk);
        }

        const value = chunks.join("");
        if (utf8ByteLength(value) !== manifest.byteLength) {
          throw new Error("The secure authentication session is incomplete.");
        }

        return value;
      });
    },

    setItem(key: string, value: string): Promise<void> {
      const baseKey = baseKeyFor(key);

      return serialize(async () => {
        const previousManifest = await readManifest(baseKey);
        const keyManifest = manifestKey(baseKey);
        generationSequence += 1;
        const generation = `${Date.now().toString(36)}-${generationSequence.toString(36)}`;
        const chunks = splitIntoSecureValues(value);
        const newManifest: SessionManifest = {
          version: 1,
          generation,
          chunkCount: chunks.length,
          byteLength: utf8ByteLength(value),
        };
        let writtenChunks = 0;

        try {
          for (const [index, chunk] of chunks.entries()) {
            await secureStore.setItemAsync(
              chunkKey(baseKey, generation, index),
              chunk,
            );
            writtenChunks += 1;
          }

          await secureStore.setItemAsync(
            keyManifest,
            JSON.stringify(newManifest),
          );
        } catch (writeError) {
          const cleanupErrors: unknown[] = [];

          for (let index = 0; index < writtenChunks; index += 1) {
            try {
              await secureStore.deleteItemAsync(
                chunkKey(baseKey, generation, index),
              );
            } catch (cleanupError) {
              cleanupErrors.push(cleanupError);
            }
          }

          if (cleanupErrors.length > 0) {
            throw new AggregateError(
              [writeError, ...cleanupErrors],
              "Could not persist or clean up the secure authentication session.",
              { cause: writeError },
            );
          }

          throw new Error(
            "Could not persist the secure authentication session.",
            {
              cause: writeError,
            },
          );
        }

        if (previousManifest) {
          await deleteGeneration(baseKey, previousManifest);
        }
      });
    },

    removeItem(key: string): Promise<void> {
      const baseKey = baseKeyFor(key);

      return serialize(async () => {
        const manifest = await readManifest(baseKey);

        if (!manifest) {
          return;
        }

        await secureStore.deleteItemAsync(manifestKey(baseKey));
        await deleteGeneration(baseKey, manifest);
      });
    },
  };
}
