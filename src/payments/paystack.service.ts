import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import * as crypto from 'crypto';

export interface PaystackInitializeResponse {
  status: boolean;
  message: string;
  data: {
    authorization_url: string;
    access_code: string;
    reference: string;
  };
}

export interface PaystackVerifyResponse {
  status: boolean;
  message: string;
  data: {
    status: 'success' | 'failed' | 'abandoned';
    reference: string;
    amount: number; // kobo
    currency: string;
    channel: string;
    paid_at: string | null;
    customer: { email: string };
    metadata: Record<string, unknown>;
  };
}

@Injectable()
export class PaystackService {
  private readonly client: AxiosInstance;
  private readonly secretKey: string;

  constructor(private config: ConfigService) {
    this.secretKey = this.config.get<string>('PAYSTACK_SECRET_KEY')!;
    this.client = axios.create({
      baseURL: this.config.get<string>('PAYSTACK_BASE_URL'),
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/json',
      },
    });
  }

  async initializeTransaction(params: {
    email: string;
    amountNaira: number;
    reference: string;
    metadata?: Record<string, unknown>;
    callbackUrl?: string;
  }): Promise<PaystackInitializeResponse> {
    const { data } = await this.client.post('/transaction/initialize', {
      email: params.email,
      amount: Math.round(params.amountNaira * 100), // Paystack expects kobo
      reference: params.reference,
      metadata: params.metadata,
      callback_url: params.callbackUrl,
    });
    return data;
  }

  async verifyTransaction(reference: string): Promise<PaystackVerifyResponse> {
    const { data } = await this.client.get(`/transaction/verify/${reference}`);
    return data;
  }

  /**
   * Paystack signs webhook payloads with HMAC SHA512 of the JSON body,
   * using the secret key. Compare against the `x-paystack-signature` header.
   */
  verifyWebhookSignature(rawBody: string, signatureHeader: string | undefined): boolean {
    if (!signatureHeader) return false;
    const hash = crypto.createHmac('sha512', this.secretKey).update(rawBody).digest('hex');
    return hash === signatureHeader;
  }
}
