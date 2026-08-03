import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPerGramMakingChargeMode1778400000000 implements MigrationInterface {
  name = 'AddPerGramMakingChargeMode1778400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "e_making_charge_mode_enum" ADD VALUE IF NOT EXISTS 'PER_GRAM'
    `);
  }

  public async down(): Promise<void> {
    // Postgres does not support removing enum values safely.
  }
}
