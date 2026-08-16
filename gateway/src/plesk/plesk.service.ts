import { Injectable, InternalServerErrorException } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';

@Injectable()
export class PleskService {
  private readonly client: AxiosInstance;

  constructor() {
    const baseURL = process.env.PLESK_URL;

    if (!baseURL) {
      throw new Error('PLESK_URL is not configured');
    }

    this.client = axios.create({
      baseURL: `${baseURL.replace(/\/$/, '')}/api/v2`,
      auth: {
        username: process.env.PLESK_USERNAME!,
        password: process.env.PLESK_PASSWORD!,
      },
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    });
  }

  async getServer() {
    return this.request(() => this.client.get('/server'));
  }

  async listDomains() {
    return this.request(() => this.client.get('/domains'));
  }

  async getDomain(id: number) {
    return this.request(() => this.client.get(`/domains/${id}`));
  }

  async listMailboxes(domainId: number) {
    return this.request(() =>
      this.client.get(`/domains/${domainId}/mail`)
    );
  }

  private async request<T>(operation: () => Promise<{ data: T }>): Promise<T> {
    try {
      const response = await operation();
      return response.data;
    } catch (error: any) {
      const status = error?.response?.status;
      const message =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        error?.message ||
        'Plesk API request failed';

      throw new InternalServerErrorException(
        `Plesk API error${status ? ` (${status})` : ''}: ${message}`,
      );
    }
  }
}
