import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OAuth2Client } from 'google-auth-library';
import * as bcrypt from 'bcryptjs';
import { AccountType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { MailService } from '../mail/mail.service';
import { GoogleProfilePayload } from './strategies/google.strategy';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';

@Injectable()
export class AuthService {
  private googleClient: OAuth2Client;

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private config: ConfigService,
    private activityLogService: ActivityLogService,
    private mailService: MailService,
  ) {
    this.googleClient = new OAuth2Client(this.config.get<string>('GOOGLE_CLIENT_ID'));
  }

  async register(dto: RegisterDto, ip?: string) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (existing) {
      throw new ConflictException('An account with this email address already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone ?? null,
        emailVerified: false,
        lastLoginAt: new Date(),
      },
    });

    // Automatically provision a primary Savings Account for new user
    await this.prisma.account.create({
      data: {
        userId: user.id,
        type: AccountType.SAVINGS,
        currency: 'NGN',
        accountNumber: await this.generateAccountNumber(),
      },
    });

    // Generate 6-digit verification code & store token
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    await this.prisma.verificationToken.create({
      data: {
        userId: user.id,
        token: code,
        expiresAt,
      },
    });

    // Send verification email via Resend
    await this.mailService.sendVerificationEmail(user.email, code, user.firstName);

    const accessToken = this.jwtService.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    await this.activityLogService.log({
      userId: user.id,
      action: 'REGISTER',
      entityType: 'User',
      entityId: user.id,
      ipAddress: ip,
      metadata: { method: 'credentials' },
    });

    return {
      accessToken,
      user,
      message: 'Registration successful! Verification code sent to your email.',
    };
  }

  async resendVerificationCode(dto: ResendVerificationDto) {
    const email = dto.email.toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user) {
      throw new NotFoundException('No account found with this email address');
    }

    if (user.emailVerified) {
      return { message: 'This email address is already verified.' };
    }

    // Delete any existing verification tokens for this user
    await this.prisma.verificationToken.deleteMany({
      where: { userId: user.id },
    });

    // Generate fresh 6-digit verification code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    await this.prisma.verificationToken.create({
      data: {
        userId: user.id,
        token: code,
        expiresAt,
      },
    });

    // Send verification email via Resend
    await this.mailService.sendVerificationEmail(user.email, code, user.firstName);

    return { message: 'Verification code resent successfully. Please check your inbox.' };
  }

  async verifyEmail(dto: VerifyEmailDto, ip?: string) {
    const email = dto.email.toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user) {
      throw new NotFoundException('No account found with this email address');
    }

    if (user.emailVerified) {
      const accessToken = this.jwtService.sign({
        sub: user.id,
        email: user.email,
        role: user.role,
      });
      return { accessToken, user, message: 'Email address is already verified.' };
    }

    const tokenRecord = await this.prisma.verificationToken.findFirst({
      where: {
        userId: user.id,
        token: dto.code.trim(),
      },
    });

    if (!tokenRecord) {
      throw new BadRequestException('Invalid verification code. Please check and try again.');
    }

    if (tokenRecord.expiresAt < new Date()) {
      await this.prisma.verificationToken.delete({ where: { id: tokenRecord.id } });
      throw new BadRequestException('Verification code has expired. Please tap "Resend code".');
    }

    // Mark email as verified & delete spent verification tokens
    const updatedUser = await this.prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true },
    });

    await this.prisma.verificationToken.deleteMany({
      where: { userId: user.id },
    });

    await this.activityLogService.log({
      userId: user.id,
      action: 'VERIFY_EMAIL',
      entityType: 'User',
      entityId: user.id,
      ipAddress: ip,
      metadata: { method: 'resend_code' },
    });

    const accessToken = this.jwtService.sign({
      sub: updatedUser.id,
      email: updatedUser.email,
      role: updatedUser.role,
    });

    return { accessToken, user: updatedUser, message: 'Email verified successfully!' };
  }


  async login(dto: LoginDto, ip?: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.passwordHash) {
      throw new UnauthorizedException(
        'This email is associated with Google Sign-In. Please tap "Continue with Google".',
      );
    }

    const isMatch = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedException('Invalid email or password');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const accessToken = this.jwtService.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    await this.activityLogService.log({
      userId: user.id,
      action: 'LOGIN',
      entityType: 'User',
      entityId: user.id,
      ipAddress: ip,
      metadata: { method: 'credentials' },
    });

    return { accessToken, user };
  }

  /**
   * For the React Native app: verifies the ID token issued by the native
   * Google Sign-In SDK, then upserts the user and returns our own JWT.
   */
  async loginWithGoogleIdToken(idToken: string, ip?: string) {
    const ticket = await this.googleClient.verifyIdToken({
      idToken,
      audience: this.config.get<string>('GOOGLE_CLIENT_ID'),
    });

    const payload = ticket.getPayload();
    if (!payload?.email) {
      throw new UnauthorizedException('Invalid Google token');
    }

    const profile: GoogleProfilePayload = {
      googleId: payload.sub,
      email: payload.email,
      firstName: payload.given_name ?? 'User',
      lastName: payload.family_name ?? '',
      avatarUrl: payload.picture,
    };

    return this.issueSessionForGoogleProfile(profile, ip);
  }

  /**
   * For the web OAuth redirect flow (e.g. an admin/advisor dashboard).
   */
  async loginWithGoogleProfile(profile: GoogleProfilePayload, ip?: string) {
    return this.issueSessionForGoogleProfile(profile, ip);
  }

  private async issueSessionForGoogleProfile(profile: GoogleProfilePayload, ip?: string) {
    const user = await this.prisma.user.upsert({
      where: { email: profile.email },
      update: {
        googleId: profile.googleId,
        avatarUrl: profile.avatarUrl,
        lastLoginAt: new Date(),
      },
      create: {
        email: profile.email,
        googleId: profile.googleId,
        firstName: profile.firstName,
        lastName: profile.lastName,
        avatarUrl: profile.avatarUrl,
        emailVerified: true,
        lastLoginAt: new Date(),
      },
    });

    const accessToken = this.jwtService.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    await this.activityLogService.log({
      userId: user.id,
      action: 'LOGIN',
      entityType: 'User',
      entityId: user.id,
      ipAddress: ip,
      metadata: { method: 'google' },
    });

    return { accessToken, user };
  }

  async getProfile(userId: string) {
    return this.prisma.user.findUnique({ where: { id: userId } });
  }

  private async generateAccountNumber(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = Math.floor(1_000_000_000 + Math.random() * 9_000_000_000).toString();
      const exists = await this.prisma.account.findUnique({
        where: { accountNumber: candidate },
      });
      if (!exists) return candidate;
    }
    throw new Error('Could not generate unique account number');
  }
}

