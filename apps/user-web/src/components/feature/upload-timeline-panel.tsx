import {
  Card,
  CardContent,
  Divider,
  List,
  ListItem,
  ListItemText,
  Stack,
  Typography,
} from '@mui/material';
import type { UploadStatusResponse } from '../../types/uploads';
import { StatusChip } from '../ui/status-chip';

interface UploadTimelinePanelProps {
  upload: UploadStatusResponse | null;
  isLoading: boolean;
}

export function UploadTimelinePanel({ isLoading, upload }: UploadTimelinePanelProps) {
  return (
    <Card elevation={0} sx={{ borderRadius: 4, border: '1px solid', borderColor: 'divider' }}>
      <CardContent sx={{ p: 3 }}>
        <Stack spacing={2.5}>
          <Stack spacing={0.75}>
            <Typography variant="overline" color="primary.main" sx={{ fontWeight: 800 }}>
              Detail
            </Typography>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              Selected upload
            </Typography>
            <Typography variant="body2" color="text.secondary">
              This panel only renders the prepared status object returned by the hook.
            </Typography>
          </Stack>

          {isLoading ? (
            <Typography variant="body2" color="text.secondary">
              Loading status...
            </Typography>
          ) : !upload ? (
            <Typography variant="body2" color="text.secondary">
              Select an upload from the list to inspect its timeline and ownership metadata.
            </Typography>
          ) : (
            <Stack spacing={2}>
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                spacing={1.5}
                justifyContent="space-between"
                alignItems={{ xs: 'flex-start', sm: 'center' }}
              >
                <div>
                  <Typography variant="h6" sx={{ fontWeight: 700 }}>
                    {upload.fileName}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Hello, {upload.owner.username}. Tenant: {upload.owner.tenantId ?? 'default'}
                  </Typography>
                </div>
                <StatusChip label={upload.status} />
              </Stack>

              <Stack
                direction={{ xs: 'column', md: 'row' }}
                spacing={2}
                divider={<Divider flexItem orientation="vertical" />}
              >
                <FactBlock label="File ID" value={upload.fileId} />
                <FactBlock label="Correlation" value={upload.correlationId} />
                <FactBlock label="Last command" value={upload.lastCommand} />
                <FactBlock label="Reprocess count" value={`${upload.reprocessCount}`} />
              </Stack>

              <Divider />

              <List disablePadding sx={{ display: 'grid', gap: 1 }}>
                {upload.timeline.length === 0 ? (
                  <ListItem sx={{ px: 0 }}>
                    <ListItemText
                      primary="No timeline events were recorded yet."
                      primaryTypographyProps={{ variant: 'body2', color: 'text.secondary' }}
                    />
                  </ListItem>
                ) : (
                  upload.timeline.map((entry) => (
                    <ListItem
                      key={entry.eventId}
                      sx={{
                        px: 0,
                        alignItems: 'flex-start',
                        borderBottom: '1px solid',
                        borderColor: 'divider',
                      }}
                    >
                      <ListItemText
                        primary={entry.type}
                        secondary={`${formatTimestamp(entry.occurredAt)} · ${entry.correlationId}`}
                        primaryTypographyProps={{ fontWeight: 700 }}
                      />
                    </ListItem>
                  ))
                )}
              </List>
            </Stack>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}

function FactBlock({ label, value }: { label: string; value: string }) {
  return (
    <Stack spacing={0.5}>
      <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase' }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>
        {value}
      </Typography>
    </Stack>
  );
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
