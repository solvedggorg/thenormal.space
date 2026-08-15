export type UserStatus = "pending" | "active" | "disabled";

export type User = {
  id: string;
  email: string;
  name: string | null;
  status: UserStatus;
  email_verified_at: string | null;
  clerk_user_id: string | null;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
};

export type Passkey = {
  id: string;
  user_id: string;
  credential_id: string;
  public_key: string;
  counter: number;
  transports: string | null;
  aaguid: string | null;
  name: string | null;
  created_at: string;
  last_used_at: string | null;
};

export type TotpFactor = {
  user_id: string;
  secret: string;
  verified_at: string | null;
  created_at: string;
};

export type Session = {
  id: string;
  user_id: string;
  aal: 1 | 2;
  amr: string;
  expires_at: string;
  created_at: string;
  ip: string | null;
  ua: string | null;
  revoked_at: string | null;
};

export type ClientType = "public" | "confidential";

export type OAuthClient = {
  id: string;
  client_id: string;
  client_secret_hash: string | null;
  name: string;
  type: ClientType;
  redirect_uris: string;
  grant_types: string;
  scopes: string;
  first_party: number;
  token_endpoint_auth_method: string;
  created_at: string;
  updated_at: string;
};

export type OAuthCode = {
  id: string;
  code_hash: string;
  client_id: string;
  user_id: string;
  session_id: string;
  redirect_uri: string;
  scope: string;
  nonce: string | null;
  code_challenge: string;
  code_challenge_method: string;
  auth_time: string;
  amr: string;
  expires_at: string;
  consumed_at: string | null;
};

export type TokenType = "access" | "refresh";

export type OAuthToken = {
  id: string;
  token_hash: string;
  type: TokenType;
  client_id: string;
  user_id: string | null;
  scope: string;
  expires_at: string;
  revoked_at: string | null;
  family_id: string | null;
  created_at: string;
};

export type Consent = {
  user_id: string;
  client_id: string;
  scope: string;
  created_at: string;
};

export type AuditEvent = {
  id: string;
  actor_type: string;
  actor_id: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  meta: string | null;
  ip: string | null;
  created_at: string;
};

export type EmailChallenge = {
  id: string;
  email: string;
  purpose: "verify" | "login";
  token_hash: string;
  expires_at: string;
  consumed_at: string | null;
  created_at: string;
};

export type AuthStore = {
  getUserById(id: string): Promise<User | null>;
  getUserByEmail(email: string): Promise<User | null>;
  getUserByClerkId(clerkUserId: string): Promise<User | null>;
  createUser(user: User): Promise<User>;
  updateUser(id: string, patch: Partial<User>): Promise<User | null>;
  listUsers(opts: { q?: string; limit: number; offset: number }): Promise<User[]>;
  countUsers(q?: string): Promise<number>;

  listPasskeys(userId: string): Promise<Passkey[]>;
  getPasskeyByCredentialId(credentialId: string): Promise<Passkey | null>;
  createPasskey(passkey: Passkey): Promise<Passkey>;
  updatePasskey(id: string, patch: Partial<Passkey>): Promise<void>;
  deletePasskey(id: string, userId: string): Promise<boolean>;

  getTotp(userId: string): Promise<TotpFactor | null>;
  upsertTotp(factor: TotpFactor): Promise<void>;
  deleteTotp(userId: string): Promise<void>;

  replaceRecoveryCodes(userId: string, hashes: { id: string; code_hash: string }[]): Promise<void>;
  consumeRecoveryCode(userId: string, codeHash: string): Promise<boolean>;
  unusedRecoveryCount(userId: string): Promise<number>;

  createEmailChallenge(row: EmailChallenge): Promise<void>;
  consumeEmailChallenge(tokenHash: string, now: string): Promise<EmailChallenge | null>;

  createSession(session: Session): Promise<Session>;
  getSession(id: string): Promise<Session | null>;
  updateSession(id: string, patch: Partial<Session>): Promise<void>;
  revokeSession(id: string, now: string): Promise<void>;
  revokeUserSessions(userId: string, now: string): Promise<number>;
  listUserSessions(userId: string): Promise<Session[]>;

  createClient(client: OAuthClient): Promise<OAuthClient>;
  getClient(id: string): Promise<OAuthClient | null>;
  getClientByClientId(clientId: string): Promise<OAuthClient | null>;
  listClients(): Promise<OAuthClient[]>;
  updateClient(id: string, patch: Partial<OAuthClient>): Promise<OAuthClient | null>;
  deleteClient(id: string): Promise<boolean>;

  createCode(code: OAuthCode): Promise<void>;
  consumeCode(codeHash: string, now: string): Promise<OAuthCode | null>;

  createToken(token: OAuthToken): Promise<void>;
  getTokenByHash(tokenHash: string): Promise<OAuthToken | null>;
  revokeToken(tokenHash: string, now: string): Promise<void>;
  revokeFamily(familyId: string, now: string): Promise<void>;
  revokeUserTokens(userId: string, now: string): Promise<void>;

  getConsent(userId: string, clientId: string): Promise<Consent | null>;
  putConsent(consent: Consent): Promise<void>;

  addAudit(event: AuditEvent): Promise<void>;
  listAudit(limit: number, offset: number): Promise<AuditEvent[]>;
};
