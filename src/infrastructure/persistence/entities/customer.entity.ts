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
@Index(['createdBy', 'email'], { unique: true })
export class CustomerEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  createdBy: string;

  @ManyToOne(() => UserEntity, (u) => u.customers, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'created_by' })
  user: UserEntity;

  @Column({ type: 'varchar', length: 100 })
  firstName: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  middleName: string;

  @Column({ type: 'varchar', length: 100 })
  lastName: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email?: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  phone: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  alternativePhone: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  profilePhotoRef: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  aadhaarCardRef: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  panCardRef: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  location: string;

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
