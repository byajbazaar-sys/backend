import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateExtensionAndEnums1730880000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    await queryRunner.query(`CREATE TYPE "e_user_type_enum" AS ENUM ('admin', 'user', 'seller')`);
    await queryRunner.query(`CREATE TYPE "e_loan_status_enum" AS ENUM ('Open', 'Closed')`);
    await queryRunner.query(`CREATE TYPE "e_loan_tenure_type_enum" AS ENUM ('Days', 'Months', 'Years')`);
    await queryRunner.query(`CREATE TYPE "e_interest_calculation_method_enum" AS ENUM ('Simple', 'Compound')`);
    await queryRunner.query(`CREATE TYPE "e_interest_type_enum" AS ENUM ('Monthly', 'Daily')`);
    await queryRunner.query(
      `CREATE TYPE "e_transaction_type_enum" AS ENUM ('Principal', 'Interest', 'TopUp', 'DuePayment')`,
    );
    await queryRunner.query(
      `CREATE TYPE "e_transaction_paid_in_enum" AS ENUM ('Cash', 'UPI', 'BankTransfer', 'Cheque', 'Other')`,
    );
    await queryRunner.query(`CREATE TYPE "e_due_type_enum" AS ENUM ('PAST_DUE', 'UPCOMING_DUE', 'OVERDUE', 'PAID')`);
    await queryRunner.query(`CREATE TYPE "e_notification_channel_enum" AS ENUM ('email', 'sms')`);
    await queryRunner.query(`CREATE TYPE "e_notification_status_enum" AS ENUM ('pending', 'sent', 'failed')`);
    await queryRunner.query(`CREATE TYPE "e_seed_type_enum" AS ENUM ('admin', 'items')`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TYPE IF EXISTS "e_seed_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "e_notification_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "e_notification_channel_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "e_due_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "e_transaction_paid_in_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "e_transaction_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "e_interest_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "e_interest_calculation_method_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "e_loan_tenure_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "e_loan_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "e_user_type_enum"`);
  }
}
