import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';

@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);
  private isConfigured = false;

  constructor(private configService: ConfigService) {
    const cloudName = this.configService.get<string>('CLOUDINARY_CLOUD_NAME');
    const apiKey = this.configService.get<string>('CLOUDINARY_API_KEY');
    const apiSecret = this.configService.get<string>('CLOUDINARY_API_SECRET');

    if (cloudName && apiKey && apiSecret) {
      cloudinary.config({
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret,
        secure: true,
      });
      this.isConfigured = true;
      this.logger.log('Cloudinary service initialized successfully.');
    } else {
      this.logger.warn(
        'Cloudinary environment variables missing (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET). Cloudinary uploads will use mock/data-URL fallback.',
      );
    }
  }

  /**
   * Uploads an image base64 data URI or remote image URL to Cloudinary.
   */
  async uploadImage(
    fileDataUriOrUrl: string,
    folder = 'soboggan/blog',
  ): Promise<{ url: string; publicId: string }> {
    if (!this.isConfigured) {
      // Fallback: If not configured with API keys, return the data URI or placeholder
      const mockId = `mock_${Date.now()}`;
      return {
        url: fileDataUriOrUrl.startsWith('data:')
          ? fileDataUriOrUrl
          : fileDataUriOrUrl || 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?auto=format&fit=crop&w=1200&q=80',
        publicId: mockId,
      };
    }

    try {
      const result: UploadApiResponse = await cloudinary.uploader.upload(fileDataUriOrUrl, {
        folder,
        resource_type: 'image',
      });

      return {
        url: result.secure_url,
        publicId: result.public_id,
      };
    } catch (error: any) {
      this.logger.error(`Cloudinary upload failed: ${error?.message || error}`);
      throw new Error(`Failed to upload image to Cloudinary: ${error?.message || 'Unknown error'}`);
    }
  }

  /**
   * Deletes an asset from Cloudinary by public ID.
   */
  async deleteImage(publicId: string): Promise<void> {
    if (!this.isConfigured || publicId.startsWith('mock_')) return;
    try {
      await cloudinary.uploader.destroy(publicId);
    } catch (error: any) {
      this.logger.warn(`Failed to delete Cloudinary asset ${publicId}: ${error?.message}`);
    }
  }
}
