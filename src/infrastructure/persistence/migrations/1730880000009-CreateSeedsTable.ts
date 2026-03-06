import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSeedsTable1730880000009 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "seeds" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" "e_seed_type_enum" NOT NULL,
        "version" integer NOT NULL DEFAULT 0,
        "timestamp" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "description" varchar(500),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_seeds_name" UNIQUE ("name"),
        CONSTRAINT "PK_seeds" PRIMARY KEY ("id")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "seeds"`);
  }
}
