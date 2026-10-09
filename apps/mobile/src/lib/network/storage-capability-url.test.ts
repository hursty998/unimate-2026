import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveStorageCapabilityUrl } from "./storage-capability-url.ts";

const localSignedUrl =
  "http://127.0.0.1:55321/storage/v1/object/sign/foundation-storage-proof/object.txt?token=part%2Ftwo&download=proof%20file.txt";

test("rewrites only local signed Storage capabilities to Android's existing host mapping", () => {
  const resolved = resolveStorageCapabilityUrl(
    localSignedUrl,
    "android",
    "http://10.0.2.2:55321",
    true,
  );

  assert.equal(
    resolved,
    "http://10.0.2.2:55321/storage/v1/object/sign/foundation-storage-proof/object.txt?token=part%2Ftwo&download=proof%20file.txt",
  );
});

test("uses the resolved loopback Supabase origin without changing web or iOS capability paths", () => {
  assert.equal(
    resolveStorageCapabilityUrl(
      localSignedUrl,
      "web",
      "http://localhost:55321",
      true,
    ),
    localSignedUrl.replace("http://127.0.0.1:55321", "http://localhost:55321"),
  );
  assert.equal(
    resolveStorageCapabilityUrl(
      localSignedUrl,
      "ios",
      "http://127.0.0.1:55321",
      true,
    ),
    localSignedUrl,
  );
});

test("rewrites a local signed Storage capability to a private Tailscale Supabase origin and preserves its path and query", () => {
  const capability =
    "http://127.0.0.1:55321/storage/v1/object/sign/bucket/folder%2Fproof%20file.txt?token=part%2Ftwo&download=proof%20file.txt";

  assert.equal(
    resolveStorageCapabilityUrl(
      capability,
      "ios",
      "https://mobile.tailnet.ts.net:8443",
      true,
    ),
    "https://mobile.tailnet.ts.net:8443/storage/v1/object/sign/bucket/folder%2Fproof%20file.txt?token=part%2Ftwo&download=proof%20file.txt",
  );
});

test("does not rewrite production HTTPS capabilities", () => {
  const productionUrl =
    "https://storage.example.test/storage/v1/object/sign/private/object.txt?token=opaque";

  assert.equal(
    resolveStorageCapabilityUrl(
      productionUrl,
      "android",
      "http://10.0.2.2:55321",
      false,
    ),
    productionUrl,
  );
});

test("does not rewrite nonlocal, wrong-port, or unsigned URLs", () => {
  const urls = [
    "http://192.168.1.10:55321/storage/v1/object/sign/bucket/key?token=abc",
    "http://127.0.0.1:55322/storage/v1/object/sign/bucket/key?token=abc",
    "http://127.0.0.1:55321/storage/v1/object/sign/bucket/key",
    "http://127.0.0.1:55321/auth/v1/user?token=abc",
  ];

  for (const url of urls) {
    assert.equal(
      resolveStorageCapabilityUrl(
        url,
        "android",
        "http://10.0.2.2:55321",
        true,
      ),
      url,
    );
  }
});

test("rejects an unsafe configured Android Supabase origin for local signed capabilities", () => {
  assert.throws(
    () =>
      resolveStorageCapabilityUrl(
        localSignedUrl,
        "android",
        "http://127.0.0.1:55321",
        true,
      ),
    /platform's configured local Supabase origin/,
  );
  assert.throws(
    () =>
      resolveStorageCapabilityUrl(
        localSignedUrl,
        "android",
        "http://10.0.2.2:54321",
        true,
      ),
    /platform's configured local Supabase origin/,
  );
});

test("rejects arbitrary HTTPS, wrong-port Tailscale, and lookalike HTTPS origins", () => {
  const origins = [
    "https://storage.example.test:8443",
    "https://mobile.tailnet.ts.net",
    "https://mobile.tailnet.ts.net:443",
    "https://mobile.tailnet.ts.net:9443",
    "https://example.ts.net.evil.test:8443",
    "https://ts.net:8443",
  ];

  for (const origin of origins) {
    assert.throws(
      () => resolveStorageCapabilityUrl(localSignedUrl, "ios", origin, true),
      /configured local Supabase origin/,
      origin,
    );
  }
});
