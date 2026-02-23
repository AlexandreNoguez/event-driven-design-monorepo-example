import { Injectable } from '@nestjs/common';
import sharp from 'sharp';
import type { ImageMetadataReaderPort } from '../../application/extractor/ports/image-metadata-reader.port';
import type { ImageMetadataInfo } from '../../domain/extractor/metadata-extraction';

@Injectable()
export class SharpImageMetadataReaderAdapter implements ImageMetadataReaderPort {
  async tryReadImageMetadata(buffer: Buffer): Promise<ImageMetadataInfo | undefined> {
    const metadata = await sharp(buffer).metadata();

    return {
      width: metadata.width,
      height: metadata.height,
      format: metadata.format,
      space: metadata.space,
      hasAlpha: metadata.hasAlpha,
    };
  }
}
