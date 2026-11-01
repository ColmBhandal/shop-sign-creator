# Shop Sign Creator

Make a printable PDF notice sign from a short message — like `CLOSED` or `BACK IN 10 MINS`.

You pick a **template** (the layout) and a **theme** (the look), type your text, and get a
PDF ready to print.

## Use it

```bash
sign closed --template centered --theme festive --text "CLOSED\nBACK JANUARY 2ND"
```

That saves `output/closed.pdf`.

- `sign hours <filename> --business "Name" --theme <theme> --hours-file hours.txt` — make an opening-hours sign: business name as a large header, an "Opening Hours" sub heading, then a day/hours table. Put one `Day: hours` per line in the file (or use `--hours "Monday: 9-5
Tuesday: CLOSED"`). Change the sub heading with `--subheading`.
- `sign list` — see the templates and themes you can choose from.
- `sign --help` — see all the options.

Use `--file notice.txt` instead of `--text` to read the message from a file. Other handy
options: `--out <folder>`, `--paper A4`, and `--overwrite`.

## Ink level

Every theme has an **ink level** — `high`, `medium` or `low` — saying roughly how much
ink/toner it uses. It's a first-class idea:

- Themes live in `configs/themes/high/`, `configs/themes/medium/` and `configs/themes/low/`.
- `sign list --ink low` shows only the cheap-to-print themes.
- Adding `--ink low` when making a sign makes sure you don't accidentally pick a heavy one
  (it errors if the chosen theme doesn't match).

Low = light line art on white (cheap). High = full-colour or photo backgrounds.

## Themes

`sign list` shows them all, grouped by colour and ink.

- **Black & white:** `plain`.
- **Colour, Christmas** 🎄
  - high ink: `festive`, `winter`, `snowscape` (photo background)
  - medium ink: `jolly`, `trimmings`, `garland` (photo band)
  - low ink: `sketch`, `frosty`, `sprig` (small photo footer)

`snowscape`, `garland` and `sprig` use photo images — see `assets/images/` and `NOTICE.md`.

## Add your own

Templates and themes are just small JSON files. Drop a theme into
`configs/themes/<high|medium|low>/`, or any `configs/` folder passed with `--config-dir`,
and it shows up automatically. No coding needed.

## Build the Windows app

```bash
npm run package:win
```

Creates a standalone `sign.exe` that runs on any Windows PC with nothing else installed.

Fonts are open-source (OFL). Licences are in `assets/fonts/`.

## License

MIT — copy it, use it, change it, do whatever you like. Signs you make are yours to use
freely too. See `LICENSE`.
