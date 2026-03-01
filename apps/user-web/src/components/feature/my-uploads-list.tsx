import {
  Card,
  CardContent,
  List,
  ListItemButton,
  ListItemText,
  Stack,
  Typography,
} from '@mui/material';
import type { UploadRecordSummary } from '../../types/uploads';
import { StatusChip } from '../ui/status-chip';

interface MyUploadsListProps {
  uploads: UploadRecordSummary[];
  selectedUploadId: string | null;
  isLoading: boolean;
  onSelectUpload: (fileId: string) => void;
}

export function MyUploadsList({
  isLoading,
  onSelectUpload,
  selectedUploadId,
  uploads,
}: MyUploadsListProps) {
  return (
    <Card elevation={0} sx={{ borderRadius: 4, border: '1px solid', borderColor: 'divider' }}>
      <CardContent sx={{ p: 3 }}>
        <Stack spacing={2}>
          <Stack spacing={0.75}>
            <Typography variant="overline" color="primary.main" sx={{ fontWeight: 800 }}>
              Read Model
            </Typography>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              My uploads
            </Typography>
            <Typography variant="body2" color="text.secondary">
              This list is read-only from the UI perspective. It renders the projection returned by
              the API Gateway.
            </Typography>
          </Stack>

          {isLoading ? (
            <Typography variant="body2" color="text.secondary">
              Loading uploads...
            </Typography>
          ) : uploads.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No uploads yet. Run the upload flow once and the list will reflect the projection.
            </Typography>
          ) : (
            <List disablePadding sx={{ display: 'grid', gap: 1.25 }}>
              {uploads.map((upload) => (
                <ListItemButton
                  key={upload.fileId}
                  selected={selectedUploadId === upload.fileId}
                  onClick={() => onSelectUpload(upload.fileId)}
                  sx={{
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 3,
                    alignItems: 'flex-start',
                  }}
                >
                  <ListItemText
                    primary={upload.fileName}
                    secondary={`${upload.contentType} · ${formatFileSize(upload.sizeBytes)}`}
                    primaryTypographyProps={{ fontWeight: 700 }}
                  />
                  <Stack spacing={1} alignItems="flex-end">
                    <StatusChip label={upload.status} />
                    <Typography variant="caption" color="text.secondary">
                      {formatTimestamp(upload.updatedAt)}
                    </Typography>
                  </Stack>
                </ListItemButton>
              ))}
            </List>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}

function formatFileSize(sizeBytes: number): string {
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }

  const kib = sizeBytes / 1024;
  if (kib < 1024) {
    return `${kib.toFixed(1)} KiB`;
  }

  return `${(kib / 1024).toFixed(1)} MiB`;
}

function formatTimestamp(value: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return value;
  }

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsed);
}
