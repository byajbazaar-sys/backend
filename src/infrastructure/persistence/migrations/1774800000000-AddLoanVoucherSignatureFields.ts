import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLoanVoucherSignatureFields1774800000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "loans" ADD "signer_name" character varying`);
    await queryRunner.query(`ALTER TABLE "loans" ADD "signature_ref" character varying`);
    await queryRunner.query(`ALTER TABLE "loans" ADD "fingerprint_ref" character varying`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "loans" DROP COLUMN "fingerprint_ref"`);
    await queryRunner.query(`ALTER TABLE "loans" DROP COLUMN "signature_ref"`);
    await queryRunner.query(`ALTER TABLE "loans" DROP COLUMN "signer_name"`);
  }
}
