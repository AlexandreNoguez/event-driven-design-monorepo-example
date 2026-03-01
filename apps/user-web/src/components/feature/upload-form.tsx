import {
  Button,
  Card,
  CardContent,
  Stack,
  Typography,
} from '@mui/material';

interface UploadFormProps {
  draftFileName: string;
  isSubmitting: boolean;
  canSubmit: boolean;
  helperText: string;
  onFileSelected: (file: File | null) => void;
  onSubmit: () => void;
}

export function UploadForm({
  canSubmit,
  draftFileName,
  helperText,
  isSubmitting,
  onFileSelected,
  onSubmit,
}: UploadFormProps) {
  return (
    <Card elevation={0} sx={{ borderRadius: 4, border: '1px solid', borderColor: 'divider' }}>
      <CardContent sx={{ p: 3 }}>
        <Stack spacing={2.5}>
          <Stack spacing={0.75}>
            <Typography variant="overline" color="primary.main" sx={{ fontWeight: 800 }}>
              Upload
            </Typography>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              Start the presigned flow
            </Typography>
            <Typography variant="body2" color="text.secondary">
              The component only renders controls. File selection and side effects stay in the
              upload hook.
            </Typography>
          </Stack>

          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={1.5}
            alignItems={{ xs: 'stretch', md: 'center' }}
          >
            <Button component="label" variant="outlined" size="large">
              Choose file
              <input
                hidden
                type="file"
                accept="image/png,image/jpeg,image/webp,application/pdf"
                onChange={(event) => onFileSelected(event.currentTarget.files?.[0] ?? null)}
              />
            </Button>

            <Typography variant="body2" color="text.secondary">
              Selected file: <strong>{draftFileName || 'none yet'}</strong>
            </Typography>
          </Stack>

          <Typography variant="body2" color="text.secondary">
            {helperText}
          </Typography>

          <Stack direction="row" justifyContent="flex-end">
            <Button
              variant="contained"
              size="large"
              onClick={onSubmit}
              disabled={!canSubmit}
            >
              {isSubmitting ? 'Running...' : 'Request Upload'}
            </Button>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}
