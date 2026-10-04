# amarkumar.guru

Wedding invitation for **Amar Kumar & Gurubani Gulati**, live at [amarkumar.guru](https://amarkumar.guru).

- Haldi, Mehndi & Sangeet: Tuesday, 6 October 2026
- Shubh Vivah: Wednesday, 7 October 2026
- Venue: Sterling Quinta, Jim Corbett. 89, Quinta Farmstay, Post Bailporkhra, Village Bandarjurha, Kaladhungi, Ramnagar, Uttarakhand 262401

A single static page with no build step:

| Path | What it is |
| --- | --- |
| `index.html` | The invitation: hero, invitation, countdown, Haldi / Mehndi / Sangeet scenes, the bride's entrance, the varmala reveal, seven vows, venue, map |
| `assets/css/style.css` | All styles, including the self-hosted fonts |
| `assets/js/main.js` | Scroll and pointer parallax, the pinned wedding reveal, the bride video (plays only on screen, with a pause button), falling petals, countdown, copy / share buttons |
| `assets/img/` | The couple's Haldi, Sangeet and Wedding illustrations (full scenes plus `-arch` portrait crops), favicon and the social preview image (`og-invite.jpg`) |
| `assets/video/` | The bride's twirl: a seamless 11-second loop cropped around her (H.264 `.mp4`, a VP9 `.webm` fallback and the poster frame) |
| `assets/cal/` | `.ics` files behind the "Apple / Outlook" save-the-date links |
| `assets/fonts/` | Cormorant Garamond, Jost and Tiro Devanagari Hindi (SIL Open Font License) |

Parallax layers are any element with `data-speed` (vertical) or `data-speed-x` (horizontal) inside a `data-host` section; positive values lag the scroll, negative ones run ahead. The marigold, mandala, mehndi, leaf and lotus artwork are inline SVG symbols at the top of `index.html`. Motion is switched off for visitors who ask for reduced motion, and the wedding scene then shows as a still picture.

To preview locally, serve the folder with any static server, for example `npx http-server .`, and open http://localhost:8080.

Deployed with GitHub Actions → GitHub Pages on every push to `main` (workflow: `.github/workflows/deploy.yml`).
