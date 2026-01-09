import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiExtraModels, ApiTags, ApiBearerAuth, ApiOkResponse, ApiResponse } from '@nestjs/swagger';
import { EUserType, Identity, IIdentity, Paged, Roles, RolesGuard, USER_STRATEGY } from '@shared-libs';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import {
  GetUserParamsModel,
  ListUsersQueryModel,
  PaginatedUserResponseModel,
  UpdateUserRequestModel,
  UserResponseModel,
} from './models';
import { ThrottlerGuard } from '@nestjs/throttler';
import { IUsersService, USERS_SERVICE } from './service';
import { plainToInstance } from 'class-transformer';

@ApiTags('users')
@ApiBearerAuth('user')
@UseGuards(ThrottlerGuard, AuthGuard(USER_STRATEGY), RolesGuard)
@ApiExtraModels(UserResponseModel, PaginatedUserResponseModel)
@Controller('users')
export class UsersController {
  constructor(
    @Inject(USERS_SERVICE) private readonly usersService: IUsersService,
    @InjectPinoLogger(UsersController.name) private readonly logger: PinoLogger,
  ) {}

  @Get()
  @ApiOkResponse({ type: PaginatedUserResponseModel })
  @Roles(EUserType.Admin)
  @HttpCode(HttpStatus.OK)
  async findAll(
    @Identity() identity: IIdentity,
    @Query() query: ListUsersQueryModel,
  ): Promise<Paged<UserResponseModel>> {
    this.logger.info({ identity, query }, 'findAll called');
    return;
  }

  @Get(':id')
  @Roles(EUserType.Admin, EUserType.User)
  @ApiResponse({ status: HttpStatus.OK, type: UserResponseModel })
  @HttpCode(HttpStatus.OK)
  async findOne(@Param() params: GetUserParamsModel, @Identity() identity: IIdentity): Promise<UserResponseModel> {
    this.logger.info({ params }, 'findOne called');
    if (params.id !== identity.userId && identity.userType !== EUserType.Admin) {
      throw new ForbiddenException('You are not authorized to fetch this user');
    }

    const user = await this.usersService.findOne(params.id);
    return plainToInstance(UserResponseModel, user, { excludeExtraneousValues: true });
  }

  @Patch(':id')
  @ApiResponse({ status: HttpStatus.OK, type: UserResponseModel })
  @HttpCode(HttpStatus.OK)
  async update(
    @Param() params: GetUserParamsModel,
    @Body() body: UpdateUserRequestModel,
    @Identity() identity: IIdentity,
  ): Promise<UserResponseModel> {
    this.logger.info({ params, body }, 'update called');
    if (params.id !== identity.userId && identity.userType !== EUserType.Admin) {
      throw new ForbiddenException('You are not authorized to update this user');
    }
    return;
  }
}
