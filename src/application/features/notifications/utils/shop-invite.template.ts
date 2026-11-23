export const SHOP_INVITE_TEMPLATE = `
<mjml>
  <mj-head>
    <mj-title>Join {{shopName}} on {{appName}}</mj-title>
    <mj-preview>{{inviterName}} invited you to {{shopName}} as {{roleLabel}}</mj-preview>
    <mj-attributes>
      <mj-all font-family="Helvetica, Arial, sans-serif" />
      <mj-text color="#333333" font-size="16px" line-height="24px" />
      <mj-button background-color="#f59e0b" color="#111827" font-size="16px" font-weight="bold" />
    </mj-attributes>
  </mj-head>
  <mj-body background-color="#f5f5f5" width="600px">
    <mj-section background-color="#ffffff" padding="40px 24px">
      <mj-column>
        <mj-text font-size="24px" font-weight="bold" color="#111827" align="center" padding-bottom="16px">
          You're invited to {{shopName}}
        </mj-text>
        <mj-text padding-bottom="16px">
          {{inviterName}} added you to <b>{{shopName}}</b> on {{appName}} as <b>{{roleLabel}}</b>.
        </mj-text>
        <mj-text padding-bottom="8px">
          Open the invite and sign in (or create your account) with this email address — {{email}}.
        </mj-text>
        <mj-button href="{{inviteUrl}}" padding="24px 0" border-radius="8px">
          Accept invite
        </mj-button>
        <mj-text padding-top="24px" font-size="14px" color="#6b7280">
          This invite expires in {{expiresDays}} days. If you weren't expecting it, you can ignore this email.
        </mj-text>
        <mj-text padding-top="16px" font-size="14px" color="#6b7280">
          If the button doesn't work, copy and paste this link into your browser:
        </mj-text>
        <mj-text font-size="12px" color="#2563eb" padding-top="8px" padding-bottom="0">
          {{inviteUrl}}
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
