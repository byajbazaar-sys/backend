import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { EUserType, Roles, RolesGuard, UserAuthGuard } from '@shared-libs';
import { plainToInstance } from 'class-transformer';
import {
  CreatePlanRequestModel,
  PlanResponseModel,
  UpdatePlanRequestModel,
} from './models';
import { IPlanService, PLAN_SERVICE } from './service/i-plan.service';

@ApiTags('payments')
@ApiBearerAuth('user')
@UseGuards(ThrottlerGuard, UserAuthGuard, RolesGuard)
@Roles(EUserType.Admin)
@Controller('payments/plans')
export class PlansController {
  constructor(@Inject(PLAN_SERVICE) private readonly planService: IPlanService) {}

  @Get()
  @ApiOperation({ summary: 'List subscription plans (admin)' })
  @ApiOkResponse({ type: [PlanResponseModel] })
  async list(): Promise<PlanResponseModel[]> {
    const plans = await this.planService.list();
    return plainToInstance(PlanResponseModel, plans, { excludeExtraneousValues: true });
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create subscription plan (admin)' })
  @ApiOkResponse({ type: PlanResponseModel })
  async create(@Body() body: CreatePlanRequestModel): Promise<PlanResponseModel> {
    const plan = await this.planService.create(body);
    return plainToInstance(PlanResponseModel, plan, { excludeExtraneousValues: true });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update subscription plan (admin)' })
  @ApiOkResponse({ type: PlanResponseModel })
  async update(
    @Param('id') id: string,
    @Body() body: UpdatePlanRequestModel,
  ): Promise<PlanResponseModel> {
    const plan = await this.planService.update(id, body);
    return plainToInstance(PlanResponseModel, plan, { excludeExtraneousValues: true });
  }
}
