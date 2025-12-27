import * as jwt from 'jsonwebtoken';
import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../.env') });
// Ensure environment variables exist
if (!process.env.TOKEN_SECRET) {
  throw new Error('TOKEN_SECRET is not defined in environment variables');
}
if (!process.env.TOKEN_AUDIENCE) {
  throw new Error('TOKEN_AUDIENCE is not defined in environment variables');
}
if (!process.env.TOKEN_ISSUER) {
  throw new Error('TOKEN_ISSUER is not defined in environment variables');
}
if (!process.env.TOKEN_ALG) {
  throw new Error('TOKEN_ALG is not defined in environment variables');
}
const token = jwt.sign({ userId: '123' }, process.env.TOKEN_SECRET, {
  audience: process.env.TOKEN_AUDIENCE,
  issuer: process.env.TOKEN_ISSUER,
  expiresIn: '7d',
  algorithm: process.env.TOKEN_ALG as jwt.Algorithm,
});