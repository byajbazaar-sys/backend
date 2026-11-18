/** One-time code email for verifying an email address (sign-up and Account → Verify email). */
export const EMAIL_VERIFICATION_TEMPLATE = `
<mjml>
  <mj-head>
    <mj-title>Your {{appName}} verification code</mj-title>
    <mj-preview>{{code}} is your {{appName}} verification code. It expires in {{expiresMinutes}} minutes.</mj-preview>
    <mj-attributes>
      <mj-all font-family="Helvetica, Arial, sans-serif" />
      <mj-text color="#333333" font-size="16px" line-height="24px" />
    </mj-attributes>
  </mj-head>
  <mj-body background-color="#f5f5f5" width="600px">
    <mj-section background-color="#0f172a" padding="20px 24px">
      <mj-column>
        <mj-text font-size="20px" font-weight="bold" color="#ffad33" align="center" padding="0">
          {{appName}}
        </mj-text>
      </mj-column>
    </mj-section>
    <mj-section background-color="#ffffff" padding="36px 24px">
      <mj-column>
        <mj-text font-size="22px" font-weight="bold" color="#111827" align="center" padding-bottom="12px">
          Verify your email
        </mj-text>
        <mj-text padding-bottom="8px">Hi {{userName}},</mj-text>
        <mj-text padding-bottom="20px">
          Enter this code in {{appName}} to verify your email address:
        </mj-text>
        <mj-text align="center" font-size="34px" font-weight="bold" letter-spacing="10px" color="#111827"
          padding="18px 0" container-background-color="#fff7ea" css-class="otp-code">
          {{code}}
        </mj-text>
        <mj-text padding-top="20px" font-size="14px" color="#6b7280">
          The code expires in {{expiresMinutes}} minutes and can be used once. Never share it with anyone —
          {{appName}} will never ask you for it.
        </mj-text>
        <mj-text padding-top="12px" font-size="14px" color="#6b7280">
          If you didn't try to sign up or verify your email, you can safely ignore this message.
        </mj-text>
      </mj-column>
    </mj-section>
    <mj-section padding="24px">
      <mj-column>
        <mj-text font-size="12px" color="#9ca3af" align="center">
          &copy; {{year}} {{appName}}. All rights reserved.
        </mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>
`.trim();
