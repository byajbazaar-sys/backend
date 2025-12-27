import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiExtraModels,  ApiTags, ApiBearerAuth, ApiOkResponse, ApiResponse } from '@nestjs/swagger';
import { EUserType, Identity, IIdentity, Paged, Role, RolesGuard, USER_STRATEGY,  } from '@shared-libs';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import {
  CreateUserRequestModel,
  GetUserParamsModel,
  ListUsersQueryModel,
  PaginatedUserResponseModel,
  UpdateUserRequestModel,
  UpdateUserTypeRequestModel,
  UserResponseModel,
} from './models';
import { ThrottlerGuard } from '@nestjs/throttler';

@ApiTags('users')
@ApiBearerAuth('user')
@UseGuards(ThrottlerGuard, AuthGuard(USER_STRATEGY), RolesGuard)
@ApiExtraModels(UserResponseModel, PaginatedUserResponseModel)
@Controller('users')
export class UsersController {
  constructor(@InjectPinoLogger(UsersController.name) private readonly logger: PinoLogger) {}

  @Get()
  @ApiOkResponse({ type: PaginatedUserResponseModel })
  @Role(EUserType.Admin)
  @HttpCode(HttpStatus.OK)
  async findAll(
    @Identity() identity: IIdentity,
    @Query() query: ListUsersQueryModel,
  ): Promise<Paged<UserResponseModel>> {
    this.logger.info({ identity, query }, 'findAll called');
    return ;
  }

  @Get(':id')
  @ApiResponse({ status: HttpStatus.OK, type: UserResponseModel })
  @HttpCode(HttpStatus.OK)
  async findOne(@Param() params: GetUserParamsModel, @Identity() identity: IIdentity): Promise<UserResponseModel> {
    this.logger.info({ params }, 'findOne called');
    if (params.id !== identity.userId && identity.userType !== EUserType.Admin) {
      throw new ForbiddenException('You are not authorized to fetch this user');
    }
    return ;
  }

  @Post()
  @ApiResponse({ status: HttpStatus.CREATED, type: UserResponseModel })
  @HttpCode(HttpStatus.OK)
  async create(@Body() body: CreateUserRequestModel): Promise<UserResponseModel> {
    this.logger.info({ body }, 'create called');
    return ;
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
    return ;
  }

  @Delete(':id')
  @ApiResponse({ status: HttpStatus.OK })
  @HttpCode(HttpStatus.OK)
  async remove(@Param() params: GetUserParamsModel, @Identity() identity: IIdentity): Promise<void> {
    this.logger.info({ params }, 'remove called');
    if (params.id !== identity.userId && identity.userType !== EUserType.Admin) {
      throw new ForbiddenException('You are not authorized to delete this user');
    }
    return ;
  }

  @Patch(':id/type')
  @ApiOkResponse({ type: UserResponseModel })
  @Role(EUserType.Admin)
  @HttpCode(HttpStatus.OK)
  async updateUserType(
    @Param() params: GetUserParamsModel,
    @Body() body: UpdateUserTypeRequestModel,
  ): Promise<UserResponseModel> {
    this.logger.info({ params, body }, 'updateUserType called');
    return ;
  }
}
