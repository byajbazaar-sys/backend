import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropTransactionPaidAt1730880000011 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "transactions" DROP COLUMN "paid_at"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "transactions" ADD "paid_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()`,
    );
  }
}
