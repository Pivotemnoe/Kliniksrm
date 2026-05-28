import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AuthenticatedRequest, CookieResponse } from './auth.types';
import { AuthService } from './auth.service';
import { CurrentEmployee } from './decorators/current-employee.decorator';
import { Public } from './decorators/public.decorator';
import { LoginDto } from './dto/login.dto';
import { getCookieOptions, SESSION_COOKIE_NAME } from './session-cookie';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  @ApiOkResponse({ description: 'Login with phone/email and password.' })
  async login(@Body() dto: LoginDto, @Req() request: AuthenticatedRequest, @Res({ passthrough: true }) response: CookieResponse) {
    const result = await this.authService.login(dto, getIpAddress(request), getUserAgent(request));
    const maxAgeMs = result.expiresAt.getTime() - Date.now();

    response.cookie(SESSION_COOKIE_NAME, result.token, getCookieOptions(maxAgeMs));

    return {
      employee: result.employee,
      expiresAt: result.expiresAt,
    };
  }

  @Get('me')
  @ApiOkResponse({ description: 'Current authenticated employee.' })
  me(@CurrentEmployee() employee: unknown) {
    return { employee };
  }

  @Post('logout')
  @HttpCode(200)
  @ApiCreatedResponse({ description: 'Logout current session.' })
  async logout(@Req() request: AuthenticatedRequest, @Res({ passthrough: true }) response: CookieResponse) {
    if (request.auth) {
      await this.authService.logout(request.auth.sessionId, request.auth.employee.id, getIpAddress(request));
    }

    response.clearCookie(SESSION_COOKIE_NAME, getCookieOptions());

    return { ok: true };
  }
}

function getIpAddress(request: AuthenticatedRequest) {
  const forwardedFor = request.headers['x-forwarded-for'];

  if (typeof forwardedFor === 'string') {
    return forwardedFor.split(',')[0]?.trim() ?? null;
  }

  return request.ip ?? request.socket?.remoteAddress ?? null;
}

function getUserAgent(request: AuthenticatedRequest) {
  const userAgent = request.headers['user-agent'];
  return Array.isArray(userAgent) ? userAgent.join(' ') : userAgent ?? null;
}

