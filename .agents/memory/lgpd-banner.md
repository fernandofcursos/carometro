---
name: LGPD Banner Pattern
description: Cookie consent banner for Brazilian LGPD compliance.
---

- Uses `localStorage` with key `'lgpd-accepted'` to persist user choice
- Animated entry with Framer Motion (spring animation from bottom)
- Contains links to privacy policy and terms of use
- Written in Portuguese

**Why:** LGPD (Brazil's GDPR equivalent) requires explicit consent for data collection. The banner must be clearly visible on first visit.
**How to apply:** If the banner needs modification, the key is `localStorage.getItem('lgpd-accepted')`. The banner only shows when the key is absent.
