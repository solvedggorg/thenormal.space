import type {
  AuditEvent,
  AuthStore,
  Consent,
  EmailChallenge,
  OAuthClient,
  OAuthCode,
  OAuthToken,
  Passkey,
  Session,
  TotpFactor,
  User,
} from "./types";

function copy<T>(value: T): T {
  return structuredClone(value);
}

export function createMemoryStore(): AuthStore {
  const users: User[] = [];
  const passkeys: Passkey[] = [];
  const totp: TotpFactor[] = [];
  const recovery: { id: string; user_id: string; code_hash: string; used_at: string | null }[] = [];
  const emails: EmailChallenge[] = [];
  const sessions: Session[] = [];
  const clients: OAuthClient[] = [];
  const codes: OAuthCode[] = [];
  const tokens: OAuthToken[] = [];
  const consents: Consent[] = [];
  const audit: AuditEvent[] = [];

  return {
    async getUserById(id) {
      return copy(users.find((u) => u.id === id) ?? null);
    },
    async getUserByEmail(email) {
      const needle = email.toLowerCase();
      return copy(users.find((u) => u.email.toLowerCase() === needle) ?? null);
    },
    async getUserByClerkId(clerkUserId) {
      return copy(users.find((u) => u.clerk_user_id === clerkUserId) ?? null);
    },
    async createUser(user) {
      users.push(copy(user));
      return copy(user);
    },
    async updateUser(id, patch) {
      const user = users.find((u) => u.id === id);
      if (!user) return null;
      Object.assign(user, patch);
      return copy(user);
    },
    async listUsers({ q, limit, offset }) {
      let rows = [...users].sort((a, b) => b.created_at.localeCompare(a.created_at));
      if (q) {
        const needle = q.toLowerCase();
        rows = rows.filter((u) => u.email.toLowerCase().includes(needle) || (u.name || "").toLowerCase().includes(needle));
      }
      return rows.slice(offset, offset + limit).map(copy);
    },
    async countUsers(q) {
      if (!q) return users.length;
      const needle = q.toLowerCase();
      return users.filter((u) => u.email.toLowerCase().includes(needle) || (u.name || "").toLowerCase().includes(needle))
        .length;
    },

    async listPasskeys(userId) {
      return passkeys.filter((p) => p.user_id === userId).map(copy);
    },
    async getPasskeyByCredentialId(credentialId) {
      return copy(passkeys.find((p) => p.credential_id === credentialId) ?? null);
    },
    async createPasskey(passkey) {
      passkeys.push(copy(passkey));
      return copy(passkey);
    },
    async updatePasskey(id, patch) {
      const row = passkeys.find((p) => p.id === id);
      if (row) Object.assign(row, patch);
    },
    async deletePasskey(id, userId) {
      const idx = passkeys.findIndex((p) => p.id === id && p.user_id === userId);
      if (idx < 0) return false;
      passkeys.splice(idx, 1);
      return true;
    },

    async getTotp(userId) {
      return copy(totp.find((t) => t.user_id === userId) ?? null);
    },
    async upsertTotp(factor) {
      const idx = totp.findIndex((t) => t.user_id === factor.user_id);
      if (idx >= 0) totp[idx] = copy(factor);
      else totp.push(copy(factor));
    },
    async deleteTotp(userId) {
      const idx = totp.findIndex((t) => t.user_id === userId);
      if (idx >= 0) totp.splice(idx, 1);
    },

    async replaceRecoveryCodes(userId, hashes) {
      for (let i = recovery.length - 1; i >= 0; i--) if (recovery[i].user_id === userId) recovery.splice(i, 1);
      for (const row of hashes) recovery.push({ id: row.id, user_id: userId, code_hash: row.code_hash, used_at: null });
    },
    async consumeRecoveryCode(userId, codeHash) {
      const row = recovery.find((r) => r.user_id === userId && r.code_hash === codeHash && !r.used_at);
      if (!row) return false;
      row.used_at = new Date().toISOString();
      return true;
    },
    async unusedRecoveryCount(userId) {
      return recovery.filter((r) => r.user_id === userId && !r.used_at).length;
    },

    async createEmailChallenge(row) {
      emails.push(copy(row));
    },
    async consumeEmailChallenge(tokenHash, now) {
      const row = emails.find((e) => e.token_hash === tokenHash && !e.consumed_at);
      if (!row) return null;
      if (Date.parse(row.expires_at) <= Date.parse(now)) return null;
      row.consumed_at = now;
      return copy(row);
    },

    async createSession(session) {
      sessions.push(copy(session));
      return copy(session);
    },
    async getSession(id) {
      return copy(sessions.find((s) => s.id === id) ?? null);
    },
    async updateSession(id, patch) {
      const row = sessions.find((s) => s.id === id);
      if (row) Object.assign(row, patch);
    },
    async revokeSession(id, now) {
      const row = sessions.find((s) => s.id === id);
      if (row && !row.revoked_at) row.revoked_at = now;
    },
    async revokeUserSessions(userId, now) {
      let n = 0;
      for (const row of sessions) {
        if (row.user_id === userId && !row.revoked_at) {
          row.revoked_at = now;
          n += 1;
        }
      }
      return n;
    },
    async listUserSessions(userId) {
      return sessions.filter((s) => s.user_id === userId).map(copy);
    },

    async createClient(client) {
      clients.push(copy(client));
      return copy(client);
    },
    async getClient(id) {
      return copy(clients.find((c) => c.id === id) ?? null);
    },
    async getClientByClientId(clientId) {
      return copy(clients.find((c) => c.client_id === clientId) ?? null);
    },
    async listClients() {
      return clients.map(copy);
    },
    async updateClient(id, patch) {
      const row = clients.find((c) => c.id === id);
      if (!row) return null;
      Object.assign(row, patch);
      return copy(row);
    },
    async deleteClient(id) {
      const idx = clients.findIndex((c) => c.id === id);
      if (idx < 0) return false;
      clients.splice(idx, 1);
      return true;
    },

    async createCode(code) {
      codes.push(copy(code));
    },
    async consumeCode(codeHash, now) {
      const row = codes.find((c) => c.code_hash === codeHash && !c.consumed_at);
      if (!row) return null;
      if (Date.parse(row.expires_at) <= Date.parse(now)) return null;
      row.consumed_at = now;
      return copy(row);
    },

    async createToken(token) {
      tokens.push(copy(token));
    },
    async getTokenByHash(tokenHash) {
      return copy(tokens.find((t) => t.token_hash === tokenHash) ?? null);
    },
    async revokeToken(tokenHash, now) {
      const row = tokens.find((t) => t.token_hash === tokenHash);
      if (row && !row.revoked_at) row.revoked_at = now;
    },
    async revokeFamily(familyId, now) {
      for (const row of tokens) {
        if (row.family_id === familyId && !row.revoked_at) row.revoked_at = now;
      }
    },
    async revokeUserTokens(userId, now) {
      for (const row of tokens) {
        if (row.user_id === userId && !row.revoked_at) row.revoked_at = now;
      }
    },

    async getConsent(userId, clientId) {
      return copy(consents.find((c) => c.user_id === userId && c.client_id === clientId) ?? null);
    },
    async putConsent(consent) {
      const idx = consents.findIndex((c) => c.user_id === consent.user_id && c.client_id === consent.client_id);
      if (idx >= 0) consents[idx] = copy(consent);
      else consents.push(copy(consent));
    },

    async addAudit(event) {
      audit.unshift(copy(event));
    },
    async listAudit(limit, offset) {
      return audit.slice(offset, offset + limit).map(copy);
    },
  };
}
