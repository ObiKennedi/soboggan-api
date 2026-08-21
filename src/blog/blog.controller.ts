import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { BlogService } from './blog.service';
import { CreateBlogPostDto } from './dto/create-blog-post.dto';
import { UpdateBlogPostDto } from './dto/update-blog-post.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('blog')
export class BlogController {
  constructor(private readonly blogService: BlogService) {}

  // ─── Public Endpoints ───────────────────────────────────────────────

  @Get()
  listPublished(
    @Query('q') q?: string,
    @Query('category') category?: string,
    @Query('tag') tag?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.blogService.listPublished({
      q,
      category,
      tag,
      skip: skip ? parseInt(skip, 10) : 0,
      take: take ? parseInt(take, 10) : 12,
    });
  }

  @Get(':slug')
  getBySlug(@Param('slug') slug: string) {
    return this.blogService.getBySlug(slug);
  }

  // ─── Admin Endpoints ────────────────────────────────────────────────

  @Get('admin/all')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'ADVISOR')
  listAllAdmin(
    @Query('q') q?: string,
    @Query('category') category?: string,
    @Query('isPublished') isPublished?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.blogService.listAllAdmin({
      q,
      category,
      isPublished: isPublished !== undefined ? isPublished === 'true' : undefined,
      skip: skip ? parseInt(skip, 10) : 0,
      take: take ? parseInt(take, 10) : 50,
    });
  }

  @Post('admin/upload')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  uploadImage(@Body('imageDataUri') imageDataUri: string) {
    return this.blogService.uploadCoverImage(imageDataUri);
  }

  @Post('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  create(@Body() dto: CreateBlogPostDto) {
    return this.blogService.create(dto);
  }

  @Patch('admin/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  update(@Param('id') id: string, @Body() dto: UpdateBlogPostDto) {
    return this.blogService.update(id, dto);
  }

  @Delete('admin/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  delete(@Param('id') id: string) {
    return this.blogService.delete(id);
  }
}
