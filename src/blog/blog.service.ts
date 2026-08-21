import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CloudinaryService } from '../common/cloudinary/cloudinary.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateBlogPostDto } from './dto/create-blog-post.dto';
import { UpdateBlogPostDto } from './dto/update-blog-post.dto';
import { NotificationType, Prisma } from '@prisma/client';

@Injectable()
export class BlogService {
  private readonly logger = new Logger(BlogService.name);

  constructor(
    private prisma: PrismaService,
    private cloudinary: CloudinaryService,
    private notifications: NotificationsService,
  ) {}

  private slugify(text: string): string {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/[\s-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  private calculateReadTime(content: string): number {
    const wordCount = content.trim().split(/\s+/).length;
    return Math.max(1, Math.ceil(wordCount / 200));
  }

  // ─── Public Endpoints ───────────────────────────────────────────────

  async listPublished(query?: {
    q?: string;
    category?: string;
    tag?: string;
    skip?: number;
    take?: number;
  }) {
    const skip = query?.skip || 0;
    const take = query?.take || 12;

    const where: Prisma.BlogPostWhereInput = {
      isPublished: true,
    };

    if (query?.category && query.category !== 'ALL') {
      where.category = { equals: query.category, mode: 'insensitive' };
    }

    if (query?.tag) {
      where.tags = { has: query.tag };
    }

    if (query?.q) {
      where.OR = [
        { title: { contains: query.q, mode: 'insensitive' } },
        { excerpt: { contains: query.q, mode: 'insensitive' } },
        { content: { contains: query.q, mode: 'insensitive' } },
      ];
    }

    const [posts, total] = await Promise.all([
      this.prisma.blogPost.findMany({
        where,
        orderBy: { publishedAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.blogPost.count({ where }),
    ]);

    return { data: posts, total, skip, take };
  }

  async getBySlug(slug: string) {
    const post = await this.prisma.blogPost.findUnique({
      where: { slug },
    });

    if (!post || !post.isPublished) {
      throw new NotFoundException(`Blog post with slug "${slug}" not found`);
    }

    // Get 3 related posts in the same category or latest
    const related = await this.prisma.blogPost.findMany({
      where: {
        isPublished: true,
        id: { not: post.id },
        category: post.category,
      },
      take: 3,
      orderBy: { publishedAt: 'desc' },
    });

    return { post, related };
  }

  // ─── Admin Endpoints ────────────────────────────────────────────────

  async listAllAdmin(query?: {
    q?: string;
    category?: string;
    isPublished?: boolean;
    skip?: number;
    take?: number;
  }) {
    const skip = query?.skip || 0;
    const take = query?.take || 50;

    const where: Prisma.BlogPostWhereInput = {};

    if (query?.isPublished !== undefined) {
      where.isPublished = query.isPublished;
    }

    if (query?.category && query.category !== 'ALL') {
      where.category = query.category;
    }

    if (query?.q) {
      where.OR = [
        { title: { contains: query.q, mode: 'insensitive' } },
        { excerpt: { contains: query.q, mode: 'insensitive' } },
      ];
    }

    const [posts, total] = await Promise.all([
      this.prisma.blogPost.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.blogPost.count({ where }),
    ]);

    return { data: posts, total, skip, take };
  }

  async uploadCoverImage(imageDataUri: string) {
    return this.cloudinary.uploadImage(imageDataUri, 'soboggan/blog');
  }

  async create(dto: CreateBlogPostDto) {
    let slug = dto.slug ? this.slugify(dto.slug) : this.slugify(dto.title);
    if (!slug) {
      slug = `post-${Date.now()}`;
    }

    // Check slug uniqueness
    const existing = await this.prisma.blogPost.findUnique({
      where: { slug },
    });
    if (existing) {
      slug = `${slug}-${Math.floor(1000 + Math.random() * 9000)}`;
    }

    const readTime = this.calculateReadTime(dto.content);
    const isPublished = dto.isPublished ?? true;

    const post = await this.prisma.blogPost.create({
      data: {
        title: dto.title,
        slug,
        excerpt: dto.excerpt,
        content: dto.content,
        coverImageUrl: dto.coverImageUrl || null,
        cloudinaryId: dto.cloudinaryId || null,
        authorName: dto.authorName || 'Soboggan Research Team',
        category: dto.category || 'Market Strategy',
        tags: dto.tags || [],
        isPublished,
        readTime,
        publishedAt: isPublished ? new Date() : new Date(0),
      },
    });

    // If published and notification requested, broadcast to all mobile app clients
    if (isPublished && dto.notifyClients !== false) {
      this.notifications
        .broadcastToAllClients({
          title: `📈 New Insight: ${post.title}`,
          body: post.excerpt.length > 120 ? `${post.excerpt.slice(0, 117)}...` : post.excerpt,
          type: NotificationType.MARKETING,
          metadata: {
            type: 'BLOG_POST',
            postId: post.id,
            slug: post.slug,
            title: post.title,
          },
        })
        .catch((err) => {
          this.logger.warn(`Failed to broadcast blog push notification: ${err.message}`);
        });
    }

    return post;
  }

  async update(id: string, dto: UpdateBlogPostDto) {
    const existing = await this.prisma.blogPost.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Blog post with ID ${id} not found`);
    }

    let slug = existing.slug;
    if (dto.slug && dto.slug !== existing.slug) {
      slug = this.slugify(dto.slug);
      const duplicate = await this.prisma.blogPost.findUnique({ where: { slug } });
      if (duplicate && duplicate.id !== id) {
        throw new ConflictException(`Slug "${slug}" is already in use`);
      }
    }

    const content = dto.content !== undefined ? dto.content : existing.content;
    const readTime = this.calculateReadTime(content);
    const wasPublished = existing.isPublished;
    const isNowPublished = dto.isPublished !== undefined ? dto.isPublished : wasPublished;

    const post = await this.prisma.blogPost.update({
      where: { id },
      data: {
        title: dto.title,
        slug,
        excerpt: dto.excerpt,
        content: dto.content,
        coverImageUrl: dto.coverImageUrl,
        cloudinaryId: dto.cloudinaryId,
        authorName: dto.authorName,
        category: dto.category,
        tags: dto.tags,
        isPublished: dto.isPublished,
        readTime,
        publishedAt: !wasPublished && isNowPublished ? new Date() : undefined,
      },
    });

    // Notify clients if transitioning from draft -> published
    if (!wasPublished && isNowPublished && dto.notifyClients !== false) {
      this.notifications
        .broadcastToAllClients({
          title: `📈 New Insight: ${post.title}`,
          body: post.excerpt.length > 120 ? `${post.excerpt.slice(0, 117)}...` : post.excerpt,
          type: NotificationType.MARKETING,
          metadata: {
            type: 'BLOG_POST',
            postId: post.id,
            slug: post.slug,
            title: post.title,
          },
        })
        .catch((err) => {
          this.logger.warn(`Failed to broadcast blog push notification: ${err.message}`);
        });
    }

    return post;
  }

  async delete(id: string) {
    const post = await this.prisma.blogPost.findUnique({ where: { id } });
    if (!post) {
      throw new NotFoundException(`Blog post with ID ${id} not found`);
    }

    if (post.cloudinaryId) {
      this.cloudinary.deleteImage(post.cloudinaryId).catch(() => {});
    }

    return this.prisma.blogPost.delete({ where: { id } });
  }
}
