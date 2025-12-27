
import { UseGuards, Controller, Post, HttpStatus, HttpCode, Body } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { USER_STRATEGY, RolesGuard } from '@shared-libs';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { CreateCustomerRequestModel } from './models';

@ApiTags('customers')
@ApiBearerAuth('user')
@UseGuards(ThrottlerGuard, AuthGuard(USER_STRATEGY), RolesGuard)
@Controller('customers')
export class CustomersController {
  constructor(@InjectPinoLogger(CustomersController.name) private readonly logger: PinoLogger) {}

  // @Get()
  // @ApiOkResponse({ type: PaginatedUserResponseModel })
  // @Role(EUserType.Admin)
  // @HttpCode(HttpStatus.OK)
  // async findAll(
  //   @Identity() identity: IIdentity,
  //   @Query() query: ListUsersQueryModel,
  // ): Promise<Paged<UserResponseModel>> {
  //   this.logger.info({ identity, query }, 'findAll called');
  //   return ;
  // }

  @Post()
  @ApiResponse({ status: HttpStatus.CREATED, type: String })
  @HttpCode(HttpStatus.OK)
  async create(@Body() body: CreateCustomerRequestModel): Promise<string> {
    this.logger.info({ body }, 'create called');
    // TODO: Implement customer creation logic
    console.log('Received customer data:', body);
    return 'Customer created successfully';
  }
}
