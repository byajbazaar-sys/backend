/**
 * ByajBazaar AI — customers, loans, payments, dues, deposits and reports: previews bound to their payload, the
 * duplicate-payment checks (warning at preview, refusal at confirm), loan-version binding, permissions, preferences
 * and live progress.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { assistant, callTool, lastToolResults, OTHER_SHOP, owner, say, SHOP, staff, viewer } from './fakes';

const statusOf = (err: unknown): number => (err as { getStatus?: () => number }).getStatus?.() ?? 0;

function withCustomerAndLoan(a: ReturnType<typeof assistant>) {
  const customer = a.customers.add(SHOP, { firstName: 'Ramesh', lastName: 'Kumar', phone: '9876543210' });
  const loan = a.loans.add(SHOP, { customerId: customer.id, customerName: 'Ramesh Kumar' });
  return { customer, loan };
}

describe('ByajBazaar AI — loans', () => {
  it('"Ramesh ki payal 20 gram girvi 15000, 2 rupaye saikda, 12 mahine" → a loan preview, saved only on Confirm', async () => {
    const a = assistant();
    const customer = a.customers.add(SHOP, { firstName: 'Ramesh', lastName: 'Kumar' });
    a.model.script(
      callTool('loans_create', {
        customer: 'Ramesh',
        items: [{ name: 'payal', netWeight: 20 }],
        amount: 15000,
        interestRate: 2,
        tenure: 12,
        tenureUnit: 'MONTHS',
      }),
      say('Loan preview ready.'),
    );
    const res = await a.orchestrator.chat(owner(), {
      message: 'Ramesh ki payal 20 gram girvi 15000 2 rupaye saikda 12 mahine',
    });
    const [action] = res.actions;
    assert.equal(action.action, 'loans.create');
    assert.equal(action.preview.entity, 'loan');
    assert.match(action.preview.summary, /₹15,000 loan for Ramesh Kumar at 2% a month/);
    assert.ok(action.preview.warnings?.some((w) => w.includes('only one weight')));
    assert.equal(a.loans.created.length, 0);

    await a.actionsService.confirm(owner(), action.id, action.payloadHash);
    assert.deepEqual(a.loans.created[0], {
      customerId: customer.id,
      tenureType: 'Months',
      tenureValue: 12,
      interestPercentage: 2,
      interestType: 'Monthly',
      interestCalculationMethod: 'Simple',
      loanItems: [
        {
          itemId: a.loans.itemTypes[0].id,
          itemName: 'Payal',
          amount: 15000,
          netWeightInGrams: 20,
          grossWeightInGrams: 20,
        },
      ],
    });
  });

  it('asks for what is missing, and an item not in the shop item list is a question, not a guess', async () => {
    const a = assistant();
    a.customers.add(SHOP, { firstName: 'Ramesh', lastName: 'Kumar' });
    a.model.script(
      callTool('loans_create', { customer: 'Ramesh', items: [{ name: 'Payal', netWeight: 20 }] }),
      say('?'),
    );
    await a.orchestrator.chat(owner(), { message: 'Ramesh ki payal girvi' });
    const missing = (lastToolResults(a.model)[0] as { missing: { field: string }[] }).missing.map((m) => m.field);
    assert.deepEqual(missing, ['amount', 'interestRate', 'tenure']);

    a.model.script(
      callTool('loans_create', {
        customer: 'Ramesh',
        items: [{ name: 'Kamarbandh', netWeight: 40, amount: 30000 }],
        interestRate: 2,
        tenure: 6,
        tenureUnit: 'MONTHS',
      }),
      say('Which item?'),
    );
    const res = await a.orchestrator.chat(owner(), { message: 'kamarbandh 40 gram 30000' });
    assert.equal(lastToolResults(a.model)[0].status, 'ambiguous');
    assert.equal(res.actions.length, 0);
  });

  it('a second identical loan saved after the preview is refused at Confirm (no duplicate loan)', async () => {
    const a = assistant();
    const customer = a.customers.add(SHOP, { firstName: 'Ramesh', lastName: 'Kumar' });
    a.model.script(
      callTool('loans_create', {
        customerId: customer.id,
        items: [{ name: 'Payal', netWeight: 20, grossWeight: 21 }],
        amount: 15000,
        interestRate: 2,
        tenure: 12,
        tenureUnit: 'MONTHS',
      }),
      say('Preview.'),
    );
    const [action] = (await a.orchestrator.chat(owner(), { message: 'loan' })).actions;
    // Meanwhile someone made the same loan on the Loans screen.
    a.loans.add(SHOP, {
      customerId: customer.id,
      amountRemaining: 15000,
      createdAt: new Date(Date.now() + 1000).toISOString(),
    });
    await assert.rejects(a.actionsService.confirm(owner(), action.id, action.payloadHash), (e) => statusOf(e) === 422);
    assert.equal(a.loans.created.length, 0);
  });

  it('several customers with the name → asks which one, with a card to tap', async () => {
    const a = assistant();
    a.customers.add(SHOP, { firstName: 'Ramesh', lastName: 'Kumar', phone: '9876543210' });
    a.customers.add(SHOP, { firstName: 'Ramesh', lastName: 'Verma', phone: '9123456780' });
    a.model.script(callTool('loans_search', { customer: 'Ramesh' }), say('Which Ramesh?'));
    const res = await a.orchestrator.chat(owner(), { message: 'Ramesh ka loan' });
    const result = lastToolResults(a.model)[0] as { status: string; candidates: { phoneEnding: string }[] };
    assert.equal(result.status, 'ambiguous');
    assert.deepEqual(result.candidates.map((c) => c.phoneEnding).sort(), ['••••3210', '••••6780']);
    assert.ok(!JSON.stringify(result).includes('9876543210'), 'the model never sees full phone numbers');
    assert.equal((res.cards[0] as { type: string }).type, 'records');
  });

  it('only finds customers of this shop', async () => {
    const a = assistant();
    a.customers.add(OTHER_SHOP, { firstName: 'Ramesh', lastName: 'Kumar' });
    a.model.script(callTool('loans_search', { customer: 'Ramesh' }), say('No such customer.'));
    await a.orchestrator.chat(owner(), { message: 'Ramesh ka loan' });
    assert.equal(lastToolResults(a.model)[0].status, 'rejected');
  });
});

describe('ByajBazaar AI — payments (duplicate-payment protection)', () => {
  const pay = { customer: 'Ramesh Kumar', amount: 400, paymentType: 'INTEREST', paidIn: 'CASH' };

  it('"Ramesh ne 400 byaj diya cash" → preview bound to the loan version; Confirm records it once', async () => {
    const a = assistant();
    const { loan } = withCustomerAndLoan(a);
    a.model.script(callTool('payments_record', pay), say('Preview ready.'));
    const [action] = (await a.orchestrator.chat(owner(), { message: 'Ramesh ne 400 byaj diya cash' })).actions;
    assert.equal(action.preview.entity, 'payment');
    assert.equal(action.preview.warnings?.length, 0);

    await a.actionsService.confirm(owner(), action.id, action.payloadHash);
    const again = await a.actionsService.confirm(owner(), action.id, action.payloadHash);
    assert.equal(again.status, 'COMPLETED', 'a second tap shows the saved result');
    assert.equal(a.loans.recorded.length, 1, 'a second confirm never records a second payment');
    assert.deepEqual(a.loans.recorded[0], {
      input: { loanId: loan.id, amount: 400, transactionType: 'Interest', paidIn: 'Cash', paidAt: undefined },
      expectedLoanVersion: 1,
    });
  });

  it('never guesses how it was paid or what it was for', async () => {
    const a = assistant();
    withCustomerAndLoan(a);
    a.model.script(callTool('payments_record', { customer: 'Ramesh Kumar', amount: 400 }), say('Cash ya UPI?'));
    await a.orchestrator.chat(owner(), { message: 'Ramesh ne 400 diye' });
    const missing = (lastToolResults(a.model)[0] as { missing: { field: string }[] }).missing.map((m) => m.field);
    assert.deepEqual(missing, ['paymentType', 'paidIn']);
  });

  it('warns when the same payment was already recorded today', async () => {
    const a = assistant();
    const { loan } = withCustomerAndLoan(a);
    a.loans.recordElsewhere(SHOP, {
      loanId: loan.id,
      amount: 400,
      transactionType: 'Interest',
      paidIn: 'Cash',
      createdAt: new Date(Date.now() - 3600_000).toISOString(),
    });
    a.model.script(callTool('payments_record', pay), say('Already recorded today — check.'));
    const [action] = (await a.orchestrator.chat(owner(), { message: 'Ramesh ne 400 byaj diya' })).actions;
    assert.ok(action.preview.warnings?.some((w) => w.includes('already recorded')));
  });

  it('a payment recorded elsewhere after the preview makes Confirm fail — nothing is saved twice', async () => {
    const a = assistant();
    const { loan } = withCustomerAndLoan(a);
    a.model.script(callTool('payments_record', pay), say('Preview.'));
    const [action] = (await a.orchestrator.chat(owner(), { message: 'Ramesh ne 400 byaj diya' })).actions;
    a.loans.recordElsewhere(SHOP, {
      loanId: loan.id,
      amount: 400,
      transactionType: 'Interest',
      paidIn: 'Cash',
      createdAt: new Date(Date.now() + 1000).toISOString(),
    });
    await assert.rejects(a.actionsService.confirm(owner(), action.id, action.payloadHash), (e) => statusOf(e) === 422);
    assert.equal(a.loans.recorded.length, 0);
    assert.equal((await a.actionsService.get(owner(), action.id)).status, 'FAILED');
  });

  it('any other change to the loan after the preview also stops the payment (loan version)', async () => {
    const a = assistant();
    const { loan } = withCustomerAndLoan(a);
    a.model.script(callTool('payments_record', { ...pay, amount: 250 }), say('Preview.'));
    const [action] = (await a.orchestrator.chat(owner(), { message: 'Ramesh ne 250 byaj diya' })).actions;
    loan.version = 7;
    await assert.rejects(a.actionsService.confirm(owner(), action.id, action.payloadHash), (e) => statusOf(e) === 422);
    assert.equal(a.loans.recorded.length, 0);
  });

  it('refuses more principal than is due, and asks which loan when there are several', async () => {
    const a = assistant();
    const { customer } = withCustomerAndLoan(a);
    a.model.script(callTool('payments_record', { ...pay, amount: 20000, paymentType: 'PRINCIPAL' }), say('Too much.'));
    await a.orchestrator.chat(owner(), { message: 'Ramesh ne 20000 mool diya' });
    assert.equal(lastToolResults(a.model)[0].status, 'rejected');

    a.loans.add(SHOP, { customerId: customer.id, customerName: 'Ramesh Kumar', amountRemaining: 5000 });
    a.model.script(callTool('payments_record', pay), say('Which loan?'));
    const res = await a.orchestrator.chat(owner(), { message: 'Ramesh ne 400 byaj diya' });
    assert.equal(lastToolResults(a.model)[0].status, 'ambiguous');
    assert.equal(res.actions.length, 0);
  });

  it('staff with view-only loans access are not offered payments, and a forced call is denied', async () => {
    const a = assistant();
    withCustomerAndLoan(a);
    a.model.script(callTool('payments_record', pay), say('Ask the owner.'));
    await a.orchestrator.chat(staff(), { message: 'Ramesh ne 400 byaj diya' });
    assert.ok(!a.model.requests[0].tools.some((t) => t.name === 'payments_record'));
    assert.ok(a.model.requests[0].tools.some((t) => t.name === 'loans_search'));
    assert.equal(lastToolResults(a.model)[0].error, 'permission_denied');
  });
});

describe('ByajBazaar AI — deposits and reports', () => {
  it('"Sunita ke deposit me 5000 UPI jama" → opens an account when there is none, on Confirm only', async () => {
    const a = assistant();
    const sunita = a.customers.add(SHOP, { firstName: 'Sunita', lastName: 'Devi' });
    a.model.script(callTool('deposits_add', { customer: 'Sunita', amount: 5000, paymentMode: 'UPI' }), say('Preview.'));
    const [action] = (await a.orchestrator.chat(owner(), { message: 'Sunita ke deposit me 5000 UPI jama' })).actions;
    assert.ok(action.preview.warnings?.some((w) => w.includes('new one will be opened')));
    assert.equal(a.deposits.accounts.length, 0);
    await a.actionsService.confirm(owner(), action.id, action.payloadHash);
    assert.equal(a.deposits.accounts[0].customerId, sunita.id);
    assert.equal(a.deposits.accounts[0].currentBalance, 5000);
  });

  it('a same deposit made after the preview is refused at Confirm', async () => {
    const a = assistant();
    const sunita = a.customers.add(SHOP, { firstName: 'Sunita', lastName: 'Devi' });
    const account = a.deposits.open(SHOP, { customerId: sunita.id, customerName: 'Sunita Devi' });
    a.model.script(
      callTool('deposits_add', { customerId: sunita.id, amount: 5000, paymentMode: 'CASH' }),
      say('Preview.'),
    );
    const [action] = (await a.orchestrator.chat(owner(), { message: 'jama' })).actions;
    a.deposits.depositElsewhere(account.id, 5000, 'Cash');
    await assert.rejects(a.actionsService.confirm(owner(), action.id, action.payloadHash), (e) => statusOf(e) === 422);
    assert.equal(a.deposits.added.length, 0);
  });

  it('"total kitna paisa bahar hai" → business overview card (reports access needed)', async () => {
    const a = assistant();
    withCustomerAndLoan(a);
    a.model.script(callTool('reports_overview', {}), say('₹10,000 principal and ₹400 interest due.'));
    const res = await a.orchestrator.chat(owner(), { message: 'total kitna paisa bahar hai' });
    const card = res.cards[0] as { type: string; metrics: { key: string; value: number }[] };
    assert.equal(card.type, 'report');
    assert.equal(card.metrics.find((m) => m.key === 'principalDue')?.value, 10000);
    assert.equal(res.intent, 'REPORT');

    const noReports = { ...viewer(), permissions: { ...viewer().permissions, reports: 'none' } };
    a.model.script(say('No access.'));
    await a.orchestrator.chat(noReports, { message: 'overview' });
    assert.ok(!a.model.requests[a.model.requests.length - 1].tools.some((t) => t.name === 'reports_overview'));
  });
});

describe('ByajBazaar AI — preferences and live progress', () => {
  it('a saved language preference reaches the model with every message', async () => {
    const a = assistant();
    await a.preferences.save(SHOP, { language: 'hi', replyStyle: 'short' });
    a.model.script(say('नमस्ते'));
    await a.orchestrator.chat(owner(), { message: 'hello' });
    assert.match(JSON.stringify(a.model.requests[0].messages), /Reply in Hindi \(Devanagari script\)/);
  });

  it('reports progress (reading, tool, writing) to the person only, tagged with their message id', async () => {
    const a = assistant();
    withCustomerAndLoan(a);
    a.model.script(callTool('loans_search', { customer: 'Ramesh Kumar' }), say('One open loan.'));
    await a.orchestrator.chat(owner(), { message: 'Ramesh ka loan', clientMessageId: 'msg-1' });
    assert.deepEqual(
      a.progress.events.map((e) => [e.step, e.label, e.clientMessageId, e.actorUserId]),
      [
        ['thinking', 'Reading your message…', 'msg-1', SHOP],
        ['tool', 'Checking loans…', 'msg-1', SHOP],
        ['writing', 'Writing the answer…', 'msg-1', SHOP],
      ],
    );
  });
});
