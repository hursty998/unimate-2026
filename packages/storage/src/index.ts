export type ObjectStorageFailureKind =
  "unavailable" | "rejected" | "invalid-response";

export class ObjectStorageError extends Error {
  readonly status: number | undefined;

  constructor(
    readonly kind: ObjectStorageFailureKind,
    message: string,
    options?: ErrorOptions & { status?: number },
  ) {
    super(message, options);
    this.name = "ObjectStorageError";
    this.status = options?.status;
  }
}

declare const objectKeyBrand: unique symbol;

export type ObjectKey = string & {
  readonly [objectKeyBrand]: "ObjectKey";
};

export function parseObjectKey(value: string): ObjectKey {
  const segments = value.split("/");

  if (
    value.length === 0 ||
    value.length > 1024 ||
    segments.some(
      (segment) =>
        segment.length === 0 ||
        segment === "." ||
        segment === ".." ||
        !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(segment),
    )
  ) {
    throw new TypeError(
      "Object keys must be relative slash-separated ASCII path segments without empty or traversal segments.",
    );
  }

  return value as ObjectKey;
}

export interface UploadPermission {
  readonly url: string;
  readonly method: "PUT";
  readonly headers: Readonly<Record<string, string>>;
  readonly expiresAt: Date;
}

export interface ReadPermission {
  readonly url: string;
  readonly expiresAt: Date;
}

export interface StoredObjectMetadata {
  readonly contentType: string;
  readonly sizeBytes: number;
}

export interface ObjectStorage {
  createUploadPermission(input: {
    key: ObjectKey;
    contentType: string;
  }): Promise<UploadPermission>;
  createReadPermission(input: {
    key: ObjectKey;
    expiresInSeconds: number;
  }): Promise<ReadPermission>;
  getObjectMetadata(key: ObjectKey): Promise<StoredObjectMetadata | null>;
  deleteObject(key: ObjectKey): Promise<void>;
}
