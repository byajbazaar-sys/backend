/**
 * The fields `PATCH /users/:id` may change, picked from the request body by name.
 *
 * Never spread the request body into the user record: the production Lambda's validation pipe does not strip unknown
 * properties, and the user record also holds login and security state (googleId, resetPasswordToken, password,
 * isEmailVerified, isPhoneVerified, userType …). A field missing from these lists is simply not updatable here.
 */

/** The shop's business details: editable by the owner and by members with `settings` edit. */
export const SHOP_PROFILE_FIELDS = [
  'businessName',
  'address',
  'gstin',
  'pan',
  'state',
  'stateCode',
  'proprietorName',
  'alternatePhoneNumber',
  'bankName',
  'bankBranch',
  'bankAccountNumber',
  'bankIfsc',
  'showBankDetailsOnBill',
  'tryOnBackgroundColor',
] as const;

/**
 * The person behind the account. In an owner's main shop the shop *is* the owner's own account, so a member saving the
 * shop settings form must not rename the owner (these are ignored for members, not rejected, so that form still saves).
 * The phone number is only compared here — changing it needs SMS verification (UsersService.update).
 */
export const PERSONAL_PROFILE_FIELDS = ['firstName', 'lastName', 'phoneNumber'] as const;

/** Platform admins only. */
export const ADMIN_ONLY_FIELDS = ['userType'] as const;

export function pickUserUpdate(
  body: object | null | undefined,
  who: { isAdmin: boolean; isAccountOwner: boolean },
): Record<string, unknown> {
  const source = (body ?? {}) as Record<string, unknown>;
  const allowed: readonly string[] = [
    ...SHOP_PROFILE_FIELDS,
    ...(who.isAccountOwner || who.isAdmin ? PERSONAL_PROFILE_FIELDS : []),
    ...(who.isAdmin ? ADMIN_ONLY_FIELDS : []),
  ];
  const out: Record<string, unknown> = {};
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(source, key) && source[key] !== undefined) out[key] = source[key];
  }
  return out;
}
