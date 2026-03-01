import { create } from 'zustand';
import type {
  AuthView,
  LoginResult,
  SessionMode,
  UserProfile,
} from '../types/auth';

interface UserSessionState {
  authView: AuthView;
  username: string;
  password: string;
  sessionMode: SessionMode;
  accessToken: string;
  currentUser: UserProfile | null;
  correlationPrefix: string;
  isAuthenticating: boolean;
  authError: string | null;
  setAuthView: (authView: AuthView) => void;
  setUsername: (username: string) => void;
  setPassword: (password: string) => void;
  setCorrelationPrefix: (correlationPrefix: string) => void;
  applyDemoCredentials: (username: string, password: string) => void;
  beginAuthentication: () => void;
  completeAuthentication: (result: LoginResult) => void;
  failAuthentication: (message: string) => void;
  clearAuthError: () => void;
  signOut: () => void;
}

export const useUserSessionStore = create<UserSessionState>((set) => ({
  authView: 'login',
  username: '',
  password: '',
  sessionMode: 'mock',
  accessToken: '',
  currentUser: null,
  correlationPrefix: 'user-web',
  isAuthenticating: false,
  authError: null,
  setAuthView: (authView) => set({ authView, authError: null }),
  setUsername: (username) => set({ username }),
  setPassword: (password) => set({ password }),
  setCorrelationPrefix: (correlationPrefix) => set({ correlationPrefix }),
  applyDemoCredentials: (username, password) =>
    set({
      username,
      password,
      authView: 'login',
      authError: null,
    }),
  beginAuthentication: () =>
    set({
      isAuthenticating: true,
      authError: null,
    }),
  completeAuthentication: (result) =>
    set({
      isAuthenticating: false,
      authError: null,
      sessionMode: result.sessionMode,
      accessToken: result.accessToken,
      currentUser: result.user,
      password: '',
    }),
  failAuthentication: (message) =>
    set({
      isAuthenticating: false,
      authError: message,
    }),
  clearAuthError: () => set({ authError: null }),
  signOut: () =>
    set({
      authView: 'login',
      username: '',
      password: '',
      sessionMode: 'mock',
      accessToken: '',
      currentUser: null,
      correlationPrefix: 'user-web',
      isAuthenticating: false,
      authError: null,
    }),
}));
