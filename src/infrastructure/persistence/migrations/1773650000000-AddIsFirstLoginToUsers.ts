import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIsFirstLoginToUsers1773650000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "is_first_login" boolean NOT NULL DEFAULT true`,
    );
    await queryRunner.query(
      `UPDATE "users" SET "is_first_login" = false WHERE "last_login_at" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "is_first_login"`);
  }
}
