import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AuthEmployee } from '../auth/auth.types';
import { AllowRemoteMutation } from '../auth/decorators/allow-remote-mutation.decorator';
import { CurrentEmployee } from '../auth/decorators/current-employee.decorator';
import { RequireRoles } from '../auth/decorators/require-permissions.decorator';
import { DirectorBriefingService } from './director-briefing.service';
import { UpdateDirectorBriefingSettingsDto } from './dto/update-director-briefing-settings.dto';

@ApiTags('director-briefing')
@Controller('v1/director-briefing')
@RequireRoles('director')
export class DirectorBriefingController {
  constructor(private readonly directorBriefingService: DirectorBriefingService) {}

  @Get('settings')
  @ApiOkResponse({ description: 'Настройки автоматической ежедневной сводки директора.' })
  getSettings() {
    return this.directorBriefingService.getSettings();
  }

  @Patch('settings')
  @AllowRemoteMutation()
  @ApiOkResponse({ description: 'Настройки ежедневной сводки сохранены.' })
  updateSettings(@Body() dto: UpdateDirectorBriefingSettingsDto, @CurrentEmployee() actor: AuthEmployee) {
    return this.directorBriefingService.updateSettings(dto, actor.id);
  }

  @Get()
  @ApiOkResponse({ description: 'Последние фактические ежедневные сводки директора.' })
  list() {
    return this.directorBriefingService.list();
  }

  @Post('generate')
  @AllowRemoteMutation()
  @ApiOkResponse({ description: 'Сводка директора сформирована по актуальным данным.' })
  generate(@CurrentEmployee() actor: AuthEmployee) {
    return this.directorBriefingService.generateNow(actor.id);
  }
}
