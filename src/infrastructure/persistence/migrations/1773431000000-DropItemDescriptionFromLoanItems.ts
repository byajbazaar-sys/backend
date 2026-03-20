import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropItemDescriptionFromLoanItems1773431000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "loan_items" DROP COLUMN "item_description"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "loan_items" ADD COLUMN "item_description" varchar(500) NULL`,
    );
  }
}
