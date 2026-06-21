import { PartialType } from '@nestjs/swagger';
import { CreateSchedulingResourceDto } from './create-scheduling-resource.dto';

export class UpdateSchedulingResourceDto extends PartialType(CreateSchedulingResourceDto) {}
