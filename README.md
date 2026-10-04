# amarkumar.guru

Wedding invitation for **Amar Kumar & Gurubani Gulati**, live at [amarkumar.guru](https://amarkumar.guru).

- Haldi & Sangeet: Saturday, 6 February 2027
- Shubh Vivah: Sunday, 7 February 2027
- Venue: Sterling Quinta, Jim Corbett. 89, Quinta Farmstay, Post Bailporkhra, Village Bandarjurha, Kaladhungi, Ramnagar, Uttarakhand 262401

A single static page with no build step:

| Path | What it is |
| --- | --- |
| `index.html` | The invitation: hero, invitation, countdown, events, seven vows, venue, map |
| `assets/css/style.css` | All styles, including the self-hosted fonts |
| `assets/js/main.js` | Scroll and pointer parallax, falling petals, countdown, copy / share buttons |
| `assets/img/` | Venue photos, ceremony art, favicon and the social preview image (`og-invite.jpg`) |
| `assets/cal/` | `.ics` files behind the "Apple / Outlook" save-the-date links |
| `assets/fonts/` | Cormorant Garamond, Jost and Tiro Devanagari Hindi (SIL Open Font License) |

Parallax layers are any element with `data-speed` (positive lags the scroll, negative runs ahead) inside a `data-host` section. Motion is switched off for visitors who ask for reduced motion.

To preview locally, serve the folder with any static server, for example `npx http-server .`, and open http://localhost:8080.

Deployed with GitHub Actions → GitHub Pages on every push to `main` (workflow: `.github/workflows/deploy.yml`).
