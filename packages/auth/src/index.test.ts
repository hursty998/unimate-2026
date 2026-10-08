import assert from "node:assert/strict";
import type { KeyObject } from "node:crypto";
import { once } from "node:events";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { createSupabaseAccessTokenVerifier } from "./index.js";

const ISSUER = "/auth/v1";
const AUDIENCE = "authenticated";
const EXPIRATION = Math.floor(Date.now() / 1000) + 300;

const [ecKeyPair, rsaKeyPair, untrustedKeyPair] = await Promise.all([
  generateKeyPair("ES256"),
  generateKeyPair("RS256"),
  generateKeyPair("ES256"),
]);

const ecJwk = await exportJWK(ecKeyPair.publicKey);
const rsaJwk = await exportJWK(rsaKeyPair.publicKey);

ecJwk.kid = "local-es256-key";
ecJwk.alg = "ES256";
ecJwk.use = "sig";
rsaJwk.kid = "local-rs256-key";
rsaJwk.alg = "RS256";
rsaJwk.use = "sig";

const server: Server = createServer((request, response) => {
  if (request.url !== `${ISSUER}/.well-known/jwks.json`) {
    response.writeHead(404).end();
    return;
  }

  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify({ keys: [ecJwk, rsaJwk] }));
});

let supabaseUrl: string;

before(async () => {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  const address = server.address() as AddressInfo;
  supabaseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
    server.closeAllConnections();
  });
});

async function signAccessToken({
  privateKey,
  algorithm = "ES256",
  keyId = "local-es256-key",
  issuer = `${supabaseUrl}${ISSUER}`,
  audience = AUDIENCE,
  subject = "provider-user-123",
  expiration = EXPIRATION,
  notBefore,
}: {
  privateKey: CryptoKey | KeyObject | Uint8Array;
  algorithm?: "ES256" | "RS256" | "HS256";
  keyId?: string;
  issuer?: string;
  audience?: string;
  subject?: string;
  expiration?: number;
  notBefore?: number;
}) {
  const jwt = new SignJWT({ role: "authenticated" }).setProtectedHeader({
    alg: algorithm,
    kid: keyId,
    typ: "JWT",
  });

  if (subject !== undefined) {
    jwt.setSubject(subject);
  }

  return jwt
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime(expiration)
    .setNotBefore(notBefore ?? Math.floor(Date.now() / 1000) - 1)
    .sign(privateKey);
}

function verifier() {
  return createSupabaseAccessTokenVerifier({
    supabaseUrl,
    audience: AUDIENCE,
  });
}

test("accepts a valid ES256 JWT and returns only its verified subject", async () => {
  const token = await signAccessToken({ privateKey: ecKeyPair.privateKey });

  assert.deepEqual(await verifier().verify(token), {
    provider: "SUPABASE",
    providerSubject: "provider-user-123",
  });
});

test("accepts the other currently supported asymmetric algorithm", async () => {
  const token = await signAccessToken({
    privateKey: rsaKeyPair.privateKey,
    algorithm: "RS256",
    keyId: "local-rs256-key",
  });

  assert.deepEqual(await verifier().verify(token), {
    provider: "SUPABASE",
    providerSubject: "provider-user-123",
  });
});

test("rejects a JWT with the wrong issuer", async () => {
  const token = await signAccessToken({
    privateKey: ecKeyPair.privateKey,
    issuer: "https://attacker.example/auth/v1",
  });

  await assert.rejects(verifier().verify(token));
});

test("rejects a JWT with the wrong audience", async () => {
  const token = await signAccessToken({
    privateKey: ecKeyPair.privateKey,
    audience: "anon",
  });

  await assert.rejects(verifier().verify(token));
});

test("rejects an expired JWT", async () => {
  const token = await signAccessToken({
    privateKey: ecKeyPair.privateKey,
    expiration: Math.floor(Date.now() / 1000) - 60,
  });

  await assert.rejects(verifier().verify(token));
});

test("rejects a JWT whose not-before time is in the future", async () => {
  const token = await signAccessToken({
    privateKey: ecKeyPair.privateKey,
    notBefore: Math.floor(Date.now() / 1000) + 60,
  });

  await assert.rejects(verifier().verify(token));
});

test("rejects missing and empty subjects", async () => {
  const missingSubject = await new SignJWT({ role: "authenticated" })
    .setProtectedHeader({ alg: "ES256", kid: "local-es256-key" })
    .setIssuer(`${supabaseUrl}${ISSUER}`)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(EXPIRATION)
    .sign(ecKeyPair.privateKey);
  const emptySubject = await signAccessToken({
    privateKey: ecKeyPair.privateKey,
    subject: "",
  });

  await assert.rejects(verifier().verify(missingSubject));
  await assert.rejects(verifier().verify(emptySubject));
});

test("rejects malformed tokens", async () => {
  await assert.rejects(verifier().verify("not-a-jwt"));
});

test("rejects a signature from an untrusted key using a known key id", async () => {
  const token = await signAccessToken({
    privateKey: untrustedKeyPair.privateKey,
  });

  await assert.rejects(verifier().verify(token));
});

test("does not accept HS256 through the asymmetric verifier", async () => {
  const token = await signAccessToken({
    privateKey: new TextEncoder().encode("test-only-shared-secret"),
    algorithm: "HS256",
    keyId: "legacy-shared-secret",
  });

  await assert.rejects(verifier().verify(token));
});
