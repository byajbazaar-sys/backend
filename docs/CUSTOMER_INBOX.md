# Customer inbox (WhatsApp + Instagram automatic replies)

Customers who message a business on WhatsApp or Instagram get an automatic answer from the shop's own facts. Anything
the assistant cannot answer with certainty is handed to the business owner, who is alerted and replies from the inbox
(web `/inbox`, mobile More → Customer Inbox).

## Flow

1. **Webhook in.** WhatsApp: `whatsapp-webhook.service.ts` → `InboxService.receive`. Instagram:
   `POST /webhooks/instagram` (signature checked) → `MarketingInstagramMessagingService.handleWebhook` →
   `MARKETING_INBOX` port → `InboxService.receive`. Messages are stored once per Meta message ID.
2. **Dispatch.** When the conversation is in `auto` and the channel is switched on, the webhook Lambda invokes the
   `inboxWorker` Lambda asynchronously (`INBOX_WORKER_LAMBDA_NAME`, default `<api function>-inboxWorker`;
   `INBOX_INLINE=1` runs it inline, e.g. locally). The webhook is acknowledged at once.
3. **Answer.** `InboxService.answer` claims the message, skips it if a newer customer message exists, gathers facts
   (`InboxKnowledgeService`: shop profile + timings + FAQs, today's rates, catalogue search, and on WhatsApp the
   customer's own loans / dues / orders matched by mobile number) and asks Workers AI (`InboxBotService`,
   Gemma 4 26B, then Llama 3.3 70B; override with `INBOX_TEXT_MODEL`).
4. **Hand-over** happens when the model hands over, errors, answers unreadably, quotes an amount that is not in the
   facts, the customer sent a photo / voice note, or more than 8 automatic replies went out in an hour. The customer
   gets the hand-over message (owner's text, or an automatic one in Gujarati / Hindi / Hinglish / English), the
   conversation becomes `needs_reply`, and the owner is alerted.
5. **Alerts.** Always: live WebSocket `inboxUpdated` (web nav badge + pop-up, open screens update). As the owner
   chose in settings: email (link to `/inbox?c=<id>`) and Expo push to their phones (`push_devices`).
6. **Owner reply** (`POST /inbox/conversations/:id/messages`) puts the conversation in `owner`: the assistant stays
   quiet there until the owner hands it back, or 24 h after the owner's last reply.

## Meta setup

**WhatsApp:** nothing new. It uses the existing WhatsApp Cloud API connection and webhook. Replies more than 24 h after
the customer's last message are refused by Meta (free-form messages need the customer-service window).

**Instagram** (Facebook Login for Business, login configuration `MARKETING_INSTAGRAM_CONFIG_ID`):

1. Add the permissions `instagram_manage_messages`, `pages_manage_metadata` and `pages_show_list` to the login
   configuration (alongside the existing `instagram_basic` / publishing ones). Businesses must **reconnect Instagram**
   in Marketing once afterwards.
2. App Review: request advanced access for `instagram_manage_messages` and `pages_manage_metadata`. Until then only
   people with a role on the Meta app can use it. Also request the **Human Agent** feature. It lets owner replies go
   out up to 7 days after the customer's message (`HUMAN_AGENT` tag). Bot replies only go out within 24 h.
3. Webhooks → Instagram: subscribe the `messages` field (callback `…/api/v1/webhooks/instagram`, verify token
   `MARKETING_INSTAGRAM_WEBHOOK_VERIFY_TOKEN`).
4. The Instagram account must be linked to a Facebook Page. When the owner switches Instagram replies on, the backend
   finds that Page (`/me/accounts`, `/me/assigned_pages`), stores its token encrypted, and subscribes it to message
   webhooks (`/{page}/subscribed_apps`). The settings screen shows what is missing when this fails.

## Mobile push (Expo)

- `expo-notifications` is a native module, so a **new native build** is needed (EAS). Pushes do not work in Expo Go
  on Android.
- **Android** needs Firebase. Create a Firebase Android app for the package, put `google-services.json` in the
  mobile project root (or point `GOOGLE_SERVICES_JSON` at it, e.g. an EAS file secret), and upload the FCM V1
  service-account key with `eas credentials` (Android → Google Service Account → FCM V1). Never commit the
  service-account key.
- **iOS:** EAS sets up the APNs key on the next `eas build` if asked.
- Optional backend env: `EXPO_ACCESS_TOKEN`, used only if "enhanced push security" is turned on in Expo.
- The app registers the phone after login (`POST /notifications/push-devices`) and removes it on logout. A tapped
  alert opens the conversation. Android alerts use the `inbox` channel.

## Data

Main database (migration `1794900000000-CreateCustomerInbox`): `inbox_settings`, `inbox_conversations`,
`inbox_messages`, `push_devices`. Marketing database (migration `1700000000017-AddInstagramMessaging`): the Page
ID and its encrypted token on `marketing_instagram_connections`.
