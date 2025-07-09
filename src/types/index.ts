export type IdentityAndKeyManager = {
  hashedIdentity: string;
  hashedSeedUpdatedAt: string;
  passphraseEnhancementKey: string;
  backupEnhancementKey: string;
};

export type AuthSuccessMessage = {
  type: "AUTH_SUCCESS";
  data: {
    identityAndKeyManager: IdentityAndKeyManager;
  };
};

export type AuthFailureMessage = {
  type: "AUTH_FAILURE";
  error?: string;
};

export type RequestParentOriginMessage = {
  type: "REQUEST_PARENT_ORIGIN";
};

export type ProvideParentOriginMessage = {
  type: "PROVIDE_PARENT_ORIGIN";
  origin: string;
};

export type AuthMessage =
  | AuthSuccessMessage
  | AuthFailureMessage
  | RequestParentOriginMessage
  | ProvideParentOriginMessage;

export interface ApiRequest {
  endpoint: string;
  method: string;
  headers?: Record<string, string>;
  body?: unknown;
}
