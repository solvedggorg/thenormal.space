import {
  AuthenticationInput,
  AuthenticationResponse,
  AuthIdentityProviderService,
  Logger,
} from "@medusajs/framework/types";
import { AbstractAuthModuleProvider, MedusaError } from "@medusajs/framework/utils";
import { randomBytes } from "crypto";
import {
  assertAllowedEmail,
  GENERIC_AUTH_ERROR,
  upsertAuthIdentity,
} from "../auth-shared";
import {
  buildAuthorizationUrl,
  resolveRedirectUri,
  mergeProfiles,
  normalizeIssuer,
  profileFromClaims,
  randomOidcValue,
  tokenEndpoint,
  userinfoEndpoint,
  userMetadataFromProfile,
  verifyJumpCloudIdToken,
  type JumpCloudOptions,
  type JumpCloudOidcState,
  type JumpCloudProfile,
} from "./oidc";

type InjectedDependencies = {
  logger: Logger;
};

class JumpCloudAuthService extends AbstractAuthModuleProvider {
  static identifier = "jumpcloud";
  static DISPLAY_NAME = "JumpCloud";

  protected logger_: Logger;
  protected options_: JumpCloudOptions;

  static validateOptions(options: JumpCloudOptions): void {
    if (!options?.clientId) {
      throw new Error("JumpCloud clientId is required");
    }
    if (!options?.clientSecret) {
      throw new Error("JumpCloud clientSecret is required");
    }
    if (!options?.redirectUri) {
      throw new Error("JumpCloud redirectUri is required");
    }
  }

  constructor({ logger }: InjectedDependencies, options: JumpCloudOptions) {
    // @ts-expect-error Medusa provider constructor
    super(...arguments);
    this.logger_ = logger;
    this.options_ = options;
  }

  protected issuer(): string {
    return normalizeIssuer(this.options_.issuer);
  }

  async register(): Promise<AuthenticationResponse> {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "JumpCloud does not support registration. Use method `authenticate` instead.",
    );
  }

  async authenticate(
    data: AuthenticationInput,
    authIdentityService: AuthIdentityProviderService,
  ): Promise<AuthenticationResponse> {
    const callbackUrl = resolveRedirectUri(
      typeof data.body?.callback_url === "string" ? data.body.callback_url : undefined,
      this.options_.redirectUri,
      this.options_.allowedCallbackUrls,
    );
    if (!callbackUrl) {
      return { success: false, error: "The provided callback URL is not allowed" };
    }

    const state = randomBytes(32).toString("hex");
    const nonce = randomOidcValue(24);
    const verifier = randomOidcValue(32);
    await authIdentityService.setState(state, {
      callback_url: callbackUrl,
      nonce,
      code_verifier: verifier,
    } satisfies JumpCloudOidcState, 600);

    return {
      success: true,
      location: buildAuthorizationUrl({
        issuer: this.issuer(),
        clientId: this.options_.clientId,
        redirectUri: callbackUrl,
        state,
        nonce,
        verifier,
      }),
    };
  }

  async validateCallback(
    data: AuthenticationInput,
    authIdentityService: AuthIdentityProviderService,
  ): Promise<AuthenticationResponse> {
    const query = data.query ?? {};
    const body = data.body ?? {};
    if (query.error) {
      this.logger_?.debug?.(`[jumpcloud] Identity provider returned ${query.error}`);
      return { success: false, error: GENERIC_AUTH_ERROR };
    }

    const code = query.code || body.code;
    const stateKey = query.state || body.state;
    if (!code) {
      return { success: false, error: "No code provided" };
    }
    if (!stateKey) {
      return { success: false, error: "No state provided, or session expired" };
    }

    const state = (await authIdentityService.getState(stateKey)) as JumpCloudOidcState | null;
    if (!state?.callback_url || !state.nonce || !state.code_verifier) {
      return { success: false, error: "No state provided, or session expired" };
    }

    try {
      const profile = await this.exchange_(code, state);
      if (!profile.entityId || !profile.email) {
        return { success: false, error: GENERIC_AUTH_ERROR };
      }
      if (this.options_.requireVerifiedEmail && !profile.email_verified) {
        return { success: false, error: GENERIC_AUTH_ERROR };
      }
      assertAllowedEmail(profile.email, this.options_.allowedEmailDomains);
      const authIdentity = await upsertAuthIdentity(
        authIdentityService,
        profile.entityId,
        userMetadataFromProfile(profile),
      );
      return { success: true, authIdentity };
    } catch (error) {
      this.logger_?.error(`JumpCloud authentication error: ${error?.message || error}`);
      return { success: false, error: GENERIC_AUTH_ERROR };
    }
  }

  protected async exchange_(code: string, state: JumpCloudOidcState): Promise<JumpCloudProfile> {
    const params = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: state.callback_url,
      client_id: this.options_.clientId,
      client_secret: this.options_.clientSecret,
      code_verifier: state.code_verifier,
    });
    const tokenResponse = await fetch(tokenEndpoint(this.issuer()), {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: params.toString(),
    });
    if (!tokenResponse.ok) {
      throw new Error(`JumpCloud token exchange failed (${tokenResponse.status})`);
    }
    const tokens = (await tokenResponse.json()) as {
      id_token?: string;
      access_token?: string;
    };
    if (!tokens.id_token) {
      throw new Error("JumpCloud did not return an ID token");
    }
    const claims = await verifyJumpCloudIdToken(tokens.id_token, {
      issuer: this.issuer(),
      clientId: this.options_.clientId,
      nonce: state.nonce,
      jwtKey: this.options_.jwtKey,
    });
    const fromIdToken = profileFromClaims(claims);
    if (fromIdToken.email && fromIdToken.entityId) {
      return fromIdToken;
    }
    if (!tokens.access_token) {
      return fromIdToken;
    }
    const userinfo = await this.userinfo_(tokens.access_token);
    return mergeProfiles(fromIdToken, userinfo);
  }

  protected async userinfo_(accessToken: string): Promise<Partial<JumpCloudProfile>> {
    const response = await fetch(userinfoEndpoint(this.issuer()), {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    });
    if (!response.ok) {
      return {};
    }
    const body = (await response.json()) as import("jose").JWTPayload;
    return profileFromClaims(body);
  }
}

export default JumpCloudAuthService;
