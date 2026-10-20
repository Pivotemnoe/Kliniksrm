import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { CurrentEmployee } from '../auth/decorators/current-employee.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { AuthEmployee } from '../auth/auth.types';
import { PetHotelService } from './pet-hotel.service';
import { PetHotelBookingDto, PetHotelChangeDto, PetHotelRoomDto, PetHotelSettingsDto, PetHotelSetupDto, PetHotelStatusDto } from './pet-hotel.dto';
class AvailabilityDto extends PetHotelBookingDto { @IsOptional() @IsString() reservationId?: string; }

@Controller('v1/pet-hotel')
@RequirePermissions('pet_hotel.read')
export class PetHotelController {
  constructor(private readonly service: PetHotelService) {}
  @Get('overview') overview(@CurrentEmployee() actor: AuthEmployee) { return this.service.overview(actor); }
  @Get('bookings') bookings(@Query('from') from?: string, @Query('to') to?: string) { return this.service.bookings(from, to); }
  @Get('bookings/:id') booking(@Param('id') id: string) { return this.service.booking(id); }
  @Get('clients') clients(@Query('search') search?: string) { return this.service.clients(search); }
  @Post('availability') @RequirePermissions('pet_hotel.operate') availability(@Body() dto: AvailabilityDto) { return this.service.availability(dto); }
  @Post('bookings') @RequirePermissions('pet_hotel.operate') book(@Body() dto: PetHotelBookingDto, @CurrentEmployee() actor: AuthEmployee) { return this.service.book(dto, actor); }
  @Patch('bookings/:id') @RequirePermissions('pet_hotel.operate') update(@Param('id') id: string, @Body() dto: PetHotelChangeDto, @CurrentEmployee() actor: AuthEmployee) { return this.service.book(dto, actor, id); }
  @Post('bookings/:id/status') @RequirePermissions('pet_hotel.operate') status(@Param('id') id: string, @Body() dto: PetHotelStatusDto, @CurrentEmployee() actor: AuthEmployee) { return this.service.status(id, dto, actor); }
  @Post('rooms/setup') @RequirePermissions('pet_hotel.manage') setup(@Body() dto: PetHotelSetupDto, @CurrentEmployee() actor: AuthEmployee) { return this.service.setupRooms(dto.clientKey, actor); }
  @Post('rooms') @RequirePermissions('pet_hotel.manage') room(@Body() dto: PetHotelRoomDto, @CurrentEmployee() actor: AuthEmployee) { return this.service.saveRoom(dto, actor); }
  @Patch('rooms/:id') @RequirePermissions('pet_hotel.manage') updateRoom(@Param('id') id: string, @Body() dto: PetHotelRoomDto, @CurrentEmployee() actor: AuthEmployee) { return this.service.saveRoom(dto, actor, id); }
  @Patch('settings') @RequirePermissions('pet_hotel.manage') settings(@Body() dto: PetHotelSettingsDto, @CurrentEmployee() actor: AuthEmployee) { return this.service.saveSettings(dto, actor); }
}
