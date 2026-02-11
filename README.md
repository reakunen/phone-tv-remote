# Free Phone-TV Remote 

[APP Store Link](https://apps.apple.com/us/iphone/today) ![App Store](https://apps.apple.com/us/iphone/today)

1. My roommate picked up a TV on the side of the street! Free TV Hurray! 
2. But we then realized we had **no remote...** Uh-oh... 
3. So we looked at an app to use the TV on our phones... but it costs money to turn on the TV... 14.99$ each month just to turn on the TV? Heck no, *mytifi* (the app)!
4. So I made this, it's **completely free!**

This app supports: 
- quick TV discovery on local Wi-Fi
- saved TV profiles
- a modern remote UI with animated controls
- a numeric channel keypad overlay

## What it does

This app lets users connect to a TV profile once, then reuse it every time the app opens.
Users can:
- scan for TVs on the local network
- add TVs manually in advanced mode
- switch between saved TVs
- delete old TV profiles
- use a full on-screen remote (navigation, volume, channel, playback, numpad)

## Features

- Setup modes
  - `Scan`: discovers TVs on common LAN ranges and lists matches
  - `Advanced`: manual setup with brand, nickname, host, and port
- Saved profiles
  - stores multiple TVs locally with AsyncStorage
  - remembers the active TV on next app launch
  - profile manager to connect/delete/add TVs
- Remote controls
  - power, input, D-pad + OK
  - back, home, settings
  - volume/channel rockers
  - mute + playback controls
  - numpad modal with `0-9`, backspace, and submit
- Interaction polish
  - press-state animations (scale + color feedback)
  - icon fonts preloaded to avoid missing glyphs

## Tech stack

- Expo SDK 53
- React Native 0.79
- TypeScript
- AsyncStorage
- `@expo/vector-icons`

## Getting started

```bash
npm install
npm run start
```

Then open in Expo Go on iPhone (same Wi-Fi network as your TV/bridge).

Useful scripts:

```bash
npm run ios
npm run android
npm run web
npm run typecheck
```

## How TV commands are sent

UI actions route through:
- `./src/services/wifiRemote.ts`

Commands are sent as HTTP POST to:
- `http://<host>:<port>/remote/command`

This keeps UI and transport separated so brand-specific adapters can be added later without changing screen code.

## Discovery notes

`Scan` currently probes common local ranges:
- `192.168.1.x`
- `192.168.0.x`
- `10.0.0.x`

It fingerprints common endpoints (Roku, Samsung, Chromecast-style, and a generic bridge endpoint).  
If your network uses a different subnet or your TV does not expose those endpoints, use `Advanced` mode.

## iOS local network permission

The app includes `NSLocalNetworkUsageDescription` and requires local network permission for discovery/control on iOS.

## Current scope

- UI and local profile management are production-ready for demo/prototype use.
- Brand-specific direct-control implementations (Samsung/LG/etc auth/protocol details) are not fully implemented yet; the app is designed for plugging those into the command layer.
