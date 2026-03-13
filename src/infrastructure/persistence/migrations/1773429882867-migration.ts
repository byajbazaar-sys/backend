import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1773429882867 implements MigrationInterface {
    name = 'Migration1773429882867'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "items" DROP CONSTRAINT "FK_items_created_by"`);
        await queryRunner.query(`ALTER TABLE "loan_items" DROP CONSTRAINT "FK_loan_items_loan"`);
        await queryRunner.query(`ALTER TABLE "loan_items" DROP CONSTRAINT "FK_loan_items_item"`);
        await queryRunner.query(`ALTER TABLE "loan_items" DROP CONSTRAINT "FK_loan_items_created_by"`);
        await queryRunner.query(`ALTER TABLE "dues" DROP CONSTRAINT "FK_dues_loan"`);
        await queryRunner.query(`ALTER TABLE "dues" DROP CONSTRAINT "FK_dues_customer"`);
        await queryRunner.query(`ALTER TABLE "dues" DROP CONSTRAINT "FK_dues_created_by"`);
        await queryRunner.query(`ALTER TABLE "transactions" DROP CONSTRAINT "FK_transactions_loan"`);
        await queryRunner.query(`ALTER TABLE "transactions" DROP CONSTRAINT "FK_transactions_customer"`);
        await queryRunner.query(`ALTER TABLE "transactions" DROP CONSTRAINT "FK_transactions_created_by"`);
        await queryRunner.query(`ALTER TABLE "transactions" DROP CONSTRAINT "FK_transactions_due"`);
        await queryRunner.query(`ALTER TABLE "loans" DROP CONSTRAINT "FK_loans_created_by"`);
        await queryRunner.query(`ALTER TABLE "loans" DROP CONSTRAINT "FK_loans_customer"`);
        await queryRunner.query(`ALTER TABLE "customers" DROP CONSTRAINT "FK_customers_created_by"`);
        await queryRunner.query(`ALTER TABLE "notifications" DROP CONSTRAINT "FK_notifications_created_by"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_dues_loan_due_date"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_dues_created_by_type"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_users_google_id"`);
        await queryRunner.query(`ALTER TYPE "public"."e_transaction_paid_in_enum" RENAME TO "e_transaction_paid_in_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."e_transaction_paid_in_enum" AS ENUM('Cash', 'Bank Transfer', 'UPI', 'Cheque', 'Card')`);
        await queryRunner.query(`ALTER TABLE "transactions" ALTER COLUMN "paid_in" TYPE "public"."e_transaction_paid_in_enum" USING "paid_in"::"text"::"public"."e_transaction_paid_in_enum"`);
        await queryRunner.query(`DROP TYPE "public"."e_transaction_paid_in_enum_old"`);
        await queryRunner.query(`ALTER TABLE "notifications" ALTER COLUMN "created_by" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "password" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "UQ_0bd5012aeb82628e07f6a1be53b" UNIQUE ("google_id")`);
        await queryRunner.query(`ALTER TABLE "seeds" ALTER COLUMN "timestamp" SET DEFAULT now()`);
        await queryRunner.query(`CREATE INDEX "IDX_c22209ebcbf1207a894c6199b1" ON "dues" ("created_by", "type") `);
        await queryRunner.query(`CREATE INDEX "IDX_9ec973f9fd1aa56a04e1be359d" ON "dues" ("loan_id", "due_date") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_723d09181610f1e43fd4cb5380" ON "customers" ("created_by", "email") `);
        await queryRunner.query(`ALTER TABLE "items" ADD CONSTRAINT "FK_25a958155bb9a9d741210749e07" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "loan_items" ADD CONSTRAINT "FK_09ff589d345f87cc5ba5e7a2aee" FOREIGN KEY ("loan_id") REFERENCES "loans"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "loan_items" ADD CONSTRAINT "FK_5fe823fa39d270d04921749931d" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "loan_items" ADD CONSTRAINT "FK_85ed943cc3858c184820540b64e" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "dues" ADD CONSTRAINT "FK_0a4646ce82e0f6688f83de53d09" FOREIGN KEY ("loan_id") REFERENCES "loans"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "dues" ADD CONSTRAINT "FK_09c85afddaa5bb15d0a0c895ff7" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "dues" ADD CONSTRAINT "FK_a7a22fca27f176276c65d41d365" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "transactions" ADD CONSTRAINT "FK_5101fa7a2a4dce364c002f9fad4" FOREIGN KEY ("loan_id") REFERENCES "loans"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "transactions" ADD CONSTRAINT "FK_6f09843c214f21a462b54b11e8d" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "transactions" ADD CONSTRAINT "FK_77e84561125adeccf287547f66e" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "transactions" ADD CONSTRAINT "FK_2b95c8a2aa9f434c9c180248021" FOREIGN KEY ("due_id") REFERENCES "dues"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "loans" ADD CONSTRAINT "FK_c3b93ceba889c7bb9319d0b9e41" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "loans" ADD CONSTRAINT "FK_407d3207500ffa10289f908f0ef" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "customers" ADD CONSTRAINT "FK_8f138f284609b045dc64c91757a" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "notifications" ADD CONSTRAINT "FK_19629e8eb1e6023c4c73e661c82" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "notifications" DROP CONSTRAINT "FK_19629e8eb1e6023c4c73e661c82"`);
        await queryRunner.query(`ALTER TABLE "customers" DROP CONSTRAINT "FK_8f138f284609b045dc64c91757a"`);
        await queryRunner.query(`ALTER TABLE "loans" DROP CONSTRAINT "FK_407d3207500ffa10289f908f0ef"`);
        await queryRunner.query(`ALTER TABLE "loans" DROP CONSTRAINT "FK_c3b93ceba889c7bb9319d0b9e41"`);
        await queryRunner.query(`ALTER TABLE "transactions" DROP CONSTRAINT "FK_2b95c8a2aa9f434c9c180248021"`);
        await queryRunner.query(`ALTER TABLE "transactions" DROP CONSTRAINT "FK_77e84561125adeccf287547f66e"`);
        await queryRunner.query(`ALTER TABLE "transactions" DROP CONSTRAINT "FK_6f09843c214f21a462b54b11e8d"`);
        await queryRunner.query(`ALTER TABLE "transactions" DROP CONSTRAINT "FK_5101fa7a2a4dce364c002f9fad4"`);
        await queryRunner.query(`ALTER TABLE "dues" DROP CONSTRAINT "FK_a7a22fca27f176276c65d41d365"`);
        await queryRunner.query(`ALTER TABLE "dues" DROP CONSTRAINT "FK_09c85afddaa5bb15d0a0c895ff7"`);
        await queryRunner.query(`ALTER TABLE "dues" DROP CONSTRAINT "FK_0a4646ce82e0f6688f83de53d09"`);
        await queryRunner.query(`ALTER TABLE "loan_items" DROP CONSTRAINT "FK_85ed943cc3858c184820540b64e"`);
        await queryRunner.query(`ALTER TABLE "loan_items" DROP CONSTRAINT "FK_5fe823fa39d270d04921749931d"`);
        await queryRunner.query(`ALTER TABLE "loan_items" DROP CONSTRAINT "FK_09ff589d345f87cc5ba5e7a2aee"`);
        await queryRunner.query(`ALTER TABLE "items" DROP CONSTRAINT "FK_25a958155bb9a9d741210749e07"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_723d09181610f1e43fd4cb5380"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_9ec973f9fd1aa56a04e1be359d"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_c22209ebcbf1207a894c6199b1"`);
        await queryRunner.query(`ALTER TABLE "seeds" ALTER COLUMN "timestamp" SET DEFAULT CURRENT_TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "UQ_0bd5012aeb82628e07f6a1be53b"`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "password" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "notifications" ALTER COLUMN "created_by" DROP NOT NULL`);
        await queryRunner.query(`CREATE TYPE "public"."e_transaction_paid_in_enum_old" AS ENUM('Cash', 'UPI', 'BankTransfer', 'Cheque', 'Other')`);
        await queryRunner.query(`ALTER TABLE "transactions" ALTER COLUMN "paid_in" TYPE "public"."e_transaction_paid_in_enum_old" USING "paid_in"::"text"::"public"."e_transaction_paid_in_enum_old"`);
        await queryRunner.query(`DROP TYPE "public"."e_transaction_paid_in_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."e_transaction_paid_in_enum_old" RENAME TO "e_transaction_paid_in_enum"`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_users_google_id" ON "users" ("google_id") WHERE (google_id IS NOT NULL)`);
        await queryRunner.query(`CREATE INDEX "IDX_dues_created_by_type" ON "dues" ("type", "created_by") `);
        await queryRunner.query(`CREATE INDEX "IDX_dues_loan_due_date" ON "dues" ("loan_id", "due_date") `);
        await queryRunner.query(`ALTER TABLE "notifications" ADD CONSTRAINT "FK_notifications_created_by" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "customers" ADD CONSTRAINT "FK_customers_created_by" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "loans" ADD CONSTRAINT "FK_loans_customer" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "loans" ADD CONSTRAINT "FK_loans_created_by" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "transactions" ADD CONSTRAINT "FK_transactions_due" FOREIGN KEY ("due_id") REFERENCES "dues"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "transactions" ADD CONSTRAINT "FK_transactions_created_by" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "transactions" ADD CONSTRAINT "FK_transactions_customer" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "transactions" ADD CONSTRAINT "FK_transactions_loan" FOREIGN KEY ("loan_id") REFERENCES "loans"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "dues" ADD CONSTRAINT "FK_dues_created_by" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "dues" ADD CONSTRAINT "FK_dues_customer" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "dues" ADD CONSTRAINT "FK_dues_loan" FOREIGN KEY ("loan_id") REFERENCES "loans"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "loan_items" ADD CONSTRAINT "FK_loan_items_created_by" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "loan_items" ADD CONSTRAINT "FK_loan_items_item" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "loan_items" ADD CONSTRAINT "FK_loan_items_loan" FOREIGN KEY ("loan_id") REFERENCES "loans"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "items" ADD CONSTRAINT "FK_items_created_by" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

}
