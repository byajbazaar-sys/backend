import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1774378226856 implements MigrationInterface {
    name = 'Migration1774378226856'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_support_requests_created_at"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_support_requests_email"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_723d09181610f1e43fd4cb5380"`);
        await queryRunner.query(`ALTER TABLE "customers" ALTER COLUMN "email" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "support_requests" DROP COLUMN "created_at"`);
        await queryRunner.query(`ALTER TABLE "support_requests" ADD "created_at" TIMESTAMP NOT NULL DEFAULT now()`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_723d09181610f1e43fd4cb5380" ON "customers" ("created_by", "email") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_723d09181610f1e43fd4cb5380"`);
        await queryRunner.query(`ALTER TABLE "support_requests" DROP COLUMN "created_at"`);
        await queryRunner.query(`ALTER TABLE "support_requests" ADD "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()`);
        await queryRunner.query(`ALTER TABLE "customers" ALTER COLUMN "email" SET NOT NULL`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_723d09181610f1e43fd4cb5380" ON "customers" ("created_by", "email") `);
        await queryRunner.query(`CREATE INDEX "IDX_support_requests_email" ON "support_requests" ("email") `);
        await queryRunner.query(`CREATE INDEX "IDX_support_requests_created_at" ON "support_requests" ("created_at") `);
    }

}
