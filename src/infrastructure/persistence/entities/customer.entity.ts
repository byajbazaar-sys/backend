import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { UserEntity } from './user.entity';
import { LoanEntity } from './loan.entity';
import { TransactionEntity } from './transaction.entity';
import { DueEntity } from './due.entity';

@Entity('customers')
@Index(['createdById', 'email'], { unique: true })
export class CustomerEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  createdById: string;

  @ManyToOne(() => UserEntity, (u) => u.customers, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'created_by_id' })
  createdByUser: UserEntity;

  @Column({ type: 'varchar', length: 100 })
  firstName: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  middleName: string | null;

  @Column({ type: 'varchar', length: 100 })
  lastName: string;

  @Column({ type: 'varchar', length: 255 })
  email: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  alternativePhone: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  profilePhotoRef: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  aadhaarCardRef: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  panCardRef: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  location: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => LoanEntity, (l) => l.customer)
  loans: LoanEntity[];

  @OneToMany(() => TransactionEntity, (t) => t.customer)
  transactions: TransactionEntity[];

  @OneToMany(() => DueEntity, (d) => d.customer)
  dues: DueEntity[];
}
