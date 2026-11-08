# Closet

A phone app that helps people stop buying new clothes by making them use what they already own, and turn to second-hand when something is really missing.

This is a research prototype. It runs on a developer's computer and a test phone, not in an app store.

## Purpose

The urge to buy often comes from "I have nothing to wear", while the closet is full of things that are rarely or never worn. Closet works on that feeling.

- **See what you own:** photograph a piece and the AI tags it (type, colours, pattern, material, season, formality, style). The closet becomes a grid you can actually look at.
- **Celebrate second-hand:** each piece can be marked second-hand, new or a gift. The closet shows how much of it is second-hand.

The order of what the app promotes is fixed: **wear what you own first, fill a real gap second-hand, never push new.** Second-hand shops will appear only when there is a real gap in the closet, not as advertising.

## What you need

| What | Why |
| --- | --- |
| [Node.js](https://nodejs.org) 20.19.4 or newer (22.13+ or 24.3+ also fine) | Runs the development server on your computer. `npm` refuses to install on an older Node |
| An LLM Hub API key (`api.llmhub.infs.ai`) | A vision model on LLM Hub looks at the clothing photos. The photos are sent to LLM Hub, and each scan costs a small amount |
| [Expo Go for **SDK 58**](https://expo.dev/go?sdkVersion=58&platform=android&device=true) on a phone | Shows the app on the phone, without building or installing it. Tested on Android. The Play Store offers only the newest Expo Go, which is for a newer SDK and will refuse to open this project: install SDK 58 from the link, and turn off auto-update for Expo Go |
| Phone and computer on the same Wi-Fi | The phone loads the app, and sends photos for tagging, to your computer |

The key stays on your computer, in the development server. It is never sent to the phone.

## Run it

1. Put your key in a file called `.env` in the project folder. Never commit it:

   ```bash
   LLM_API_KEY=your-llm-hub-key
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
                                    LLM Hub · best-chat
                                         │
tags   ←──────────────────────────── JSON in a fixed shape
saved on the phone (AsyncStorage)
```

- **Why the photo goes through the dev server:** on the phone, `localhost` is the phone itself, so it should not hold the API key. It talks to the dev server it already loads the app from, and an API route there passes the photo on with the key.
- **Fixed word lists:** the model may only answer with words from fixed lists (for example 20 colours). The API enforces this with a JSON schema, so "navy", "Navy Blue" and "dark blue" never become three colours.
- **Only the garment is sent:** after a photo is taken or a screenshot chosen, you draw around the piece (or frame it). Everything outside the line is turned white on the phone, so backgrounds, rooms and faces never reach the model.
- **Everything stays on the phone:** pieces and photos are stored on the device. There is no account and no server database.

## Project layout

```
src/
  app/                    screens (every file is a route, Expo Router)
    index.tsx             the closet grid
    piece/[id].tsx        one piece: check and change labels, origin, retake, remove
    wish.tsx              the wish check: something you want → the closest pieces you own
    cut.tsx               cut out the garment: draw around it or frame it
    secondhand.tsx        wishes saved to look for second-hand (labels only, no images)
    api/tag+api.ts        the API route that runs on your computer
  client/                 code that runs on the phone
    closet-context.tsx    the shared closet state for all screens
    add-piece.ts          camera and photo library, saving photos, asking for tags
    cut-out.ts            shrinks the picture, whitens everything outside the line
    label-editor.tsx      the AI labels, with "please check", to confirm or change
    theme.ts              colours
  server/
    read-garment.ts       the call to LLM Hub
  shared/
    garment.ts            the tag shape and word lists, used by both sides
    closest.ts            which owned pieces are closest to a wish (rule-based, on labels)
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
