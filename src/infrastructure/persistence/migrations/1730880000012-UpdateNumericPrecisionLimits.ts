import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Updates numeric column precision to match schema limits:
 * - amount: NUMERIC(12,2)
 * - weight: NUMERIC(10,3)
 * - rate: NUMERIC(10,2)
 * - interest: NUMERIC(5,2)
 * - tenure: INTEGER (unchanged)
 */
export class UpdateNumericPrecisionLimits1730880000012 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Loans: amount columns 15,2 -> 12,2
    await queryRunner.query(`ALTER TABLE "loans" ALTER COLUMN "amount_paid" TYPE NUMERIC(12,2)`);
    await queryRunner.query(`ALTER TABLE "loans" ALTER COLUMN "amount_remaining" TYPE NUMERIC(12,2)`);
    await queryRunner.query(`ALTER TABLE "loans" ALTER COLUMN "interest_paid" TYPE NUMERIC(12,2)`);
    await queryRunner.query(`ALTER TABLE "loans" ALTER COLUMN "interest_remaining" TYPE NUMERIC(12,2)`);
    // Loans: interest_percentage 10,2 -> 5,2
    await queryRunner.query(`ALTER TABLE "loans" ALTER COLUMN "interest_percentage" TYPE NUMERIC(5,2)`);
    // Loans: current_rate stays 10,2

    // Loan items: amount 15,2 -> 12,2
    await queryRunner.query(`ALTER TABLE "loan_items" ALTER COLUMN "amount" TYPE NUMERIC(12,2)`);
    // Loan items: weights 12,4 -> 10,3
    await queryRunner.query(`ALTER TABLE "loan_items" ALTER COLUMN "net_weight_in_grams" TYPE NUMERIC(10,3)`);
    await queryRunner.query(`ALTER TABLE "loan_items" ALTER COLUMN "gross_weight_in_grams" TYPE NUMERIC(10,3)`);

    // Transactions: amount 15,2 -> 12,2
    await queryRunner.query(`ALTER TABLE "transactions" ALTER COLUMN "amount" TYPE NUMERIC(12,2)`);

    // Dues: amount columns 15,2 -> 12,2
    await queryRunner.query(`ALTER TABLE "dues" ALTER COLUMN "due_amount" TYPE NUMERIC(12,2)`);
    await queryRunner.query(`ALTER TABLE "dues" ALTER COLUMN "principal_amount" TYPE NUMERIC(12,2)`);
    await queryRunner.query(`ALTER TABLE "dues" ALTER COLUMN "interest_amount" TYPE NUMERIC(12,2)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revert to original precision
    await queryRunner.query(`ALTER TABLE "loans" ALTER COLUMN "amount_paid" TYPE NUMERIC(15,2)`);
    await queryRunner.query(`ALTER TABLE "loans" ALTER COLUMN "amount_remaining" TYPE NUMERIC(15,2)`);
    await queryRunner.query(`ALTER TABLE "loans" ALTER COLUMN "interest_paid" TYPE NUMERIC(15,2)`);
    await queryRunner.query(`ALTER TABLE "loans" ALTER COLUMN "interest_remaining" TYPE NUMERIC(15,2)`);
    await queryRunner.query(`ALTER TABLE "loans" ALTER COLUMN "interest_percentage" TYPE NUMERIC(10,2)`);

    await queryRunner.query(`ALTER TABLE "loan_items" ALTER COLUMN "amount" TYPE NUMERIC(15,2)`);
    await queryRunner.query(`ALTER TABLE "loan_items" ALTER COLUMN "net_weight_in_grams" TYPE NUMERIC(12,4)`);
    await queryRunner.query(`ALTER TABLE "loan_items" ALTER COLUMN "gross_weight_in_grams" TYPE NUMERIC(12,4)`);

    await queryRunner.query(`ALTER TABLE "transactions" ALTER COLUMN "amount" TYPE NUMERIC(15,2)`);

    await queryRunner.query(`ALTER TABLE "dues" ALTER COLUMN "due_amount" TYPE NUMERIC(15,2)`);
    await queryRunner.query(`ALTER TABLE "dues" ALTER COLUMN "principal_amount" TYPE NUMERIC(15,2)`);
    await queryRunner.query(`ALTER TABLE "dues" ALTER COLUMN "interest_amount" TYPE NUMERIC(15,2)`);
  }
}
