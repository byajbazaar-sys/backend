import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTransactionLogUpdatePaidAtAction1791600000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "e_transaction_log_action_enum" ADD VALUE IF NOT EXISTS 'UPDATE_PAID_AT'
    `);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL does not support removing enum values safely.
  }
}
