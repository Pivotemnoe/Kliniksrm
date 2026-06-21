import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AuthEmployee } from '../auth/auth.types';
import { CurrentEmployee } from '../auth/decorators/current-employee.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CreateNewsPostDto } from './dto/create-news-post.dto';
import { ListNewsQueryDto } from './dto/list-news-query.dto';
import { UpdateNewsPostDto } from './dto/update-news-post.dto';
import { NewsService } from './news.service';

@ApiTags('news')
@Controller('v1/news')
export class NewsController {
  constructor(private readonly newsService: NewsService) {}

  @Get()
  @RequirePermissions('news.read')
  @ApiOkResponse({ description: 'Internal clinic news feed.' })
  listPosts(@Query() query: ListNewsQueryDto, @CurrentEmployee() actor: AuthEmployee) {
    return this.newsService.listPosts(query, actor);
  }

  @Post()
  @RequirePermissions('news.manage')
  @ApiCreatedResponse({ description: 'Internal news post created.' })
  createPost(@Body() dto: CreateNewsPostDto, @CurrentEmployee() actor: AuthEmployee) {
    return this.newsService.createPost(dto, actor);
  }

  @Patch(':postId')
  @RequirePermissions('news.manage')
  @ApiOkResponse({ description: 'Internal news post updated.' })
  updatePost(@Param('postId') postId: string, @Body() dto: UpdateNewsPostDto, @CurrentEmployee() actor: AuthEmployee) {
    return this.newsService.updatePost(postId, dto, actor);
  }

  @Post(':postId/archive')
  @RequirePermissions('news.manage')
  @ApiOkResponse({ description: 'Internal news post archived.' })
  archivePost(@Param('postId') postId: string, @CurrentEmployee() actor: AuthEmployee) {
    return this.newsService.archivePost(postId, actor);
  }

  @Post(':postId/read')
  @RequirePermissions('news.read')
  @ApiOkResponse({ description: 'Internal news post marked as read.' })
  markRead(@Param('postId') postId: string, @CurrentEmployee() actor: AuthEmployee) {
    return this.newsService.markRead(postId, actor);
  }
}
