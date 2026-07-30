import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { Client } from 'minio';

@Injectable()
export class ObjectStorageService {
  private readonly bucket = process.env.S3_BUCKET ?? 'clinic-crm-local';
  private readonly client = createClient();
  private bucketReady?: Promise<void>;

  async putObject(storageKey: string, contents: Buffer, mimeType: string) {
    await this.ensureBucket();
    try {
      await this.client.putObject(this.bucket, storageKey, contents, contents.length, {
        'Content-Type': mimeType,
      });
    } catch (error) {
      throw storageUnavailable(error);
    }
  }

  async getObject(storageKey: string) {
    await this.ensureBucket();
    try {
      return await this.client.getObject(this.bucket, storageKey);
    } catch (error) {
      throw storageUnavailable(error);
    }
  }

  async removeObject(storageKey: string) {
    await this.ensureBucket();
    try {
      await this.client.removeObject(this.bucket, storageKey);
    } catch (error) {
      throw storageUnavailable(error);
    }
  }

  private ensureBucket() {
    this.bucketReady ??= this.prepareBucket().catch((error) => {
      this.bucketReady = undefined;
      throw error;
    });
    return this.bucketReady;
  }

  private async prepareBucket() {
    try {
      if (!(await this.client.bucketExists(this.bucket))) {
        try {
          await this.client.makeBucket(this.bucket, process.env.S3_REGION ?? 'us-east-1');
        } catch (error) {
          // Another API process may have created the bucket after bucketExists.
          if (!(await this.client.bucketExists(this.bucket))) {
            throw error;
          }
        }
      }
    } catch (error) {
      throw storageUnavailable(error);
    }
  }
}

function createClient() {
  const endpoint = new URL(process.env.S3_ENDPOINT ?? 'http://minio:9000');
  return new Client({
    endPoint: endpoint.hostname,
    port: endpoint.port ? Number(endpoint.port) : endpoint.protocol === 'https:' ? 443 : 80,
    useSSL: endpoint.protocol === 'https:',
    accessKey: process.env.S3_ACCESS_KEY ?? 'clinic-crm',
    secretKey: process.env.S3_SECRET_KEY ?? 'clinic-crm-password',
    region: process.env.S3_REGION ?? 'us-east-1',
    pathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
  });
}

function storageUnavailable(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return new ServiceUnavailableException(`Файловое хранилище временно недоступно: ${message}`);
}
