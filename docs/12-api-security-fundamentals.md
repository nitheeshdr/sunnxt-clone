# 12 — Web Application Security Fundamentals

**[← DRM Deep Dive](11-drm-deep-dive.md) · [Next: OWASP Mapping →](13-owasp-top10-mapping.md)**

---

## Who This Document Is For

This document explains the core web security concepts behind every vulnerability found in the SunNXT assessment. If you're new to security, start here. If you're experienced, use it as a reference when explaining findings to developers.

---

## 1. The Browser Security Model

### Same-Origin Policy (SOP)

The browser's most important security rule: **scripts on page A cannot read responses from page B** unless page B explicitly allows it.

```
Origin = Protocol + Hostname + Port

https://www.sunnxt.com = { https, www.sunnxt.com, 443 }
https://api.sunnxt.com = { https, api.sunnxt.com, 443 }  ← DIFFERENT ORIGIN

JavaScript on www.sunnxt.com cannot directly read responses from api.sunnxt.com
```

Why this matters for this project:
- Shaka Player (on `localhost:3000`) cannot directly call `api.sunnxt.com/licenseproxy/...`
- We need a **server-side proxy** (`/api/license`) to make the cross-origin request

### CORS (Cross-Origin Resource Sharing)

CORS is the mechanism by which a server explicitly allows cross-origin requests:

```
Server response header: Access-Control-Allow-Origin: https://www.sunnxt.com
```

Without this header, the browser blocks the response. Our stream proxy adds `Access-Control-Allow-Origin: *` to make stream segments accessible.

### Why Cookies Don't Cross Origins

When you make a `fetch()` from JavaScript, the browser only sends cookies if:
1. The request is to the **same origin**, OR
2. The server has CORS with `Access-Control-Allow-Credentials: true` AND the request includes `credentials: "include"`

For `HttpOnly` cookies (like SunNXT's `sessionid`), JavaScript **cannot read them at all** — only the browser sends them automatically with same-origin requests. This is why DRM license requests need a server-side proxy.

---

## 2. Authentication vs Authorization

These two concepts are often confused but are fundamentally different:

| Concept | Question | Example |
|---|---|---|
| **Authentication** | "Who are you?" | Login with username + password |
| **Authorization** | "What are you allowed to do?" | Can this user watch premium content? |

### How Vulnerabilities Map

- **VULN-01, 02** — Authentication vulnerability: weakens how credentials are protected
- **VULN-03, 05** — Authorization vulnerability: wrong user can perform actions
- **VULN-04** — Authentication/session: once authenticated, session lasts too long
- **VULN-07** — Authorization: geo-restricted content accessible from wrong region

### The Classic Auth Failure Pattern

```
Developer thinks: "If they have the token, they're authorized"
Attacker thinks: "Let me get the token somehow else"

Result: Token in URL → copied from browser history → unauthorized access
```

---

## 3. Cryptography Basics for Security Researchers

### Symmetric vs Asymmetric

| Type | Keys | Use Case | Example |
|---|---|---|---|
| Symmetric | One key for both encrypt + decrypt | Fast, for bulk data | AES (SunNXT's API), AES-128 HLS |
| Asymmetric | Public key encrypts, private key decrypts | Key exchange, signatures | RSA, ECDSA |

**The golden rule:** Never put a symmetric key where an attacker can find it (i.e., never in client-side code).

### Hashing vs Encryption

| Operation | Reversible? | Use Case |
|---|---|---|
| Hash (SHA-256, bcrypt) | No | Storing passwords, verifying integrity |
| Encryption (AES, RSA) | Yes (with key) | Protecting data that must be recovered |

Passwords must be **hashed** (not encrypted). If SunNXT's database is breached, encrypted passwords can be decrypted with the key. Hashed passwords cannot be reversed.

### HMAC — Message Authentication Codes

HMAC (Hash-based Message Authentication Code) proves a message was not tampered with:

```python
hmac = HMAC(secret_key, message, SHA256)
# Send: message + hmac
# Receiver: recomputes hmac, checks it matches
```

Akamai CDN tokens use HMAC-SHA256 to sign the `exp` and `acl` fields. An attacker cannot modify the expiry without knowing the Akamai secret.

---

## 4. Sessions and State Management

### How Sessions Work

```
Login →  Server creates session:  { sessionId: "abc123", userId: 42, createdAt: now() }
         Stores session server-side
         
         Response: Set-Cookie: sessionid=abc123; HttpOnly; Secure

Browser → Subsequent requests automatically include: Cookie: sessionid=abc123

Server  → Looks up session "abc123" → finds userId=42 → processes request
```

### Session Security Properties

```
HttpOnly:  JavaScript cannot read this cookie (protects from XSS)
Secure:    Only sent over HTTPS (protects from network interception)
SameSite:  Not sent on cross-site requests (protects from CSRF)
```

### Why SunNXT's Sessions Are Risky

Without a TTL: if sessionid is stolen, attacker has access until the victim manually logs out. Most users never log out — they just close the browser.

### JWT vs Session Cookies

| Approach | Storage | Expiry | Revocation |
|---|---|---|---|
| Session cookie | Server-side | Server-controlled | Easy (delete from DB) |
| JWT token | Client-side | Encoded in token | Hard (need a blocklist) |

SunNXT uses session cookies (server-side). JWTs appear only for DRM license requests. This is the right architecture — JWTs for short-lived operations, sessions for account access.

---

## 5. Rate Limiting and Brute Force Protection

### What Is Brute Force?

Trying many combinations to guess a secret:
- **Password brute force**: try all possible passwords for one account
- **Credential stuffing**: try breached username:password pairs
- **Password spraying**: try one common password across many accounts

### Defenses

```
1. Rate limiting:     Slow down attempts (max N per minute)
2. Account lockout:   Block after M failures
3. CAPTCHA:           Prove you're human
4. MFA:               Even if password is found, still need second factor
5. Breach monitoring: Check passwords against known breached lists (HaveIBeenPwned API)
```

### Why Rate Limiting Alone Isn't Enough

Distributed attacks use many IP addresses. A limit of "10 attempts per IP" is useless if an attacker uses a botnet with 10,000 IPs — each IP makes 10 attempts, total 100,000 attempts.

Combined defenses:
- Per-IP rate limiting (basic protection)
- Per-account lockout (prevents targeting specific users)
- Global anomaly detection (alerts when total failure rate spikes)

---

## 6. Security Headers

Every web application should send these HTTP response headers:

```
Content-Security-Policy: default-src 'self'; script-src 'self' https://trusted.cdn.com
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Strict-Transport-Security: max-age=31536000; includeSubDomains
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

| Header | Protects Against |
|---|---|
| CSP | XSS — restricts which scripts can run |
| X-Frame-Options | Clickjacking — prevents page being embedded in iframe |
| X-Content-Type-Options | MIME sniffing attacks |
| HSTS | SSL stripping — forces HTTPS |

---

## 7. OWASP Testing Methodology

When testing any web application, follow this structured approach:

### Phase 1: Information Gathering
- Identify all entry points (forms, API endpoints, URL parameters)
- Map the authentication flow
- Find client-side JavaScript files and analyze them
- Check HTTP headers, cookies, error messages

### Phase 2: Authentication Testing
- Test login with invalid credentials → observe error messages (don't reveal if username exists)
- Test rate limiting → submit 20+ login requests rapidly
- Check session cookie properties (HttpOnly, Secure, SameSite)
- Test logout → does the session actually invalidate?

### Phase 3: Authorization Testing
- Can user A access user B's data by changing an ID in the URL?
- Can a non-premium user access premium content endpoints?
- Can actions be performed without CSRF tokens?

### Phase 4: Cryptography Review
- Search JavaScript for hardcoded keys/secrets
- Check if IVs are static or random
- Verify HTTPS is enforced everywhere

### Phase 5: API Security
- Test all parameters with unexpected values (null, negative, very large, special characters)
- Check error responses — do they leak internal information?
- Test HTTP methods — does `DELETE /api/user/42` work without auth?

---

## 8. How to Write a Security Report

### Structure

1. **Executive Summary** — 1 paragraph, non-technical, for management
2. **Scope** — what was tested and what was not
3. **Findings** — each with: severity, description, proof of concept, recommendation
4. **Remediation Summary** — prioritized list of fixes

### Severity Rating (CVSS v3.1 Quick Reference)

```
Critical (9.0–10.0): Remote code execution, full database access, admin bypass
High     (7.0–8.9):  Authentication bypass, PII exposure, privilege escalation  
Medium   (4.0–6.9):  Partial access, requires user interaction, CSRF, logic flaws
Low      (0.1–3.9):  Information disclosure, defense-in-depth gaps
Info     (0.0):      Best practice violations, no direct exploitability
```

### Writing Good PoC (Proof of Concept)

A PoC must be:
- **Reproducible**: another person can follow the steps and get the same result
- **Minimal**: doesn't require complex setup beyond what's described
- **Safe**: doesn't cause damage or data loss to the target system
- **Specific**: shows the exact impact, not just "it might be possible"

Bad PoC: "The encryption key might be findable in the JavaScript."

Good PoC: "Open Chrome DevTools on www.sunnxt.com → Ctrl+Shift+F → search 'CryptoJS.AES.encrypt' → key appears in file bundle.js at line 4827: `A3s68aORSgHs$71P`"

---

**[Next: OWASP Mapping →](13-owasp-top10-mapping.md)**
