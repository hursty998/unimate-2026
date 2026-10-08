import type { JsonValue } from "./index.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function toJsonValue(
  value: unknown,
  ancestors = new WeakSet<object>(),
): JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return value;
  }

  if (typeof value !== "object" || ancestors.has(value)) {
    throw new TypeError("The queue message must be valid, acyclic JSON.");
  }

  ancestors.add(value);

  try {
    if (Array.isArray(value)) {
      const result: JsonValue[] = [];

      for (let index = 0; index < value.length; index += 1) {
        if (!(index in value)) {
          throw new TypeError(
            "The queue message must not contain array holes.",
          );
        }

        result.push(toJsonValue(value[index], ancestors));
      }

      return result;
    }

    if (
      !isRecord(value) ||
      (Object.getPrototypeOf(value) !== Object.prototype &&
        Object.getPrototypeOf(value) !== null)
    ) {
      throw new TypeError("The queue message must contain only JSON values.");
    }

    const result: Record<string, JsonValue> = {};

    for (const [key, entry] of Object.entries(value)) {
      Object.defineProperty(result, key, {
        value: toJsonValue(entry, ancestors),
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }

    return result;
  } finally {
    ancestors.delete(value);
  }
}
