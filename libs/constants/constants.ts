export const NAME_MIN_LENGTH = 2;
export const NAME_MAX_LENGTH = 50;

// Validation regex patterns
export const NAME_REGEX = /^[a-zA-Z\s'-]+$/;
export const PHONE_E164_REGEX = /^\+?[1-9]\d{1,14}$/;
export const PASSWORD_COMPLEXITY_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/;
export const EMAIL_REGEX = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
export const JWT_EXPIRES_IN = '7d';


// Auth
export const USER_STRATEGY = 'users-strategy';
export const AUDIENCE = 'usersAudience';
export const ISSUER = 'UsersIssuer';
export const ALG = 'HS256';
export const HEADER = 'Authorization';
export const DEFAULT_THROTTLE_TTL = 60000;
export const DEFAULT_THROTTLE_REQ_LIMIT = 100;
export const DEFAULT_PAGE_NUMBER = 1;
export const DEFAULT_PAGE_SIZE = 10;
export const BCRYPT_SALT_ROUNDS = 10;

export const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';

/** Numeric column limits (match DB schema) */
export const AMOUNT_MAX = 9999999999.99;       // NUMERIC(12,2)
export const WEIGHT_MAX = 9999999.999;         // NUMERIC(10,3)
export const RATE_MAX = 99999999.99;           // NUMERIC(10,2)
export const INTEREST_PERCENTAGE_MAX = 999.99; // NUMERIC(5,2)
export const TENURE_MAX = 2147483647;          // INTEGER

