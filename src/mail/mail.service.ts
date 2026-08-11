import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class MailService {
  private logger = new Logger(MailService.name);
  private resend: Resend | null = null;
  private fromEmail: string;

  constructor(private config: ConfigService) {
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    this.fromEmail = this.config.get<string>('FROM_EMAIL') || 'Soboggan Management <onboarding@resend.dev>';

    if (apiKey) {
      this.resend = new Resend(apiKey);
    } else {
      this.logger.warn('RESEND_API_KEY is not set. Verification codes will be printed to console log in development mode.');
    }
  }

  async sendVerificationEmail(email: string, code: string, firstName?: string): Promise<boolean> {
    const recipientName = firstName ? firstName : 'Valued Client';
    
    // Always print to console in dev mode so developer can see the code immediately
    this.logger.log(`[VERIFICATION CODE] Sent to ${email}: ${code}`);

    if (!this.resend) {
      this.logger.log(`[DEV SIMULATION] Email to ${email} with code ${code} handled successfully.`);
      return true;
    }

    try {
      const htmlContent = `
        <div style="font-family: 'Segoe UI', Helvetica, Arial, sans-serif; background-color: #f4f6f8; padding: 40px 20px; color: #1e293b;">
          <div style="max-width: 560px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
            <div style="background-color: #0F172A; padding: 32px 24px; text-align: center;">
              <h1 style="color: #D4AF37; margin: 0; font-size: 24px; letter-spacing: 2px; font-weight: 700;">SOBOGGAN</h1>
              <p style="color: #94A3B8; margin: 4px 0 0 0; font-size: 11px; letter-spacing: 3px; font-weight: 600;">MANAGEMENT LTD</p>
            </div>
            
            <div style="padding: 32px 24px;">
              <h2 style="color: #0F172A; margin-top: 0; font-size: 20px;">Verify your email address</h2>
              <p style="font-size: 15px; color: #475569; line-height: 1.6;">Hello ${recipientName},</p>
              <p style="font-size: 15px; color: #475569; line-height: 1.6;">
                Thank you for registering with Soboggan Management. Please use the verification code below to verify your email address and activate your wealth management account:
              </p>
              
              <div style="margin: 28px 0; text-align: center;">
                <div style="display: inline-block; background-color: #F8FAFC; border: 2px dashed #CBD5E1; border-radius: 8px; padding: 16px 32px;">
                  <span style="font-family: monospace; font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #0F172A;">${code}</span>
                </div>
                <p style="font-size: 13px; color: #94A3B8; margin-top: 8px;">This code expires in 15 minutes.</p>
              </div>

              <p style="font-size: 14px; color: #64748B; line-height: 1.5;">
                If you did not request this email, please ignore it or contact our support team.
              </p>

              <hr style="border: none; border-top: 1px solid #E2E8F0; margin: 28px 0;" />

              <p style="font-size: 12px; color: #94A3B8; text-align: center; margin: 0;">
                &copy; ${new Date().getFullYear()} Soboggan Management Ltd. Managing Capital. Building Futures.
              </p>
            </div>
          </div>
        </div>
      `;

      const response = await this.resend.emails.send({
        from: this.fromEmail,
        to: [email],
        subject: 'Verify your Soboggan account',
        html: htmlContent,
      });

      if (response.error) {
        this.logger.error(`Failed to send email via Resend: ${JSON.stringify(response.error)}`);
        return false;
      }

      this.logger.log(`Verification email sent via Resend to ${email} (ID: ${response.data?.id})`);
      return true;
    } catch (err: any) {
      this.logger.error(`Error sending email via Resend: ${err.message}`, err.stack);
      return false;
    }
  }
}
