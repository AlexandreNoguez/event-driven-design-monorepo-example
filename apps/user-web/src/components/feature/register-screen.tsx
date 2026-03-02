import {
  Alert,
  Button,
  Card,
  CardContent,
  Chip,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import type { DemoAccountPreset } from '../../types/auth';

interface RegisterScreenProps {
  demoAccounts: DemoAccountPreset[];
  authProvider: 'demo' | 'keycloak';
  onUseDemoAccount: (account: DemoAccountPreset) => void;
  onBackToLogin: () => void;
}

export function RegisterScreen({
  authProvider,
  demoAccounts,
  onUseDemoAccount,
  onBackToLogin,
}: RegisterScreenProps) {
  return (
    <Paper
      elevation={0}
      sx={{
        borderRadius: 6,
        border: '1px solid',
        borderColor: 'divider',
        p: { xs: 3, md: 5 },
      }}
    >
      <Stack spacing={3}>
        <Stack spacing={1}>
          <Chip
            label="Demo Access"
            color="secondary"
            variant="outlined"
            sx={{ width: 'fit-content', fontWeight: 700 }}
          />
          <Typography variant="h3" sx={{ fontWeight: 800, letterSpacing: '-0.03em' }}>
            Use seeded accounts for the local demo
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ maxWidth: '54ch' }}>
            For portfolio quality, authentication is not persisted inside the domain database. The
            canonical identity source remains Keycloak. This screen exposes the seeded local
            accounts so you can prefill the login form and test immediately.
          </Typography>
        </Stack>

        <Alert severity="info">
          {authProvider === 'demo'
            ? 'These demo users are seeded in the local Keycloak realm and still sign in with a real bearer token.'
            : 'These seeded credentials are exchanged for a real local access token from Keycloak.'}
        </Alert>

        <Stack spacing={2}>
          {demoAccounts.map((account) => (
            <Card
              key={account.username}
              elevation={0}
              sx={{ borderRadius: 4, border: '1px solid', borderColor: 'divider' }}
            >
              <CardContent sx={{ p: 3 }}>
                <Stack spacing={1.5}>
                  <Stack
                    direction={{ xs: 'column', sm: 'row' }}
                    spacing={1}
                    justifyContent="space-between"
                    alignItems={{ xs: 'flex-start', sm: 'center' }}
                  >
                    <Typography variant="h6" sx={{ fontWeight: 700 }}>
                      {account.displayName}
                    </Typography>
                    <Chip label={account.roleLabel} color="primary" size="small" />
                  </Stack>

                  <Typography variant="body2" color="text.secondary">
                    {account.description}
                  </Typography>

                  <Typography variant="body2">
                    <strong>Username:</strong> {account.username}
                  </Typography>
                  <Typography variant="body2">
                    <strong>Password:</strong> {account.password}
                  </Typography>

                  <Stack direction="row" justifyContent="flex-end">
                    <Button variant="contained" onClick={() => onUseDemoAccount(account)}>
                      Use this account
                    </Button>
                  </Stack>
                </Stack>
              </CardContent>
            </Card>
          ))}
        </Stack>

        <Stack direction="row" justifyContent="flex-start">
          <Button variant="text" onClick={onBackToLogin}>
            Back to login
          </Button>
        </Stack>
      </Stack>
    </Paper>
  );
}
