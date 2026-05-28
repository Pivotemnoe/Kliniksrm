import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AuthEmployee } from '../auth/auth.types';
import { CurrentEmployee } from '../auth/decorators/current-employee.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { AppointmentsService } from './appointments.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { ListAppointmentsQueryDto } from './dto/list-appointments-query.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';

@ApiTags('appointments')
@Controller('v1/appointments')
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Get()
  @RequirePermissions('appointments.read')
  @ApiOkResponse({ description: 'Appointment calendar list.' })
  listAppointments(@Query() query: ListAppointmentsQueryDto) {
    return this.appointmentsService.listAppointments(query);
  }

  @Post()
  @RequirePermissions('appointments.manage')
  @ApiCreatedResponse({ description: 'Appointment created.' })
  createAppointment(@Body() dto: CreateAppointmentDto, @CurrentEmployee() actor: AuthEmployee) {
    return this.appointmentsService.createAppointment(dto, actor.id);
  }

  @Get(':appointmentId')
  @RequirePermissions('appointments.read')
  @ApiOkResponse({ description: 'Appointment card.' })
  getAppointment(@Param('appointmentId') appointmentId: string) {
    return this.appointmentsService.getAppointment(appointmentId);
  }

  @Patch(':appointmentId')
  @RequirePermissions('appointments.manage')
  @ApiOkResponse({ description: 'Appointment updated.' })
  updateAppointment(
    @Param('appointmentId') appointmentId: string,
    @Body() dto: UpdateAppointmentDto,
    @CurrentEmployee() actor: AuthEmployee,
  ) {
    return this.appointmentsService.updateAppointment(appointmentId, dto, actor.id);
  }

  @Post(':appointmentId/arrive')
  @RequirePermissions('appointments.manage')
  @ApiOkResponse({ description: 'Appointment marked as arrived.' })
  arriveAppointment(@Param('appointmentId') appointmentId: string, @CurrentEmployee() actor: AuthEmployee) {
    return this.appointmentsService.arriveAppointment(appointmentId, actor.id);
  }

  @Post(':appointmentId/start')
  @RequirePermissions('appointments.manage')
  @ApiOkResponse({ description: 'Appointment moved to in-progress.' })
  startAppointment(@Param('appointmentId') appointmentId: string, @CurrentEmployee() actor: AuthEmployee) {
    return this.appointmentsService.startAppointment(appointmentId, actor.id);
  }

  @Post(':appointmentId/complete')
  @RequirePermissions('appointments.manage')
  @ApiOkResponse({ description: 'Appointment completed.' })
  completeAppointment(@Param('appointmentId') appointmentId: string, @CurrentEmployee() actor: AuthEmployee) {
    return this.appointmentsService.completeAppointment(appointmentId, actor.id);
  }

  @Post(':appointmentId/cancel')
  @RequirePermissions('appointments.manage')
  @ApiOkResponse({ description: 'Appointment cancelled.' })
  cancelAppointment(@Param('appointmentId') appointmentId: string, @CurrentEmployee() actor: AuthEmployee) {
    return this.appointmentsService.cancelAppointment(appointmentId, actor.id);
  }
}
