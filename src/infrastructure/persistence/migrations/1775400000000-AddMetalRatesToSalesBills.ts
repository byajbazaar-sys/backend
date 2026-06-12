import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMetalRatesToSalesBills1775400000000 implements MigrationInterface {
  name = 'AddMetalRatesToSalesBills1775400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "sales_bills"
        ADD COLUMN IF NOT EXISTS "metal_rates" jsonb
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "sales_bills"
        DROP COLUMN IF EXISTS "metal_rates"
    `);
  }
}
