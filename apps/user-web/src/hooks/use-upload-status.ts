import { startTransition, useEffect, useEffectEvent } from 'react';
import type { ApiSession } from '../api/http-client';
import { toFriendlyHttpError } from '../api/http-client';
import { userWebConfig } from '../config/user-web-config';
import { getUploadStatus } from '../api/upload-api';
import { useUploadWorkspaceStore } from '../stores/uploads-store';
import type { UploadStatusResponse } from '../types/uploads';

export function useUploadStatus(
  session: ApiSession,
  fileId: string | null,
): {
  uploadStatus: UploadStatusResponse | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
} {
  const uploadStatus = useUploadWorkspaceStore((state) => state.selectedUploadStatus);
  const isLoading = useUploadWorkspaceStore((state) => state.isStatusLoading);
  const setSelectedUploadStatus = useUploadWorkspaceStore((state) => state.setSelectedUploadStatus);
  const setStatusLoading = useUploadWorkspaceStore((state) => state.setStatusLoading);
  const setLastError = useUploadWorkspaceStore((state) => state.setLastError);

  const loadStatus = useEffectEvent(async () => {
    if (!fileId) {
      startTransition(() => {
        setSelectedUploadStatus(null);
      });
      return;
    }

    startTransition(() => {
      setStatusLoading(true);
      setLastError(null);
    });

    try {
      const nextStatus = await getUploadStatus(session, fileId);
      startTransition(() => {
        setSelectedUploadStatus(nextStatus);
      });
    } catch (error) {
      startTransition(() => {
        setLastError(toUserMessage(error));
      });
    } finally {
      startTransition(() => {
        setStatusLoading(false);
      });
    }
  });

  useEffect(() => {
    const canQuery =
      session.isAuthenticated &&
      (session.sessionMode === 'mock' || session.accessToken.trim().length > 0);

    if (!canQuery || !fileId) {
      startTransition(() => {
        setSelectedUploadStatus(null);
      });
      return;
    }

    void loadStatus();
  }, [fileId, session.accessToken, session.isAuthenticated, session.sessionMode, setSelectedUploadStatus]);

  useEffect(() => {
    const canQuery =
      session.isAuthenticated &&
      (session.sessionMode === 'mock' || session.accessToken.trim().length > 0);

    if (!canQuery || !fileId) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void loadStatus();
    }, userWebConfig.uploadPollingIntervalMs);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [fileId, session.accessToken, session.isAuthenticated, session.sessionMode]);

  return {
    uploadStatus,
    isLoading,
    refresh: async () => {
      await loadStatus();
    },
  };
}

function toUserMessage(error: unknown): string {
  return toFriendlyHttpError(error, 'Status request failed');
}
