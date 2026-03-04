export const EMAIL_VERIFICATION_TEMPLATE = `
<mjml>
  <mj-head>
    <mj-title>Verify Your Email</mj-title>
    <mj-preview>Please verify your email address to complete your registration</mj-preview>
    <mj-attributes>
      <mj-all font-family="Helvetica, Arial, sans-serif" />
      <mj-text color="#333333" font-size="16px" line-height="24px" />
      <mj-button background-color="#2563eb" color="#ffffff" font-size="16px" />
    </mj-attributes>
  </mj-head>
  <mj-body background-color="#f5f5f5" width="600px">
    <mj-section background-color="#ffffff" padding="40px 24px">
      <mj-column>
        <mj-text font-size="24px" font-weight="bold" color="#111827" align="center" padding-bottom="16px">
          Verify Your Email
        </mj-text>
        <mj-text padding-bottom="24px">
          Hi {{userName}},
        </mj-text>
        <mj-text padding-bottom="24px">
          Thanks for signing up! Please verify your email address by clicking the button below.
        </mj-text>
        <mj-button href="{{verificationUrl}}" padding="24px 0" border-radius="8px">
          Verify Email Address
        </mj-button>
        <mj-text padding-top="32px" font-size="14px" color="#6b7280">
          This link will expire in 24 hours. If you didn't create an account, you can safely ignore this email.
        </mj-text>
        <mj-text padding-top="16px" font-size="14px" color="#6b7280">
          If the button doesn't work, copy and paste this link into your browser:
        </mj-text>
        <mj-text font-size="12px" color="#2563eb" padding-top="8px" padding-bottom="0">
          {{verificationUrl}}
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
