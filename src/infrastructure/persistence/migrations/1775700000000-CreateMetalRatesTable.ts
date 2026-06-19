import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateMetalRatesTable1775700000000 implements MigrationInterface {
  name = 'CreateMetalRatesTable1775700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "metal_rates" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_by" uuid NOT NULL,
        "metal_type" "e_metal_type_enum" NOT NULL,
        "purity" varchar(10) NOT NULL,
        "rate" numeric(12,2) NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_metal_rates" PRIMARY KEY ("id"),
        CONSTRAINT "FK_metal_rates_created_by" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_metal_rates_created_by_purity_created_at" ON "metal_rates" ("created_by", "purity", "created_at" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_metal_rates_created_by_created_at" ON "metal_rates" ("created_by", "created_at" DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_metal_rates_created_by_created_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_metal_rates_created_by_purity_created_at"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "metal_rates"`);
  }
}
