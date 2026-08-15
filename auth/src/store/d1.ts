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

export function createD1Store(db: D1Database): AuthStore {
  return {
    async getUserById(id) {
      return db.prepare("SELECT * FROM users WHERE id = ?").bind(id).first<User>();
    },
    async getUserByEmail(email) {
      return db.prepare("SELECT * FROM users WHERE email = ?").bind(email.toLowerCase()).first<User>();
    },
    async getUserByClerkId(clerkUserId) {
      return db.prepare("SELECT * FROM users WHERE clerk_user_id = ?").bind(clerkUserId).first<User>();
    },
    async createUser(user) {
      await db
        .prepare(
          `INSERT INTO users (id, email, name, status, email_verified_at, clerk_user_id, created_at, updated_at, last_login_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          user.id,
          user.email,
          user.name,
          user.status,
          user.email_verified_at,
          user.clerk_user_id,
          user.created_at,
          user.updated_at,
          user.last_login_at,
        )
        .run();
      return user;
    },
    async updateUser(id, patch) {
      const current = await db.prepare("SELECT * FROM users WHERE id = ?").bind(id).first<User>();
      if (!current) return null;
      const next = { ...current, ...patch };
      await db
        .prepare(
          `UPDATE users SET email = ?, name = ?, status = ?, email_verified_at = ?, clerk_user_id = ?, updated_at = ?, last_login_at = ? WHERE id = ?`,
        )
        .bind(
          next.email,
          next.name,
          next.status,
          next.email_verified_at,
          next.clerk_user_id,
          next.updated_at,
          next.last_login_at,
          id,
        )
        .run();
      return next;
    },
    async listUsers({ q, limit, offset }) {
      if (q) {
        const like = `%${q.toLowerCase()}%`;
        const res = await db
          .prepare(
            `SELECT * FROM users WHERE lower(email) LIKE ? OR lower(coalesce(name,'')) LIKE ?
             ORDER BY created_at DESC LIMIT ? OFFSET ?`,
          )
          .bind(like, like, limit, offset)
          .all<User>();
        return res.results;
      }
      const res = await db
        .prepare("SELECT * FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?")
        .bind(limit, offset)
        .all<User>();
      return res.results;
    },
    async countUsers(q) {
      if (q) {
        const like = `%${q.toLowerCase()}%`;
        const row = await db
          .prepare("SELECT count(*) as n FROM users WHERE lower(email) LIKE ? OR lower(coalesce(name,'')) LIKE ?")
          .bind(like, like)
          .first<{ n: number }>();
        return row?.n ?? 0;
      }
      const row = await db.prepare("SELECT count(*) as n FROM users").first<{ n: number }>();
      return row?.n ?? 0;
    },

    async listPasskeys(userId) {
      const res = await db.prepare("SELECT * FROM passkeys WHERE user_id = ? ORDER BY created_at").bind(userId).all<Passkey>();
      return res.results;
    },
    async getPasskeyByCredentialId(credentialId) {
      return db.prepare("SELECT * FROM passkeys WHERE credential_id = ?").bind(credentialId).first<Passkey>();
    },
    async createPasskey(passkey) {
      await db
        .prepare(
          `INSERT INTO passkeys (id, user_id, credential_id, public_key, counter, transports, aaguid, name, created_at, last_used_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          passkey.id,
          passkey.user_id,
          passkey.credential_id,
          passkey.public_key,
          passkey.counter,
          passkey.transports,
          passkey.aaguid,
          passkey.name,
          passkey.created_at,
          passkey.last_used_at,
        )
        .run();
      return passkey;
    },
    async updatePasskey(id, patch) {
      const current = await db.prepare("SELECT * FROM passkeys WHERE id = ?").bind(id).first<Passkey>();
      if (!current) return;
      const next = { ...current, ...patch };
      await db
        .prepare("UPDATE passkeys SET counter = ?, last_used_at = ?, name = ? WHERE id = ?")
        .bind(next.counter, next.last_used_at, next.name, id)
        .run();
    },
    async deletePasskey(id, userId) {
      const res = await db.prepare("DELETE FROM passkeys WHERE id = ? AND user_id = ?").bind(id, userId).run();
      return (res.meta.changes || 0) > 0;
    },

    async getTotp(userId) {
      return db.prepare("SELECT * FROM totp_factors WHERE user_id = ?").bind(userId).first<TotpFactor>();
    },
    async upsertTotp(factor) {
      await db
        .prepare(
          `INSERT INTO totp_factors (user_id, secret, verified_at, created_at) VALUES (?, ?, ?, ?)
           ON CONFLICT(user_id) DO UPDATE SET secret = excluded.secret, verified_at = excluded.verified_at`,
        )
        .bind(factor.user_id, factor.secret, factor.verified_at, factor.created_at)
        .run();
    },
    async deleteTotp(userId) {
      await db.prepare("DELETE FROM totp_factors WHERE user_id = ?").bind(userId).run();
    },

    async replaceRecoveryCodes(userId, hashes) {
      await db.prepare("DELETE FROM recovery_codes WHERE user_id = ?").bind(userId).run();
      for (const row of hashes) {
        await db
          .prepare("INSERT INTO recovery_codes (id, user_id, code_hash, used_at) VALUES (?, ?, ?, NULL)")
          .bind(row.id, userId, row.code_hash)
          .run();
      }
    },
    async consumeRecoveryCode(userId, codeHash) {
      const row = await db
        .prepare("SELECT id FROM recovery_codes WHERE user_id = ? AND code_hash = ? AND used_at IS NULL")
        .bind(userId, codeHash)
        .first<{ id: string }>();
      if (!row) return false;
      await db.prepare("UPDATE recovery_codes SET used_at = ? WHERE id = ?").bind(new Date().toISOString(), row.id).run();
      return true;
    },
    async unusedRecoveryCount(userId) {
      const row = await db
        .prepare("SELECT count(*) as n FROM recovery_codes WHERE user_id = ? AND used_at IS NULL")
        .bind(userId)
        .first<{ n: number }>();
      return row?.n ?? 0;
    },

    async createEmailChallenge(row) {
      await db
        .prepare(
          `INSERT INTO email_challenges (id, email, purpose, token_hash, expires_at, consumed_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(row.id, row.email, row.purpose, row.token_hash, row.expires_at, row.consumed_at, row.created_at)
        .run();
    },
    async consumeEmailChallenge(tokenHash, now) {
      const row = await db
        .prepare("SELECT * FROM email_challenges WHERE token_hash = ? AND consumed_at IS NULL")
        .bind(tokenHash)
        .first<EmailChallenge>();
      if (!row) return null;
      if (Date.parse(row.expires_at) <= Date.parse(now)) return null;
      await db.prepare("UPDATE email_challenges SET consumed_at = ? WHERE id = ?").bind(now, row.id).run();
      return { ...row, consumed_at: now };
    },

    async createSession(session) {
      await db
        .prepare(
          `INSERT INTO sessions (id, user_id, aal, amr, expires_at, created_at, ip, ua, revoked_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          session.id,
          session.user_id,
          session.aal,
          session.amr,
          session.expires_at,
          session.created_at,
          session.ip,
          session.ua,
          session.revoked_at,
        )
        .run();
      return session;
    },
    async getSession(id) {
      return db.prepare("SELECT * FROM sessions WHERE id = ?").bind(id).first<Session>();
    },
    async updateSession(id, patch) {
      const current = await db.prepare("SELECT * FROM sessions WHERE id = ?").bind(id).first<Session>();
      if (!current) return;
      const next = { ...current, ...patch };
      await db
        .prepare("UPDATE sessions SET aal = ?, amr = ?, expires_at = ?, revoked_at = ? WHERE id = ?")
        .bind(next.aal, next.amr, next.expires_at, next.revoked_at, id)
        .run();
    },
    async revokeSession(id, now) {
      await db.prepare("UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL").bind(now, id).run();
    },
    async revokeUserSessions(userId, now) {
      const res = await db
        .prepare("UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL")
        .bind(now, userId)
        .run();
      return res.meta.changes || 0;
    },
    async listUserSessions(userId) {
      const res = await db
        .prepare("SELECT * FROM sessions WHERE user_id = ? ORDER BY created_at DESC")
        .bind(userId)
        .all<Session>();
      return res.results;
    },

    async createClient(client) {
      await db
        .prepare(
          `INSERT INTO oauth_clients (id, client_id, client_secret_hash, name, type, redirect_uris, grant_types, scopes, first_party, token_endpoint_auth_method, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          client.id,
          client.client_id,
          client.client_secret_hash,
          client.name,
          client.type,
          client.redirect_uris,
          client.grant_types,
          client.scopes,
          client.first_party,
          client.token_endpoint_auth_method,
          client.created_at,
          client.updated_at,
        )
        .run();
      return client;
    },
    async getClient(id) {
      return db.prepare("SELECT * FROM oauth_clients WHERE id = ?").bind(id).first<OAuthClient>();
    },
    async getClientByClientId(clientId) {
      return db.prepare("SELECT * FROM oauth_clients WHERE client_id = ?").bind(clientId).first<OAuthClient>();
    },
    async listClients() {
      const res = await db.prepare("SELECT * FROM oauth_clients ORDER BY created_at DESC").all<OAuthClient>();
      return res.results;
    },
    async updateClient(id, patch) {
      const current = await db.prepare("SELECT * FROM oauth_clients WHERE id = ?").bind(id).first<OAuthClient>();
      if (!current) return null;
      const next = { ...current, ...patch };
      await db
        .prepare(
          `UPDATE oauth_clients SET name = ?, redirect_uris = ?, grant_types = ?, scopes = ?, first_party = ?,
           token_endpoint_auth_method = ?, client_secret_hash = ?, updated_at = ? WHERE id = ?`,
        )
        .bind(
          next.name,
          next.redirect_uris,
          next.grant_types,
          next.scopes,
          next.first_party,
          next.token_endpoint_auth_method,
          next.client_secret_hash,
          next.updated_at,
          id,
        )
        .run();
      return next;
    },
    async deleteClient(id) {
      const res = await db.prepare("DELETE FROM oauth_clients WHERE id = ?").bind(id).run();
      return (res.meta.changes || 0) > 0;
    },

    async createCode(code) {
      await db
        .prepare(
          `INSERT INTO oauth_codes (id, code_hash, client_id, user_id, session_id, redirect_uri, scope, nonce, code_challenge, code_challenge_method, auth_time, amr, expires_at, consumed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          code.id,
          code.code_hash,
          code.client_id,
          code.user_id,
          code.session_id,
          code.redirect_uri,
          code.scope,
          code.nonce,
          code.code_challenge,
          code.code_challenge_method,
          code.auth_time,
          code.amr,
          code.expires_at,
          code.consumed_at,
        )
        .run();
    },
    async consumeCode(codeHash, now) {
      const row = await db
        .prepare("SELECT * FROM oauth_codes WHERE code_hash = ? AND consumed_at IS NULL")
        .bind(codeHash)
        .first<OAuthCode>();
      if (!row) return null;
      if (Date.parse(row.expires_at) <= Date.parse(now)) return null;
      await db.prepare("UPDATE oauth_codes SET consumed_at = ? WHERE id = ?").bind(now, row.id).run();
      return { ...row, consumed_at: now };
    },

    async createToken(token) {
      await db
        .prepare(
          `INSERT INTO oauth_tokens (id, token_hash, type, client_id, user_id, scope, expires_at, revoked_at, family_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          token.id,
          token.token_hash,
          token.type,
          token.client_id,
          token.user_id,
          token.scope,
          token.expires_at,
          token.revoked_at,
          token.family_id,
          token.created_at,
        )
        .run();
    },
    async getTokenByHash(tokenHash) {
      return db.prepare("SELECT * FROM oauth_tokens WHERE token_hash = ?").bind(tokenHash).first<OAuthToken>();
    },
    async revokeToken(tokenHash, now) {
      await db
        .prepare("UPDATE oauth_tokens SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL")
        .bind(now, tokenHash)
        .run();
    },
    async revokeFamily(familyId, now) {
      await db
        .prepare("UPDATE oauth_tokens SET revoked_at = ? WHERE family_id = ? AND revoked_at IS NULL")
        .bind(now, familyId)
        .run();
    },
    async revokeUserTokens(userId, now) {
      await db
        .prepare("UPDATE oauth_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL")
        .bind(now, userId)
        .run();
    },

    async getConsent(userId, clientId) {
      return db
        .prepare("SELECT * FROM oauth_consents WHERE user_id = ? AND client_id = ?")
        .bind(userId, clientId)
        .first<Consent>();
    },
    async putConsent(consent) {
      await db
        .prepare(
          `INSERT INTO oauth_consents (user_id, client_id, scope, created_at) VALUES (?, ?, ?, ?)
           ON CONFLICT(user_id, client_id) DO UPDATE SET scope = excluded.scope, created_at = excluded.created_at`,
        )
        .bind(consent.user_id, consent.client_id, consent.scope, consent.created_at)
        .run();
    },

    async addAudit(event) {
      await db
        .prepare(
          `INSERT INTO audit_events (id, actor_type, actor_id, action, target_type, target_id, meta, ip, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          event.id,
          event.actor_type,
          event.actor_id,
          event.action,
          event.target_type,
          event.target_id,
          event.meta,
          event.ip,
          event.created_at,
        )
        .run();
    },
    async listAudit(limit, offset) {
      const res = await db
        .prepare("SELECT * FROM audit_events ORDER BY created_at DESC LIMIT ? OFFSET ?")
        .bind(limit, offset)
        .all<AuditEvent>();
      return res.results;
    },
  };
}
