import { startTransition, useEffect, useEffectEvent } from 'react';
import type { ApiSession } from '../api/http-client';
import { toFriendlyHttpError } from '../api/http-client';
import { userWebConfig } from '../config/user-web-config';
import { listMyUploads } from '../api/upload-api';
import { useUploadWorkspaceStore } from '../stores/uploads-store';
import type { UploadRecordSummary } from '../types/uploads';

export function useMyUploads(session: ApiSession): {
  uploads: UploadRecordSummary[];
  selectedUploadId: string | null;
  isLoading: boolean;
  reload: () => Promise<void>;
  selectUpload: (fileId: string) => void;
} {
  const uploads = useUploadWorkspaceStore((state) => state.uploads);
  const selectedUploadId = useUploadWorkspaceStore((state) => state.selectedUploadId);
  const isLoading = useUploadWorkspaceStore((state) => state.isListLoading);
  const setUploads = useUploadWorkspaceStore((state) => state.setUploads);
  const setSelectedUploadId = useUploadWorkspaceStore((state) => state.setSelectedUploadId);
  const setListLoading = useUploadWorkspaceStore((state) => state.setListLoading);
  const setLastError = useUploadWorkspaceStore((state) => state.setLastError);

  const loadUploads = useEffectEvent(async () => {
    startTransition(() => {
      setListLoading(true);
      setLastError(null);
    });

    try {
      const response = await listMyUploads(session);
      const sortedUploads = [...response.items].sort(
        (left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
      );

      startTransition(() => {
        setUploads(sortedUploads);

        if (sortedUploads.length === 0) {
          setSelectedUploadId(null);
          return;
        }

        const stillSelected = sortedUploads.some((upload) => upload.fileId === selectedUploadId);
        if (!stillSelected) {
          setSelectedUploadId(sortedUploads[0]?.fileId ?? null);
        }
      });
    } catch (error) {
      startTransition(() => {
        setLastError(toUserMessage(error));
      });
    } finally {
      startTransition(() => {
        setListLoading(false);
      });
    }
  });

  useEffect(() => {
    const canQuery =
      session.isAuthenticated &&
      (session.sessionMode === 'mock' || session.accessToken.trim().length > 0);

    if (!canQuery) {
      startTransition(() => {
        setUploads([]);
        setSelectedUploadId(null);
      });
      return;
    }

    void loadUploads();
  }, [session.accessToken, session.isAuthenticated, session.sessionMode, setSelectedUploadId, setUploads]);

  useEffect(() => {
    const canQuery =
      session.isAuthenticated &&
      (session.sessionMode === 'mock' || session.accessToken.trim().length > 0);

    if (!canQuery) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void loadUploads();
    }, userWebConfig.uploadPollingIntervalMs);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [session.accessToken, session.isAuthenticated, session.sessionMode]);

  return {
    uploads,
    selectedUploadId,
    isLoading,
    reload: async () => {
      await loadUploads();
    },
    selectUpload: (fileId) => {
      setSelectedUploadId(fileId);
    },
  };
}

function toUserMessage(error: unknown): string {
  return toFriendlyHttpError(error, 'Uploads request failed');
}
