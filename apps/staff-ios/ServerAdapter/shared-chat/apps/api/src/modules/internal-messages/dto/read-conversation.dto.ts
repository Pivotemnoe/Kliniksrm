import { IsOptional, IsUUID } from 'class-validator';
export class ReadConversationDto { @IsOptional() @IsUUID() throughId?: string; }
