# Eustace ChatGPT MCP integration

## Status

Source implementation is on `feat/eustace-chatgpt-mcp`. It has **not** been deployed to Supabase or merged into `main`.

No production database changes, migrations, SQL writes, OAuth setting changes, or Edge Function deployments were performed.

## What it adds

A remote, OAuth-protected MCP endpoint:

`https://ghlsmrkjmqerexqclago.supabase.co/functions/v1/eustace-mcp`

It exposes five tools for one allowlisted Eustace account:

| Tool | Behavior |
| --- | --- |
| `create_task` | Creates a task for a date, with title, category, duration, notes, optional start time, and supported recurrence |
| `list_tasks` | Lists task occurrences and completion state for a date |
| `update_task` | Updates a task definition; recurring-task edits affect the definition, not one isolated occurrence |
| `complete_task` | Completes a task for the owner's current local day only |
| `delete_task` | Permanently deletes the task; existing completion history is removed by the database's ON DELETE CASCADE |

The endpoint authenticates users with Supabase OAuth 2.1 middleware and uses the authenticated user's RLS-scoped Supabase client for every database operation. It does not use a service-role client. A server-side `EUSTACE_OWNER_USER_ID` allowlist rejects every Eustace account other than the configured owner.

## Compatibility decisions from the live schema inspection

The inspected production schema currently accepts only `none`, `daily`, `weekdays`, and `weekly` in `tasks.recurring`. The integration only offers those values.

The UI currently has scheduling metadata for `startTime`, `startDate`, `endDate`, `notes`, and skipped dates in the JSON stored in `tasks.description`. The MCP tools reuse that existing metadata format; they do not require new task columns.

The live schema does not currently contain `tasks.start_time` or `profiles.timezone`, although the reminder RPC references both. The reminder system therefore needs separate schema reconciliation. This MCP version does not expose reminder creation or reminder editing.

Monthly/yearly/custom recurrence and the reminder system should only be enabled after the relevant migrations are reviewed, approved, applied, and verified separately.

## Supabase prerequisites before deployment

These steps intentionally have not been performed.

1. In the Eustace Supabase project, enable the OAuth 2.1 server under **Authentication → OAuth Server**.
2. Enable dynamic client registration, and retain the explicit authorization/consent screen. Dynamic registration can allow compatible clients to register; user approval is still required.
3. Configure the OAuth authorization URL path as `/oauth/consent` and set the Auth Site URL to the public HTTPS origin that serves this Eustace frontend.
4. Confirm the project's JWT signing keys use an asymmetric algorithm supported by the current Supabase server middleware (ES256 or RS256). The middleware validates user access tokens using the project's JWKS.
5. This feature branch adds a minimal `supabase/config.toml` with local project ID `eustace` and this function setting:

   ```toml
   [functions.eustace-mcp]
   verify_jwt = false
   ```

   This lets OAuth discovery reach the function before a user token exists. The function itself still verifies the OAuth bearer token with Supabase middleware. Do not disable authentication in the function handler. The existing repository did not previously contain a Supabase CLI config file; review this new file before using the CLI.

8. Set the server-side secrets for the production Eustace owner:

   ```bash
   supabase secrets set --project-ref ghlsmrkjmqerexqclago EUSTACE_OWNER_USER_ID=<YOUR_AUTH_USER_UUID> EUSTACE_OWNER_TIME_ZONE=Asia/Kolkata
   ```

   Obtain the UUID from the Eustace account's Supabase Auth user record. Do not use a username or email in place of the UUID. The time zone is set to `Asia/Kolkata` for this personal integration.

9. Link the local repository to the existing Eustace project, then deploy only the MCP Edge Function:

   ```bash
   supabase link --project-ref ghlsmrkjmqerexqclago
   supabase functions deploy eustace-mcp --project-ref ghlsmrkjmqerexqclago
   ```

   Do not run `supabase db push`, `supabase migration up`, or `supabase config push` as part of this feature's initial deployment. OAuth Server settings are a separate, explicit setup step. No database migration is part of this deployment.

## Connect from ChatGPT

After the endpoint is deployed and OAuth discovery/refresh-token behavior has been verified:

1. Open ChatGPT on the web.
2. Go to the custom app / Plugins area and add a custom MCP server.
3. Use the endpoint above and choose the OAuth authentication flow.
4. Complete the Eustace sign-in and consent page.
5. Review the discovered tools, enable the needed actions, and test each one with non-destructive reads before attempting writes.

ChatGPT may request confirmation before write or delete actions. Keep those confirmations enabled.

### ChatGPT plan availability

OpenAI's current documentation lists full custom MCP support, including write/modify actions, for ChatGPT Business and Enterprise/Edu. Pro is limited to read/fetch MCP permissions, and Go is not listed as a supported tier for custom MCP connections. This means the five-tool integration can be built here, but the create/update/complete/delete tools cannot be used from the current Go subscription through a custom MCP connection. Check OpenAI's current plan support before upgrading or changing plans.

## Testing checklist

- [ ] Validate Supabase OAuth discovery and the OAuth consent page.
- [ ] Confirm the OAuth discovery metadata advertises `offline_access` or equivalent refresh-token support accepted by ChatGPT.
- [ ] Confirm the OAuth authorization returns a refresh token and that ChatGPT can renew it; ChatGPT's connector documentation calls out refresh-token requirements.
- [ ] Confirm a non-owner Eustace account receives HTTP 403 from the MCP endpoint.
- [ ] Confirm an unauthenticated MCP request receives an OAuth challenge.
- [ ] With the owner account, list today's tasks.
- [ ] Create a test task and verify it appears in Eustace.
- [ ] Update the test task and verify the changed fields in Eustace.
- [ ] Complete a test task scheduled for the current owner-local date.
- [ ] Delete only the test task and verify its completion row cascades as expected.
- [ ] Run the app's normal build, lint, and tests before merge. CI also runs `deno check` against the new Edge Function.

## Security notes

- The MCP function has a single-owner allowlist in addition to Supabase Auth and RLS.
- The account UUID and time zone are server-side secrets, not client-visible Vite variables.
- No service-role key is used by the MCP function.
- Do not pass arbitrary `user_id` values from the ChatGPT tool inputs.
- Do not merge, deploy, enable OAuth settings, or apply migrations until the owner has reviewed and approved those actions.
