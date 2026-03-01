import { create } from 'zustand';
import type {
  CreateUploadResponse,
  UploadRecordSummary,
  UploadStatusResponse,
} from '../types/uploads';

interface UploadWorkspaceState {
  draftFile: File | null;
  latestUploadSession: CreateUploadResponse | null;
  uploads: UploadRecordSummary[];
  selectedUploadId: string | null;
  selectedUploadStatus: UploadStatusResponse | null;
  isListLoading: boolean;
  isStatusLoading: boolean;
  isSubmitting: boolean;
  lastError: string | null;
  lastSuccessfulAction: string | null;
  setDraftFile: (draftFile: File | null) => void;
  clearDraftFile: () => void;
  setLatestUploadSession: (session: CreateUploadResponse | null) => void;
  setUploads: (uploads: UploadRecordSummary[]) => void;
  setSelectedUploadId: (selectedUploadId: string | null) => void;
  setSelectedUploadStatus: (selectedUploadStatus: UploadStatusResponse | null) => void;
  setListLoading: (isListLoading: boolean) => void;
  setStatusLoading: (isStatusLoading: boolean) => void;
  setSubmitting: (isSubmitting: boolean) => void;
  setLastError: (lastError: string | null) => void;
  setLastSuccessfulAction: (lastSuccessfulAction: string | null) => void;
  resetWorkspace: () => void;
}

export const useUploadWorkspaceStore = create<UploadWorkspaceState>((set) => ({
  draftFile: null,
  latestUploadSession: null,
  uploads: [],
  selectedUploadId: null,
  selectedUploadStatus: null,
  isListLoading: false,
  isStatusLoading: false,
  isSubmitting: false,
  lastError: null,
  lastSuccessfulAction: null,
  setDraftFile: (draftFile) => set({ draftFile }),
  clearDraftFile: () => set({ draftFile: null }),
  setLatestUploadSession: (latestUploadSession) => set({ latestUploadSession }),
  setUploads: (uploads) => set({ uploads }),
  setSelectedUploadId: (selectedUploadId) => set({ selectedUploadId }),
  setSelectedUploadStatus: (selectedUploadStatus) => set({ selectedUploadStatus }),
  setListLoading: (isListLoading) => set({ isListLoading }),
  setStatusLoading: (isStatusLoading) => set({ isStatusLoading }),
  setSubmitting: (isSubmitting) => set({ isSubmitting }),
  setLastError: (lastError) => set({ lastError }),
  setLastSuccessfulAction: (lastSuccessfulAction) => set({ lastSuccessfulAction }),
  resetWorkspace: () =>
    set({
      draftFile: null,
      latestUploadSession: null,
      uploads: [],
      selectedUploadId: null,
      selectedUploadStatus: null,
      isListLoading: false,
      isStatusLoading: false,
      isSubmitting: false,
      lastError: null,
      lastSuccessfulAction: null,
    }),
}));
