import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePlansTable1777000000000 implements MigrationInterface {
  name = 'CreatePlansTable1777000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS plans (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name varchar(128) NOT NULL,
        price numeric(12, 2) NOT NULL,
        currency varchar(8) NOT NULL DEFAULT 'INR',
        interval varchar(32) NOT NULL DEFAULT 'monthly',
        interval_count int NOT NULL DEFAULT 1,
        provider_plan_id varchar(128) NOT NULL,
        active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS UQ_plans_provider_plan_id ON plans (provider_plan_id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS IDX_plans_active ON plans (active)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS plans`);
  }
}
