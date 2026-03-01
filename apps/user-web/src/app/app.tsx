import {
  Alert,
  AppBar,
  Box,
  Button,
  Container,
  Stack,
  Toolbar,
  Typography,
} from '@mui/material';
import { LoginScreen } from '../components/feature/login-screen';
import { MyUploadsList } from '../components/feature/my-uploads-list';
import { RegisterScreen } from '../components/feature/register-screen';
import { UploadForm } from '../components/feature/upload-form';
import { UploadTimelinePanel } from '../components/feature/upload-timeline-panel';
import { useAuthController } from '../hooks/use-auth';
import { useMyUploads } from '../hooks/use-my-uploads';
import { useUploadFlow } from '../hooks/use-upload-flow';
import { useUploadStatus } from '../hooks/use-upload-status';
import { useUploadWorkspaceStore } from '../stores/uploads-store';

export function App() {
  const auth = useAuthController();
  const uploads = useMyUploads(auth.session);
  const uploadFlow = useUploadFlow(auth.session, uploads.reload);
  const lastError = useUploadWorkspaceStore((state) => state.lastError);
  const lastSuccessfulAction = useUploadWorkspaceStore((state) => state.lastSuccessfulAction);
  const selectedUpload = useUploadStatus(auth.session, uploads.selectedUploadId);

  if (!auth.isAuthenticated) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          px: 2,
          py: 4,
          background:
            'radial-gradient(circle at top right, rgba(12,92,255,0.18), transparent 28%), radial-gradient(circle at top left, rgba(255,109,0,0.16), transparent 24%), linear-gradient(180deg, #f6f8ff 0%, #eef2ff 100%)',
        }}
      >
        <Container maxWidth="md">
          {auth.authView === 'login' ? (
            <LoginScreen
              authProvider={auth.authProvider}
              username={auth.username}
              password={auth.password}
              correlationPrefix={auth.correlationPrefix}
              isSubmitting={auth.isAuthenticating}
              errorMessage={auth.authError}
              onUsernameChange={auth.setUsername}
              onPasswordChange={auth.setPassword}
              onCorrelationPrefixChange={auth.setCorrelationPrefix}
              onSubmit={() => void auth.submitLogin()}
              onOpenRegister={auth.goToRegister}
            />
          ) : (
            <RegisterScreen
              authProvider={auth.authProvider}
              demoAccounts={auth.demoAccounts}
              onUseDemoAccount={auth.applyDemoAccount}
              onBackToLogin={auth.goToLogin}
            />
          )}
        </Container>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        background:
          'radial-gradient(circle at top right, rgba(12,92,255,0.14), transparent 26%), radial-gradient(circle at bottom left, rgba(255,109,0,0.1), transparent 22%), linear-gradient(180deg, #f8faff 0%, #f3f6ff 100%)',
      }}
    >
      <AppBar
        position="sticky"
        color="transparent"
        elevation={0}
        sx={{
          backdropFilter: 'blur(18px)',
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Toolbar sx={{ justifyContent: 'space-between', gap: 2 }}>
          <Stack spacing={0.25}>
            <Typography variant="overline" color="primary.main" sx={{ fontWeight: 800 }}>
              User Web
            </Typography>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              Hello, {auth.currentUserName}
            </Typography>
          </Stack>
          <Button variant="outlined" onClick={auth.signOut}>
            Sign out
          </Button>
        </Toolbar>
      </AppBar>

      <Container maxWidth="xl" sx={{ py: 4 }}>
        <Stack spacing={2.5} sx={{ mb: 3 }}>
          <Stack spacing={1}>
            <Typography variant="h2" sx={{ fontWeight: 800, letterSpacing: '-0.04em' }}>
              Event-driven uploads with a clean frontend boundary
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ maxWidth: '64ch' }}>
              Business rules stay in stores, hooks, and API adapters. The rendered UI only consumes
              prepared state and callbacks.
            </Typography>
          </Stack>

          {lastError ? <Alert severity="error">{lastError}</Alert> : null}
          {lastSuccessfulAction ? <Alert severity="success">{lastSuccessfulAction}</Alert> : null}
        </Stack>

        <Box
          sx={{
            display: 'grid',
            gap: 2.5,
            gridTemplateColumns: {
              xs: '1fr',
              lg: 'minmax(0, 1.1fr) minmax(360px, 0.9fr)',
            },
          }}
        >
          <Stack spacing={2.5}>
            <UploadForm
              draftFileName={uploadFlow.draftFileName}
              isSubmitting={uploadFlow.isSubmitting}
              canSubmit={uploadFlow.canSubmit}
              helperText={uploadFlow.helperText}
              onFileSelected={uploadFlow.selectDraftFile}
              onSubmit={() => void uploadFlow.submitUpload()}
            />
          </Stack>

          <Stack spacing={2.5}>
            <MyUploadsList
              uploads={uploads.uploads}
              selectedUploadId={uploads.selectedUploadId}
              isLoading={uploads.isLoading}
              onSelectUpload={uploads.selectUpload}
            />
            <UploadTimelinePanel
              upload={selectedUpload.uploadStatus}
              isLoading={selectedUpload.isLoading}
            />
          </Stack>
        </Box>
      </Container>
    </Box>
  );
}
