import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import { ApiExtraModels, ApiTags, ApiBearerAuth, ApiOkResponse, ApiResponse, ApiConsumes } from '@nestjs/swagger';
import { EUserType, Identity, IIdentity, Roles, RolesGuard, USER_STRATEGY } from '@shared-libs';
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
import { User } from './domain';

@ApiTags('users')
@ApiBearerAuth('user')
@UseGuards(ThrottlerGuard, AuthGuard(USER_STRATEGY), RolesGuard)
@ApiExtraModels(UserResponseModel, PaginatedUserResponseModel)
@Controller('users')
export class UsersController {
  constructor(
    @Inject(USERS_SERVICE) private readonly usersService: IUsersService,
    @InjectPinoLogger(UsersController.name) private readonly logger: PinoLogger,
  ) { }

  @Get()
  @ApiOkResponse({ type: PaginatedUserResponseModel })
  @Roles(EUserType.Admin)
  @HttpCode(HttpStatus.OK)
  async findAll(
    @Identity() identity: IIdentity,
    @Query() query: ListUsersQueryModel,
  ): Promise<PaginatedUserResponseModel> {
    this.logger.info({ identity, query }, 'findAll called');
    const users = await this.usersService.findAll(query);
    // Transform Paged<User> to PaginatedUserResponseModel format
    const userResponses = plainToInstance(UserResponseModel, users.items, {
      excludeExtraneousValues: true,
    });
    return {
      items: userResponses,
      meta: {
        page: users.page,
        limit: users.perPage,
        totalItems: users.totalCount,
        totalPages: users.totalPages,
      },
    };
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
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('profilePhoto'))
  @HttpCode(HttpStatus.OK)
  async update(
    @Param() params: GetUserParamsModel,
    @Body() body: UpdateUserRequestModel,
    @UploadedFile() profilePhoto: Express.Multer.File,
    @Identity() identity: IIdentity,
  ): Promise<UserResponseModel> {
    this.logger.info({ params, body, identity, hasProfilePhoto: !!profilePhoto }, 'update called');
    if (params.id !== identity.userId && identity.userType !== EUserType.Admin) {
      throw new ForbiddenException('You are not authorized to update this user');
    }

    const userData = plainToInstance(User, body, {
      excludeExtraneousValues: true,
    });

    // Attach profile photo file if provided
    if (profilePhoto) {
      userData.profilePhoto = profilePhoto.buffer;
      userData.profilePhotoContentType = profilePhoto.mimetype;
      userData.profilePhotoFileName = profilePhoto.originalname;
    }

    const user = await this.usersService.update(params.id, userData);
    return plainToInstance(UserResponseModel, { ...user, profilePhotoUrl: user.profilePhotoRef }, { excludeExtraneousValues: true });
  }
}
