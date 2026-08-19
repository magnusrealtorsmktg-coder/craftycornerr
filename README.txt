THE CRAFTY CORNERR — Handmade Indian Home Décor
================================================
Handmade happiness in every corner.

WHAT THIS IS
------------
A single-file website. Everything (HTML, CSS, JavaScript, all product
images encoded as base64, fonts/libraries loaded from CDN) lives inside
index.html. There is no build step and nothing to install.

FILES
-----
index.html   The entire website. This is the only file you deploy.
README.txt   This file.

HOW TO PREVIEW LOCALLY
----------------------
Just double-click index.html to open it in any modern browser
(Chrome, Edge, Safari, Firefox). That's it.

HOW TO PUT IT ONLINE
--------------------
Option A — Netlify Drop (easiest, no account setup needed):
  1. Go to https://app.netlify.com/drop
  2. Drag the index.html file (or this whole folder) onto the page.
  3. You get a live URL in a few seconds.

Option B — GitHub + Netlify auto-deploy:
  1. Push index.html to your repo (e.g. github.com/adarshdev200).
  2. Connect the repo in Netlify; every push auto-deploys.

Option C — GitHub Pages:
  1. Put index.html in the repo root (or /docs).
  2. Settings > Pages > deploy from that branch/folder.

FEATURES IN THIS BUILD
----------------------
- Brand logo + name in the navbar.
- Smooth (Lenis-powered) scrolling on all in-page navigation links.
- Shop overlay with category grid and product detail pages.
- Animated, per-category themed background (drifting color blobs +
  subtle rotating motif) on the category pages, with staggered card
  entrance animations.
- "Shop by occasion" and trending product sections.
- Respects "reduced motion" accessibility settings (animations ease off
  for users who request it).

EDITING TIPS
------------
- Product data lives in the CATALOG object inside the <script> block.
- Product images are in the PIMG object (base64 strings).
- Brand colors are CSS variables in :root at the top of the <style> block
  (--cream, --peach, --coral, --sage, --lav, --charcoal).
- Because images are embedded as base64, the file is a few MB — this is
  normal and keeps everything in one portable file.

TECH
----
Vanilla HTML/CSS/JS. Animations via GSAP + ScrollTrigger; smooth scroll
via Lenis (all loaded from CDN, so an internet connection is needed on
first load).

CONTACT
-------
Built for The Crafty Cornerr.
