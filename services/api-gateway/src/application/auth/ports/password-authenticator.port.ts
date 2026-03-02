export const PASSWORD_AUTHENTICATOR = Symbol('PASSWORD_AUTHENTICATOR');

export interface PasswordAuthenticatorInput {
  username: string;
  password: string;
}

export interface PasswordAuthenticator {
  exchangePasswordForAccessToken(input: PasswordAuthenticatorInput): Promise<string>;
}
