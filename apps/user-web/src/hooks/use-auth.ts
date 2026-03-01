import { startTransition } from 'react';
import { listDemoAccounts, signIn } from '../api/auth-api';
import type { ApiSession } from '../api/http-client';
import { userWebConfig } from '../config/user-web-config';
import { useUserSessionStore } from '../stores/auth-store';
import { useUploadWorkspaceStore } from '../stores/uploads-store';
import type { AuthView, DemoAccountPreset } from '../types/auth';

export function useAuthController(): {
  session: ApiSession;
  isAuthenticated: boolean;
  currentUserName: string;
  username: string;
  password: string;
  authView: AuthView;
  correlationPrefix: string;
  isAuthenticating: boolean;
  authError: string | null;
  authProvider: 'demo' | 'keycloak';
  demoAccounts: DemoAccountPreset[];
  setUsername: (username: string) => void;
  setPassword: (password: string) => void;
  setCorrelationPrefix: (correlationPrefix: string) => void;
  submitLogin: () => Promise<void>;
  goToLogin: () => void;
  goToRegister: () => void;
  applyDemoAccount: (account: DemoAccountPreset) => void;
  clearAuthError: () => void;
  signOut: () => void;
} {
  const authView = useUserSessionStore((state) => state.authView);
  const username = useUserSessionStore((state) => state.username);
  const password = useUserSessionStore((state) => state.password);
  const sessionMode = useUserSessionStore((state) => state.sessionMode);
  const accessToken = useUserSessionStore((state) => state.accessToken);
  const currentUser = useUserSessionStore((state) => state.currentUser);
  const correlationPrefix = useUserSessionStore((state) => state.correlationPrefix);
  const isAuthenticating = useUserSessionStore((state) => state.isAuthenticating);
  const authError = useUserSessionStore((state) => state.authError);
  const setAuthView = useUserSessionStore((state) => state.setAuthView);
  const setUsername = useUserSessionStore((state) => state.setUsername);
  const setPassword = useUserSessionStore((state) => state.setPassword);
  const setCorrelationPrefix = useUserSessionStore((state) => state.setCorrelationPrefix);
  const applyDemoCredentials = useUserSessionStore((state) => state.applyDemoCredentials);
  const beginAuthentication = useUserSessionStore((state) => state.beginAuthentication);
  const completeAuthentication = useUserSessionStore((state) => state.completeAuthentication);
  const failAuthentication = useUserSessionStore((state) => state.failAuthentication);
  const clearAuthError = useUserSessionStore((state) => state.clearAuthError);
  const signOutFromStore = useUserSessionStore((state) => state.signOut);
  const resetWorkspace = useUploadWorkspaceStore((state) => state.resetWorkspace);

  return {
    session: {
      isAuthenticated: currentUser !== null,
      sessionMode,
      accessToken,
      correlationPrefix,
    },
    isAuthenticated: currentUser !== null,
    currentUserName: currentUser?.firstName || currentUser?.displayName || currentUser?.username || '',
    username,
    password,
    authView,
    correlationPrefix,
    isAuthenticating,
    authError,
    authProvider: userWebConfig.authProvider,
    demoAccounts: listDemoAccounts(),
    setUsername,
    setPassword,
    setCorrelationPrefix,
    submitLogin: async () => {
      beginAuthentication();

      try {
        const result = await signIn({
          username,
          password,
        });

        startTransition(() => {
          completeAuthentication(result);
        });
      } catch (error) {
        startTransition(() => {
          failAuthentication(error instanceof Error ? error.message : 'Authentication failed.');
        });
      }
    },
    goToLogin: () => {
      setAuthView('login');
    },
    goToRegister: () => {
      setAuthView('register');
    },
    applyDemoAccount: (account) => {
      startTransition(() => {
        applyDemoCredentials(account.username, account.password);
      });
    },
    clearAuthError,
    signOut: () => {
      startTransition(() => {
        resetWorkspace();
        signOutFromStore();
      });
    },
  };
}
