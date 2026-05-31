---
name: Mobile Bottom Navigation
description: Fixed bottom navigation bar pattern for mobile devices.
---

- Hidden on desktop (`sm:hidden`)
- Uses `bottom-nav-safe` class for `env(safe-area-inset-bottom)` padding
- Each nav item has an icon, label, and colored background when active
- Active state uses `scale-110` for the icon and colored background

**Why:** On mobile, a bottom navigation bar is more thumb-accessible than a sidebar. The colored icons make it easier to identify the current section.
**How to apply:** The `bottom-nav-safe` CSS class should be used on any fixed bottom element to avoid iPhone home indicator overlap.
