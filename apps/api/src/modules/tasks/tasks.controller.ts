import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AuthEmployee } from '../auth/auth.types';
import { CurrentEmployee } from '../auth/decorators/current-employee.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CreateTaskDto } from './dto/create-task.dto';
import { ListTasksQueryDto } from './dto/list-tasks-query.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TasksService } from './tasks.service';

@ApiTags('tasks')
@Controller('v1/tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get()
  @RequirePermissions('tasks.read')
  @ApiOkResponse({ description: 'Task list.' })
  listTasks(@Query() query: ListTasksQueryDto, @CurrentEmployee() actor: AuthEmployee) {
    return this.tasksService.listTasks(query, actor);
  }

  @Post()
  @RequirePermissions('tasks.manage')
  @ApiCreatedResponse({ description: 'Task created.' })
  createTask(@Body() dto: CreateTaskDto, @CurrentEmployee() actor: AuthEmployee) {
    return this.tasksService.createTask(dto, actor.id);
  }

  @Get(':taskId')
  @RequirePermissions('tasks.read')
  @ApiOkResponse({ description: 'Task card.' })
  getTask(@Param('taskId') taskId: string) {
    return this.tasksService.getTask(taskId);
  }

  @Patch(':taskId')
  @RequirePermissions('tasks.manage')
  @ApiOkResponse({ description: 'Task updated.' })
  updateTask(@Param('taskId') taskId: string, @Body() dto: UpdateTaskDto, @CurrentEmployee() actor: AuthEmployee) {
    return this.tasksService.updateTask(taskId, dto, actor.id);
  }

  @Post(':taskId/done')
  @RequirePermissions('tasks.manage')
  @ApiOkResponse({ description: 'Task completed.' })
  completeTask(@Param('taskId') taskId: string, @CurrentEmployee() actor: AuthEmployee) {
    return this.tasksService.completeTask(taskId, actor.id);
  }

  @Post(':taskId/cancel')
  @RequirePermissions('tasks.manage')
  @ApiOkResponse({ description: 'Task cancelled.' })
  cancelTask(@Param('taskId') taskId: string, @CurrentEmployee() actor: AuthEmployee) {
    return this.tasksService.cancelTask(taskId, actor.id);
  }

  @Post(':taskId/reopen')
  @RequirePermissions('tasks.manage')
  @ApiOkResponse({ description: 'Task reopened.' })
  reopenTask(@Param('taskId') taskId: string, @CurrentEmployee() actor: AuthEmployee) {
    return this.tasksService.reopenTask(taskId, actor.id);
  }

  @Post(':taskId/archive')
  @RequirePermissions('tasks.manage')
  @ApiOkResponse({ description: 'Task archived.' })
  archiveTask(@Param('taskId') taskId: string, @CurrentEmployee() actor: AuthEmployee) {
    return this.tasksService.archiveTask(taskId, actor.id);
  }
}
