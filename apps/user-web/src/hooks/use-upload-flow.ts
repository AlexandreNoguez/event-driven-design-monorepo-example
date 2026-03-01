import { startTransition } from 'react';
import type { ApiSession } from '../api/http-client';
import { toFriendlyHttpError } from '../api/http-client';
import {
  confirmUpload,
  createUploadSession,
  uploadFileToStorage,
} from '../api/upload-api';
import { useUploadWorkspaceStore } from '../stores/uploads-store';

export function useUploadFlow(
  session: ApiSession,
  refreshUploads: () => Promise<void>,
): {
  draftFileName: string;
  isSubmitting: boolean;
  canSubmit: boolean;
  helperText: string;
  selectDraftFile: (nextFile: File | null) => void;
  submitUpload: () => Promise<void>;
} {
  const draftFile = useUploadWorkspaceStore((state) => state.draftFile);
  const isSubmitting = useUploadWorkspaceStore((state) => state.isSubmitting);
  const setDraftFile = useUploadWorkspaceStore((state) => state.setDraftFile);
  const clearDraftFile = useUploadWorkspaceStore((state) => state.clearDraftFile);
  const setSubmitting = useUploadWorkspaceStore((state) => state.setSubmitting);
  const setLatestUploadSession = useUploadWorkspaceStore((state) => state.setLatestUploadSession);
  const setSelectedUploadId = useUploadWorkspaceStore((state) => state.setSelectedUploadId);
  const setLastError = useUploadWorkspaceStore((state) => state.setLastError);
  const setLastSuccessfulAction = useUploadWorkspaceStore((state) => state.setLastSuccessfulAction);

  return {
    draftFileName: draftFile?.name ?? '',
    isSubmitting,
    canSubmit: Boolean(draftFile) && !isSubmitting,
    helperText:
      session.sessionMode === 'mock'
        ? 'This session is not carrying a bearer token. Sign in again so the frontend can refresh the Keycloak access token.'
        : 'Keycloak mode will forward your bearer token to the API Gateway while preserving the same presigned upload flow.',
    selectDraftFile: (nextFile) => {
      startTransition(() => {
        setDraftFile(nextFile);
        setLastError(null);
      });
    },
    submitUpload: async () => {
      if (!draftFile) {
        startTransition(() => {
          setLastError('Select a file before submitting the upload flow.');
        });
        return;
      }

      startTransition(() => {
        setSubmitting(true);
        setLastError(null);
        setLastSuccessfulAction(null);
      });

      try {
        const uploadSession = await createUploadSession(session, {
          fileName: draftFile.name,
          contentType: draftFile.type || 'application/octet-stream',
          sizeBytes: draftFile.size,
        });

        await uploadFileToStorage(uploadSession.upload, draftFile);
        await confirmUpload(session, uploadSession.fileId);
        await refreshUploads();

        startTransition(() => {
          setLatestUploadSession(uploadSession);
          setSelectedUploadId(uploadSession.fileId);
          clearDraftFile();
          setLastSuccessfulAction(`Upload requested for ${uploadSession.fileId}.`);
        });
      } catch (error) {
        startTransition(() => {
          setLastError(toUserMessage(error));
        });
      } finally {
        startTransition(() => {
          setSubmitting(false);
        });
      }
    },
  };
}

function toUserMessage(error: unknown): string {
  return toFriendlyHttpError(error, 'Upload flow failed');
}
