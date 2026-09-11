import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExtendOrderActivityTypeEnum1791300000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "e_order_activity_type_enum" ADD VALUE IF NOT EXISTS 'ATTACHMENT_ADDED'
    `);
    await queryRunner.query(`
      ALTER TYPE "e_order_activity_type_enum" ADD VALUE IF NOT EXISTS 'ATTACHMENT_REMOVED'
    `);
    await queryRunner.query(`
      ALTER TYPE "e_order_activity_type_enum" ADD VALUE IF NOT EXISTS 'CUSTOMER_NOTIFIED'
    `);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL does not support removing enum values safely.
  }
}
