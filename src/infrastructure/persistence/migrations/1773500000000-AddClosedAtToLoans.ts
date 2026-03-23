import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddClosedAtToLoans1773500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "loans" ADD "closed_at" TIMESTAMP WITH TIME ZONE NULL`,
    );
    await queryRunner.query(
      `UPDATE "loans" SET "closed_at" = "updated_at" WHERE "status" = 'Closed' AND "closed_at" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "loans" DROP COLUMN "closed_at"`);
  }
}
