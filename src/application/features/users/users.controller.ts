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
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { ApiExtraModels, ApiTags, ApiBearerAuth, ApiOkResponse, ApiResponse, ApiConsumes } from '@nestjs/swagger';
import { EUserType, Identity, IIdentity, Roles, RolesGuard, UserAuthGuard } from '@shared-libs';
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
@UseGuards(ThrottlerGuard, UserAuthGuard, RolesGuard)
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
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'profilePhoto', maxCount: 1 },
      { name: 'shopLogo', maxCount: 1 },
    ]),
  )
  @HttpCode(HttpStatus.OK)
  async update(
    @Param() params: GetUserParamsModel,
    @Body() body: UpdateUserRequestModel,
    @UploadedFiles()
    files: { profilePhoto?: Express.Multer.File[]; shopLogo?: Express.Multer.File[] },
    @Identity() identity: IIdentity,
  ): Promise<UserResponseModel> {
    const profilePhoto = files?.profilePhoto?.[0];
    const shopLogo = files?.shopLogo?.[0];
    this.logger.info(
      { params, body, identity, hasProfilePhoto: !!profilePhoto, hasShopLogo: !!shopLogo },
      'update called',
    );
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
    if (shopLogo) {
      userData.shopLogo = shopLogo.buffer;
      userData.shopLogoContentType = shopLogo.mimetype;
      userData.shopLogoFileName = shopLogo.originalname;
    }

    const user = await this.usersService.update(params.id, userData);
    return plainToInstance(
      UserResponseModel,
      {
        ...user,
        profilePhotoUrl: (user as User & { profilePhotoUrl?: string }).profilePhotoUrl ?? user.profilePhotoRef,
        shopLogoUrl: (user as User & { shopLogoUrl?: string }).shopLogoUrl ?? user.shopLogoRef,
      },
      { excludeExtraneousValues: true },
    );
  }
}
