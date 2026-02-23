import { Injectable } from '@nestjs/common';
import sharp from 'sharp';
import type {
  GenerateThumbnailInput,
  GenerateThumbnailResult,
  ThumbnailImageProcessorPort,
} from '../../application/thumbnail/ports/thumbnail-image-processor.port';

@Injectable()
export class SharpThumbnailImageProcessorAdapter implements ThumbnailImageProcessorPort {
  async generateThumbnail(input: GenerateThumbnailInput): Promise<GenerateThumbnailResult> {
    const transformer = sharp(input.source)
      .rotate()
      .resize({
        width: input.width,
        height: input.height,
        fit: 'inside',
        withoutEnlargement: true,
      });

    if (input.outputFormat !== 'webp') {
      throw new Error(`Unsupported thumbnail output format: ${input.outputFormat}`);
    }

    const { data, info } = await transformer
      .webp({ quality: input.webpQuality })
      .toBuffer({ resolveWithObject: true });

    return {
      buffer: data,
      contentType: 'image/webp',
      extension: 'webp',
      width: info.width,
      height: info.height,
    };
  }
}
