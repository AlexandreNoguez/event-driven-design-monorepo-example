import {
  Alert,
  Box,
  Button,
  Chip,
  Link,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';

interface LoginScreenProps {
  authProvider: 'demo' | 'keycloak';
  username: string;
  password: string;
  correlationPrefix: string;
  isSubmitting: boolean;
  errorMessage: string | null;
  onUsernameChange: (username: string) => void;
  onPasswordChange: (password: string) => void;
  onCorrelationPrefixChange: (correlationPrefix: string) => void;
  onSubmit: () => void;
  onOpenRegister: () => void;
}

export function LoginScreen({
  authProvider,
  username,
  password,
  correlationPrefix,
  isSubmitting,
  errorMessage,
  onUsernameChange,
  onPasswordChange,
  onCorrelationPrefixChange,
  onSubmit,
  onOpenRegister,
}: LoginScreenProps) {
  return (
    <Paper
      elevation={0}
      sx={{
        borderRadius: 6,
        border: '1px solid',
        borderColor: 'divider',
        p: { xs: 3, md: 5 },
        backgroundImage:
          'linear-gradient(145deg, rgba(255,255,255,0.92), rgba(246, 248, 255, 0.94))',
      }}
    >
      <Stack spacing={3}>
        <Stack spacing={1}>
          <Chip
            label={
              authProvider === 'demo'
                ? 'Seeded Keycloak Demo Accounts'
                : 'Keycloak Password Grant (Local)'
            }
            color="primary"
            variant="outlined"
            sx={{ width: 'fit-content', fontWeight: 700 }}
          />
          <Typography variant="h3" sx={{ fontWeight: 800, letterSpacing: '-0.03em' }}>
            Sign in to the upload pipeline
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ maxWidth: '54ch' }}>
            The login page is intentionally isolated from the dashboard. Authentication state lives
            in a dedicated store and the view only renders form controls.
          </Typography>
        </Stack>

        {errorMessage ? <Alert severity="error">{errorMessage}</Alert> : null}

        <Stack spacing={2}>
          <TextField
            label="Username"
            value={username}
            onChange={(event) => onUsernameChange(event.target.value)}
            autoComplete="username"
            fullWidth
          />
          <TextField
            label="Password"
            type="password"
            value={password}
            onChange={(event) => onPasswordChange(event.target.value)}
            autoComplete="current-password"
            fullWidth
          />
          <TextField
            label="Correlation Prefix"
            value={correlationPrefix}
            onChange={(event) => onCorrelationPrefixChange(event.target.value)}
            helperText="This prefix is used to generate x-correlation-id on frontend requests."
            fullWidth
          />
        </Stack>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
          <Button variant="contained" size="large" onClick={onSubmit} disabled={isSubmitting}>
            {isSubmitting ? 'Signing in...' : 'Sign in'}
          </Button>
          <Button variant="text" size="large" onClick={onOpenRegister}>
            Open seeded accounts
          </Button>
        </Stack>

        <Box>
          <Typography variant="body2" color="text.secondary">
            Need credentials?{' '}
            <Link
              component="button"
              type="button"
              underline="hover"
              onClick={onOpenRegister}
              sx={{ fontWeight: 700 }}
            >
              Open the seeded Keycloak account screen
            </Link>
            .
          </Typography>
        </Box>
      </Stack>
    </Paper>
  );
}
