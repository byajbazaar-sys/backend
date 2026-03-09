import { IPageable, Paged } from "@shared-libs";
import { Expose, Type } from "class-transformer";
import { Loan } from "./loan";

export class LoanExtended extends Paged<Loan> implements IPageable<Loan> {
    @Expose()
    @Type(() => Number)
    public totalAmountRemaining: number;

    @Expose()
    @Type(() => Number)
    public totalAmountPaid: number;

    @Expose()
    @Type(() => Number)
    public totalInterestPaid: number;

    @Expose()
    @Type(() => Number)
    public totalInterestRemaining: number;
}