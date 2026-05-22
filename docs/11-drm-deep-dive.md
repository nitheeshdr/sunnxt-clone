# 11 — DRM Deep Dive: How Content Protection Actually Works

**[← Vulnerability Deep Dive](10-vulnerability-deep-dive.md) · [Next: Web Security Fundamentals →](12-api-security-fundamentals.md)**

---

## Why DRM Matters for Security Research

DRM is the last line of defense for premium content. Everything else (auth, sessions, geo-blocking) can potentially be bypassed through clever API calls. DRM is different — it operates at the **cryptographic and hardware level**, making content protection independent of the application layer.

Understanding DRM helps security researchers know:
- What CAN be bypassed (auth, session, geo, API)
- What CANNOT be bypassed without hardware access (content keys)
- Where the real security boundary is in an OTT platform

---

## The Three DRM Systems

### Widevine (Google)

Used in: Chrome, Firefox, Edge (on non-Windows), Android

```
Browser  →  Widevine CDM (plugin)  →  Google's key servers (EME protocol)
```

Widevine has three levels:
- **L1**: Keys stored in hardware TEE (Trusted Execution Environment). Content decoded in hardware. Used in Android phones, Chromecast.
- **L2**: Crypto operations in hardware, decode in software. Rare.
- **L3**: Everything in software. Used in desktop Chrome. Theoretical key extraction risk.

### PlayReady (Microsoft)

Used in: Edge, Internet Explorer, Windows apps, Xbox

PlayReady is tightly integrated with Windows and Xbox hardware. On Windows 10+ with HDCP-compliant displays, PlayReady L3000 provides hardware protection similar to Widevine L1.

### FairPlay (Apple)

Used in: Safari, iOS, tvOS, macOS apps

FairPlay uses a different protocol (HTTPS Key Delivery) compared to Widevine/PlayReady (which use Encrypted Media Extensions). FairPlay is the only DRM that works in Safari — Widevine is blocked on Apple devices in Safari.

---

## The EME (Encrypted Media Extensions) API

EME is the W3C browser API that standardizes DRM across different systems. Shaka Player uses EME under the hood:

```javascript
// What Shaka does internally (simplified)

// 1. Create a MediaKeys object for the DRM system
const config = [{ initDataTypes: ['cenc'], videoCapabilities: [{ contentType: 'video/mp4' }] }];
const keySystemAccess = await navigator.requestMediaKeySystemAccess("com.widevine.alpha", config);
const mediaKeys = await keySystemAccess.createMediaKeys();

// 2. Attach to video element
await videoElement.setMediaKeys(mediaKeys);

// 3. When encrypted data is encountered, browser fires 'encrypted' event
videoElement.addEventListener('encrypted', async (event) => {
  const session = await mediaKeys.createSession();
  
  // 4. Generate license request (the "challenge")
  session.addEventListener('message', async (messageEvent) => {
    // messageEvent.message = binary Widevine challenge
    
    // 5. Send challenge to license server
    const response = await fetch(licenseUrl, {
      method: 'POST',
      body: messageEvent.message  // binary challenge
    });
    
    // 6. Install the license in the CDM
    await session.update(new Uint8Array(await response.arrayBuffer()));
    // Video now decrypts automatically
  });
  
  await session.generateRequest(event.initDataType, event.initData);
});
```

---

## How License Servers Work

A Widevine license server receives a **binary challenge** from the browser's CDM. This challenge contains:
- The browser's Widevine device certificate (proves it's a real device)
- The Key ID (KID) — which encryption key is being requested
- Usage rules requested

The license server:
1. Verifies the device certificate with Google's Widevine backend
2. Checks business rules (is this account subscribed? is this content licensed?)
3. Returns an encrypted **license** containing the content key

The content key is **encrypted** in the license using the device's unique key — so only that specific device can decrypt it. This is why you can't simply copy a license from one device to another.

---

## Nagravision DRM Proxy Architecture

SunNXT uses Nagravision (now Kudelski Group) as a multi-DRM aggregator:

```
         ┌─────────────────────────────────────────────┐
         │              SunNXT Platform                │
         │                                             │
         │  Content Packager  →  Encrypted CDN Upload  │
         │       │                     │               │
         │  Nagravision CAS  →  Key Management         │
         └─────────────────────────────────────────────┘
                     │
         ┌───────────┼───────────────┐
         ↓           ↓               ↓
   Widevine      PlayReady       FairPlay
  License Srv   License Srv     License Srv
         ↑           ↑               ↑
         └───────────┼───────────────┘
                     │
        api.sunnxt.com/licenseproxy/v3/nagravisionDRMProxy
                     │ (routes to correct DRM backend)
                     │
                 Challenge
                 (from browser)
```

The single Nagravision proxy endpoint routes the challenge to the right DRM backend based on:
1. The binary structure of the challenge (Widevine vs PlayReady use different formats)
2. The `video_format` field in the JWT token

---

## CENC — How One Stream Serves All DRM Systems

CENC (Common Encryption) allows a single encrypted video file to be decrypted by any of the three DRM systems. This is how it works:

### Encryption Side (Content Packager)

```
1. Generate a random 128-bit content key K
2. Encrypt video segments with AES-128-CTR using key K
3. For each DRM system, ask that system to "wrap" key K in their format:
   - Widevine wraps K → Widevine PSSH
   - PlayReady wraps K → PlayReady PSSH
   - FairPlay wraps K → FairPlay key request URL
4. Include all PSHHs in the manifest
```

### Decryption Side (Player)

```
1. Browser reads manifest → finds PSSH for its DRM system
2. Requests license using that PSSH
3. License server returns the decryption key K (encrypted for this device)
4. CDM decrypts K → decrypts segments
```

The segments are encrypted with the **same key K** regardless of which DRM system is used. The PSHHs just contain different encrypted versions of K.

This is why, in theory, if you obtained K through any DRM system, you could decrypt the segments. In practice, K never leaves the CDM.

---

## AES Encryption Modes Used in Video

### CTR Mode (Counter) — Used in most CENC

```
Key:        K = 0x2b7e151628aed2a6...
Counter:    starts at IV, increments for each block
Encryption: cipher_block = plaintext_block XOR AES(K, counter)
```

CTR mode is fast and parallelizable. It also means encryption errors don't propagate — one corrupted block doesn't corrupt the rest.

### CBC Mode (Cipher Block Chaining) — Used in some HLS AES

```
Block 1:  cipher_1 = AES(K, plaintext_1 XOR IV)
Block 2:  cipher_2 = AES(K, plaintext_2 XOR cipher_1)
Block 3:  cipher_3 = AES(K, plaintext_3 XOR cipher_2)
```

CBC errors propagate — one corrupted block corrupts the next block too.

### AES-128 HLS (SunNXT's `hlsaes` format)

This is **NOT DRM**. It's basic AES-128-CBC encryption of HLS segments with a key served via a URL in the manifest:

```m3u8
#EXT-X-KEY:METHOD=AES-128,URI="https://keyserver.example.com/key/12345",IV=0x000000000000001
```

The player fetches the key from the URI, then decrypts segments. This is significantly weaker than Widevine/PlayReady because:
- The key URL is in the manifest (accessible to anyone with the manifest)
- The key itself is a plain HTTP response (can be captured and reused)
- No device binding — the key works on any device

---

## Widevine Key Extraction (Why It's Not Practical for Security Bypass)

There is a known (but patched) technique called **"Widevine L3 key extraction"**. Here's why it doesn't apply in practice:

1. **Requires full system access** — needs to run code in the same process as the Chrome CDM plugin or hook into OS-level APIs
2. **Not possible from JavaScript** — the browser sandbox prevents JS from accessing CDM internals
3. **Not possible from the network** — keys are encrypted in transit and inside the CDM
4. **Platform-specific** — works differently on each OS; mobile L1 is hardware-protected
5. **Patched** — Google regularly updates the Widevine CDM to close extraction techniques

For a web application security test, DRM is effectively unbreakable. The security boundary is correctly at the license server authentication layer.

---

## What SunNXT's DRM Does Well

1. **Correct CENC implementation** — all premium content is properly CENC-encrypted
2. **No clear stream fallback** — no unencrypted streams available for premium content
3. **Short-lived Akamai tokens** — CDN URLs expire in 2–8 hours
4. **JWT validation** — Nagravision validates content_id, userId, expiry

## What Could Be Improved

1. **Widevine L1 enforcement** — currently L3 (software) is accepted; could enforce L1 for premium content
2. **IP binding in DRM JWT** — currently bound to server IP, not browser IP (VULN-08)
3. **maxUses: 2** — reducing to 1 would prevent the reuse window
4. **Output protection** — enforce HDCP for premium playback

---

**[Next: Web Security Fundamentals →](12-api-security-fundamentals.md)**
