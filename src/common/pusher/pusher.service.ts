import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Pusher from 'pusher';

@Injectable()
export class PusherService {
  private readonly client: Pusher;

  constructor(private config: ConfigService) {
    this.client = new Pusher({
      appId: this.config.get<string>('PUSHER_APP_ID')!,
      key: this.config.get<string>('PUSHER_KEY')!,
      secret: this.config.get<string>('PUSHER_SECRET')!,
      cluster: this.config.get<string>('PUSHER_CLUSTER')!,
      useTLS: true,
    });
  }

  /**
   * Every user gets their own private channel: `private-user-<userId>`.
   * The RN app authenticates against POST /pusher/auth to subscribe.
   */
  private userChannel(userId: string) {
    return `private-user-${userId}`;
  }

  async triggerToUser(userId: string, event: string, payload: unknown) {
    await this.client.trigger(this.userChannel(userId), event, payload);
  }

  authenticateChannel(socketId: string, channel: string, userId: string) {
    // Only allow a user to subscribe to their own private channel
    if (channel !== this.userChannel(userId)) {
      throw new Error('Forbidden channel subscription');
    }
    return this.client.authorizeChannel(socketId, channel);
  }
}
