# Closet

A phone app that helps people stop buying new clothes by making them use what they already own, and turn to second-hand when something is really missing.

This is a research prototype. It runs on a developer's computer and a test phone, not in an app store.

## Purpose

The urge to buy often comes from "I have nothing to wear", while the closet is full of things that are rarely or never worn. Closet works on that feeling.

- **See what you own:** photograph a piece and the AI tags it (type, colours, pattern, material, seasons). The closet becomes a grid you can actually look at.
- **See what you wear:** "Wearing today" logs the pieces you have on, with an optional mirror photo. Every piece shows how often and how long ago it was worn.
- **Celebrate second-hand:** each piece can be marked second-hand, new or a gift. The closet shows how much of it is second-hand.

The order of what the app promotes is fixed: **wear what you own first, fill a real gap second-hand, never push new.** Second-hand shops will appear only when there is a real gap in the closet, not as advertising.

## What you need

| What | Why |
| --- | --- |
| [Node.js](https://nodejs.org) 20.19.4 or newer (22.13+ or 24.3+ also fine) | Runs the development server on your computer. `npm` refuses to install on an older Node |
| [Ollama](https://ollama.com) with the model `gemma4:12b` | Gemma looks at the clothing photos, on your own computer. Photos never leave it. Needs about 8 GB of disk and a computer with 16 GB of RAM or more |
| [Expo Go for **SDK 57**](https://expo.dev/go?sdkVersion=57&platform=android&device=true) on a phone | Shows the app on the phone, without building or installing it. Tested on Android. The Play Store offers only the newest Expo Go, which is for a newer SDK and will refuse to open this project: install SDK 57 from the link, and turn off auto-update for Expo Go |
| Phone and computer on the same Wi-Fi | The phone loads the app, and sends photos for tagging, to your computer |

No API key and no account are needed.

## Run it

1. Install Ollama, download the model once and keep the Ollama app running:

   ```bash
   ollama pull gemma4:12b
   ```

2. Install the packages exactly as locked:

   ```bash
   npm ci
   ```

   Use `npm ci`, not `npm install`: it installs precisely what `package-lock.json` says and stops with an error if the lock and `package.json` disagree. npm will report security warnings. Do not run `npm audit fix --force`: the "fix" it suggests downgrades Expo by many versions and breaks the project. The warnings are in development tools that do not ship in the app.

3. Start the development server:

   ```bash
   npx expo start
   ```

4. Open Expo Go on the phone and scan the QR code from the terminal.

## How it works

```
Phone (Expo Go)                     Your computer
───────────────                     ─────────────
camera → photo saved on the phone
photo  ──── POST /api/tag ────────→ Expo dev server (API route)
                                         │
                                         ▼
                                    Ollama · gemma4:12b
                                         │
tags   ←──────────────────────────── JSON in a fixed shape
saved on the phone (AsyncStorage)
```

- **Why the photo goes through the dev server:** on the phone, `localhost` is the phone itself, so it cannot reach Ollama directly. It can reach the dev server it already loads the app from, so an API route there passes the photo on.
- **Fixed word lists:** the model may only answer with words from fixed lists (for example 20 colours). Ollama enforces this with a JSON schema, so "navy", "Navy Blue" and "dark blue" never become three colours.
- **Everything stays on the phone:** pieces, wears and photos are stored on the device. There is no account and no server database.
- **Wear statistics are calculated, not stored:** "Worn 3× · 12 days ago" is worked out from the list of wears each time, so it can never disagree with them.

## Project layout

```
src/
  app/                    screens (every file is a route, Expo Router)
    index.tsx             the closet grid
    piece/[id].tsx        one piece: tags, origin, "You in it" photos
    wear.tsx              "Wearing today"
    api/tag+api.ts        the API route that runs on your computer
  client/                 code that runs on the phone
    closet-context.tsx    the shared closet state for all screens
    add-piece.ts          camera, saving photos, asking for tags
    wear-stats.ts         how often and how long ago something was worn
    theme.ts              colours
  server/
    read-garment.ts       the call to Gemma through Ollama
  shared/
    garment.ts            the tag shape and word lists, used by both sides
  storage/
    closet.ts             what is saved on the phone
```

## Commands

| Command | What it does |
| --- | --- |
| `npx expo start` | Starts the development server |
| `npm run typecheck` | Checks the TypeScript types |

## Credits

The clothing word lists and the tagging prompt are adapted from [wardrowbe](https://github.com/Anyesh/wardrowbe) by Anyesh, released under the MIT licence.
