import type {
  ConfirmUploadResponse,
  CreateUploadRequest,
  CreateUploadResponse,
  UploadListResponse,
  UploadStatusResponse,
} from '../types/uploads';
import axios from 'axios';
import { requestJson, type ApiSession } from './http-client';

export async function listMyUploads(session: ApiSession): Promise<UploadListResponse> {
  return requestJson<UploadListResponse>('/uploads', session, {
    method: 'GET',
    headers: {
      'content-type': 'application/json',
    },
  });
}

export async function getUploadStatus(
  session: ApiSession,
  fileId: string,
): Promise<UploadStatusResponse> {
  return requestJson<UploadStatusResponse>(`/uploads/${fileId}/status`, session, {
    method: 'GET',
    headers: {
      'content-type': 'application/json',
    },
  });
}

export async function createUploadSession(
  session: ApiSession,
  input: CreateUploadRequest,
): Promise<CreateUploadResponse> {
  return requestJson<CreateUploadResponse>('/uploads', session, {
    method: 'POST',
    data: input,
  });
}

export async function confirmUpload(
  session: ApiSession,
  fileId: string,
): Promise<ConfirmUploadResponse> {
  return requestJson<ConfirmUploadResponse>(`/uploads/${fileId}/confirm`, session, {
    method: 'POST',
    data: {},
  });
}

export async function uploadFileToStorage(
  upload: CreateUploadResponse['upload'],
  file: File,
): Promise<void> {
  const headers: Record<string, string> = {};

  for (const [key, value] of Object.entries(upload.requiredHeaders ?? {})) {
    headers[key] = value;
  }

  if (!headers['content-type']) {
    headers['content-type'] = file.type || 'application/octet-stream';
  }

  await axios.request<void>({
    url: upload.url,
    method: upload.method,
    headers,
    data: file,
    validateStatus: (status) => status >= 200 && status < 300,
  });
}
