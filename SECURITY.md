# Security Policy

## 1. Reporting a Vulnerability

We take the security and privacy of Eustace users seriously. If you discover a potential security vulnerability in Eustace, please report it responsibly.

### Disclosure Guidelines
- **Reporting Channel:** Please submit a vulnerability report by opening a private security advisory on GitHub or by contacting the project maintainer directly.
- **Information to Include:**
  - Description of the vulnerability and its potential impact.
  - Step-by-step reproduction instructions or a minimal Proof of Concept (PoC).
  - Target environment and affected components (e.g., specific RPC, table policy, or frontend component).
- **Response Commitment:**
  - An acknowledgment will be sent within 48 hours of receipt.
  - We will provide status updates as the issue is triaged, validated, and patched.
  - We request that you do not publicly disclose the issue until a patch has been released.

---

## 2. Threat Model & Security Architecture

Eustace operates on a zero-trust client model: **the client browser is never trusted to make authorization decisions.** All permissions, privacy restrictions, and state mutations are strictly enforced at the database layer via PostgreSQL Row Level Security (RLS) and cryptographic JWT validation.

### 2.1 Database Security & Row Level Security (RLS)
- **RLS Enforcement:** All core application tables (`profiles`, `tasks`, `task_completions`, `daily_data`, `notes`, `folders`, `friendships`, `conversations`, `conversation_members`, `messages`, `user_preferences`) have Row Level Security enabled.
- **Tenant Isolation:** Direct table queries are bounded by `auth.uid() = user_id` or verified relationship joins. A user cannot view, insert, update, or delete another user's personal tasks or private notes.
- **Profile Privacy:** Profile visibility settings (`public`, `friends`, `private`) are enforced at the database level. Private profiles are never exposed to unauthorized authenticated callers or anonymous users.

### 2.2 Hardened Stored Procedures (RPCs)
To prevent privilege escalation and SQL injection:
- All privileged functions are declared with `SECURITY DEFINER` and explicitly configure `SET search_path = ''`.
- Every table and function reference inside stored procedures is fully schema-qualified (e.g., `public.profiles`, `public.friendships`, `auth.uid()`).
- Direct function execution is revoked from `PUBLIC` and granted strictly to intended roles (`anon`, `authenticated`, or `service_role`).

### 2.3 Username Validation Privacy
Username availability checks use the secure `public.check_username_available(target_username)` RPC:
- Availability checks execute with elevated database permissions to verify global uniqueness across all users.
- The RPC returns a clean boolean (`true` or `false`) without exposing whether an existing username belongs to an active, private, or hidden account.
- Direct table queries are never used for availability verification, preventing unauthorized user enumeration.

### 2.4 Browser Security & Edge Defenses
Eustace enforces strict headers via Vercel Edge configuration (`vercel.json`):
- **Content Security Policy (CSP):** Disallows unauthorized external scripts and framing (`frame-ancestors 'none'`).
- **HTTP Strict Transport Security (HSTS):** Enforces HTTPS with `includeSubDomains; preload`.
- **Anti-Clickjacking:** `X-Frame-Options: DENY`.
- **MIME Protection:** `X-Content-Type-Options: nosniff`.
- **Cross-Site Scripting (XSS):** All rich text input is parsed and sanitized through TipTap's schema model; direct DOM injection via `dangerouslySetInnerHTML` is restricted to static SVG helpers and verified markdown output.
