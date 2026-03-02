import axios from 'axios';
import { userWebConfig } from '../config/user-web-config';
import type {
  DemoAccountPreset,
  LoginInput,
  LoginResult,
  UserProfile,
} from '../types/auth';

interface SignInResponse {
  sessionMode: 'bearer';
  accessToken: string;
  user: UserProfile;
}

const DEMO_ACCOUNTS: DemoAccountPreset[] = [
  {
    username: 'demo-user',
    password: 'demo123',
    displayName: 'Demo User',
    roleLabel: 'User',
    email: 'demo-user@local.test',
    description: 'Local seeded account focused on the standard upload journey.',
  },
  {
    username: 'demo-admin',
    password: 'demo123',
    displayName: 'Demo Admin',
    roleLabel: 'Admin',
    email: 'demo-admin@local.test',
    description: 'Local seeded account with administrative access for future admin-web flows.',
  },
];

export function listDemoAccounts(): DemoAccountPreset[] {
  return DEMO_ACCOUNTS;
}

export async function signIn(input: LoginInput): Promise<LoginResult> {
  if (userWebConfig.authProvider === 'demo') {
    const matchedAccount = DEMO_ACCOUNTS.find(
      (account) =>
        account.username === input.username.trim() && account.password === input.password,
    );

    if (!matchedAccount) {
      throw new Error('Invalid credentials. Use one of the seeded Keycloak demo accounts.');
    }
  }

  const tokenResult = await exchangePasswordForToken(input);

  return {
    sessionMode: 'bearer',
    accessToken: tokenResult.accessToken,
    user: tokenResult.user,
  };
}

async function exchangePasswordForToken(
  input: LoginInput,
): Promise<{ accessToken: string; user: UserProfile }> {
  try {
    const response = await axios.post<SignInResponse>(
      `${userWebConfig.apiBaseUrl}/auth/login`,
      {
        username: input.username.trim(),
        password: input.password,
      },
      {
        headers: {
          'content-type': 'application/json',
        },
        timeout: 10000,
      },
    );

    if (!response.data.accessToken) {
      throw new Error('The API gateway did not return an access token.');
    }

    return {
      accessToken: response.data.accessToken,
      user: response.data.user,
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const statusCode = error.response?.status;
      const responseData =
        typeof error.response?.data === 'string'
          ? error.response.data
          : error.response?.data
            ? JSON.stringify(error.response.data)
            : error.message;

      throw new Error(
        `Sign-in failed${statusCode ? ` (${statusCode})` : ''}. ${responseData || 'Check the API gateway and Keycloak containers.'}`,
      );
    }

    throw error;
  }
}
