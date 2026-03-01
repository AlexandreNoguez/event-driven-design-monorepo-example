import { Chip } from '@mui/material';

interface StatusChipProps {
  label: string;
}

export function StatusChip({ label }: StatusChipProps) {
  const normalized = label.toLowerCase();
  const color =
    normalized === 'completed'
      ? 'success'
      : normalized === 'failed' || normalized === 'rejected' || normalized === 'timed-out'
        ? 'error'
        : normalized === 'processing' || normalized === 'upload-requested'
          ? 'warning'
          : 'default';

  return (
    <Chip
      label={label}
      color={color}
      size="small"
      sx={{
        fontWeight: 700,
        textTransform: 'capitalize',
      }}
    />
  );
}
