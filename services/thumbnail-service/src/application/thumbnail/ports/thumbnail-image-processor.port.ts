export const THUMBNAIL_IMAGE_PROCESSOR_PORT = Symbol('THUMBNAIL_IMAGE_PROCESSOR_PORT');

export interface GenerateThumbnailInput {
  source: Buffer;
  width: number;
  height: number;
  outputFormat: 'webp';
  webpQuality: number;
}

export interface GenerateThumbnailResult {
  buffer: Buffer;
  contentType: string;
  extension: string;
  width?: number;
  height?: number;
}

export interface ThumbnailImageProcessorPort {
  generateThumbnail(input: GenerateThumbnailInput): Promise<GenerateThumbnailResult>;
}
