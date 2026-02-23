import type { ImageMetadataInfo } from '../../../domain/extractor/metadata-extraction';

export const IMAGE_METADATA_READER_PORT = Symbol('IMAGE_METADATA_READER_PORT');

export interface ImageMetadataReaderPort {
  tryReadImageMetadata(buffer: Buffer): Promise<ImageMetadataInfo | undefined>;
}
