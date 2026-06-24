import 'dotenv/config';
import twilio from 'twilio';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_PHONE_NUMBER;
const toNumber = process.env.TWILIO_TEST_TO_NUMBER;

if (!accountSid || !authToken || !fromNumber || !toNumber) {
  throw new Error(
    'Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER, and TWILIO_TEST_TO_NUMBER in .env',
  );
}

const client = twilio(accountSid, authToken);

async function sendSMS() {
  const message = await client.messages.create({
    body: 'Hello from Twilio!',
    from: fromNumber,
    to: toNumber,
  });
  console.log('Sent:', message.sid);
}

sendSMS().catch((err) => {
  console.error(err);
  process.exit(1);
});
