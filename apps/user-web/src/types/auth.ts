export type SessionMode = 'mock' | 'bearer';

export type AuthProvider = 'demo' | 'keycloak';

export type AuthView = 'login' | 'register';

export interface UserProfile {
  username: string;
  firstName: string;
  lastName: string;
  displayName: string;
  email: string;
  roles: string[];
  authProvider: AuthProvider;
}

export interface LoginInput {
  username: string;
  password: string;
}

export interface LoginResult {
  sessionMode: SessionMode;
  accessToken: string;
  user: UserProfile;
}

export interface DemoAccountPreset {
  username: string;
  password: string;
  displayName: string;
  roleLabel: string;
  email: string;
  description: string;
}
