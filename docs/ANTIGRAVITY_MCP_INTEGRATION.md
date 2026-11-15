# Eustace Antigravity & ChatGPT MCP Integration

## Status

Source implementation is on `feat/eustace-chatgpt-mcp`.
Code has been audited, validated, type-checked, and backed by comprehensive unit tests.
In accordance with production safety protocols, the Edge Function has **not** been deployed to production and no production database/OAuth changes have been performed.

## Architecture & Endpoint

Remote, OAuth-protected Streamable HTTP MCP endpoint:
`https://ghlsmrkjmqerexqclago.supabase.co/functions/v1/eustace-mcp`

### Five Exposed Tools

1. `create_task`: Creates a task for a date with title, category, duration, notes, optional start time, and supported recurrence (`none`, `daily`, `weekdays`, `weekly`).
2. `list_tasks`: Lists task occurrences and completion status for a date (defaults to the owner's current local date). Safely queries recurring and date-specific tasks across pagination boundaries without omitting older recurring items. Returns chronologically sorted tasks.
3. `update_task`: Updates task fields while preserving untouched metadata. Recurring task edits apply to the task definition.
4. `complete_task`: Marks a task complete for the owner's current local date only (strictly enforced both in code and by Postgres trigger). Idempotent.
5. `delete_task`: Permanently deletes the task; existing completion history cascades via foreign key constraints.

## Antigravity MCP Client Configuration

Antigravity connects to remote MCP servers via Streamable HTTP.

### Global Configuration File:
`~/.gemini/config/mcp_config.json`

```json
{
  "mcpServers": {
    "eustace": {
      "serverUrl": "https://ghlsmrkjmqerexqclago.supabase.co/functions/v1/eustace-mcp",
      "url": "https://ghlsmrkjmqerexqclago.supabase.co/functions/v1/eustace-mcp",
      "timeoutSeconds": 60
    }
  }
}
```

### Workspace Configuration File:
`.agents/mcp_config.json`

## Production Deployment Steps (Owner Manual Actions)

Before Antigravity can complete live OAuth authentication and invoke tools, the owner must perform the following:

1. **Enable Supabase OAuth 2.1 Server**:
   - In the Supabase Dashboard for project `ghlsmrkjmqerexqclago`, navigate to **Authentication → OAuth Server**.
   - Enable the OAuth 2.1 Server.
   - Enable Dynamic Client Registration.
   - Configure Authorization Path: `/oauth/consent`.
   - Set Auth Site URL to the public HTTPS URL serving the Eustace web app.

2. **Configure Production Secrets**:
   ```bash
   supabase secrets set --project-ref ghlsmrkjmqerexqclago EUSTACE_OWNER_USER_ID=<YOUR_AUTH_USER_UUID> EUSTACE_OWNER_TIME_ZONE=Asia/Kolkata
   ```

3. **Deploy the MCP Edge Function**:
   ```bash
   supabase functions deploy eustace-mcp --project-ref ghlsmrkjmqerexqclago --no-verify-jwt
   ```
   *(Note: `--no-verify-jwt` matches `verify_jwt = false` in `supabase/config.toml` so RFC 9728 discovery and bearer verification can be handled by Supabase server middleware).*

4. **Connect in Antigravity**:
   - Open Antigravity.
   - Antigravity will discover `eustace` from `mcp_config.json`.
   - Trigger the OAuth consent prompt, log in with your Eustace credentials, and click **Approve access**.
   - Test read-only command: `"Show me my tasks for today."`
