import { IPageable, Paged } from "@shared-libs";
import { Expose } from "class-transformer";
import { Loan } from "./loan";

export class LoanExtended extends Paged<Loan> implements IPageable<Loan> {
    @Expose()
    public totalAmountRemaining: number;

    @Expose()
    public totalAmountPaid: number;

    @Expose()
    public totalInterestPaid: number;

    @Expose()
    public totalInterestRemaining: number;
}