import { exportJWK, generateKeyPair, importJWK, SignJWT, jwtVerify, type JWK, type JWTPayload } from "jose";

export type SigningMaterial = {
  privateJwk: JWK;
  publicJwk: JWK;
  kid: string;
};

export async function generateSigningMaterial(): Promise<SigningMaterial> {
  const { privateKey, publicKey } = await generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true });
  const kid = crypto.randomUUID();
  const privateJwk = await exportJWK(privateKey);
  const publicJwk = await exportJWK(publicKey);
  privateJwk.kid = kid;
  privateJwk.alg = "EdDSA";
  privateJwk.use = "sig";
  publicJwk.kid = kid;
  publicJwk.alg = "EdDSA";
  publicJwk.use = "sig";
  return { privateJwk, publicJwk, kid };
}

export async function loadSigningMaterial(raw: string): Promise<SigningMaterial> {
  const privateJwk = JSON.parse(raw) as JWK;
  const kid = privateJwk.kid || "default";
  const publicJwk: JWK = {
    kty: privateJwk.kty,
    crv: privateJwk.crv,
    x: privateJwk.x,
    kid,
    alg: "EdDSA",
    use: "sig",
  };
  return { privateJwk: { ...privateJwk, kid, alg: "EdDSA", use: "sig" }, publicJwk, kid };
}

export function publicJwks(material: SigningMaterial): { keys: JWK[] } {
  return { keys: [material.publicJwk] };
}

export async function signJwt(
  material: SigningMaterial,
  payload: JWTPayload,
  extra: { issuer: string; audience?: string | string[]; expiresIn: string; subject?: string },
): Promise<string> {
  const key = await importJWK(material.privateJwk, "EdDSA");
  let jwt = new SignJWT(payload)
    .setProtectedHeader({ alg: "EdDSA", kid: material.kid, typ: "JWT" })
    .setIssuedAt()
    .setIssuer(extra.issuer)
    .setExpirationTime(extra.expiresIn)
    .setJti(crypto.randomUUID());
  if (extra.subject) jwt = jwt.setSubject(extra.subject);
  if (extra.audience) jwt = jwt.setAudience(extra.audience);
  return jwt.sign(key);
}

export async function verifyJwt(material: SigningMaterial, token: string, issuer: string, audience?: string) {
  const key = await importJWK(material.publicJwk, "EdDSA");
  return jwtVerify(token, key, { issuer, audience });
}
