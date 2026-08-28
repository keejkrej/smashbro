# SMASHBRO

A smash-style 2-player platform fighter in the browser. Built with Next.js, [vgpu](https://vgpu.sh) (Vercel’s WebGPU library), and Vercel Functions WebSockets.

Create a room, copy the link, send it to a friend. First to three stocks wins.

## Play

1. Open the site.
2. Click **Create a room**.
3. Send `/r/YOURCODE` to a friend.
4. The match starts when they join.

Same-keyboard and training-dummy modes live on the home screen if you want to try the game without a second browser.

| Action | Player 1 | Player 2 (local) |
| --- | --- | --- |
| Move | A / D | ← / → |
| Jump / double jump | W or Space | ↑ |
| Fast fall | S | ↓ |
| Attack | J | `.` |
| Special (projectile) | K | `/` |

Chrome, Edge, or Safari with WebGPU is required.

## Stack

- **Next.js** App Router, hosted on Vercel
- **vgpu** for the arena: a dusk sky shader, lit capsules/boxes, hit sparks, and a composite pass
- **WebSockets on Vercel Functions** (`experimental_upgradeWebSocket`) to join a 2-player room
- **Upstash Redis** from the [Vercel Marketplace](https://vercel.com/docs/redis) so two friends who land on different function instances still share a room
- `@vercel/analytics` and `@vercel/speed-insights`

Without Redis the app still works on a single instance (`next dev`, one Fluid instance). Production 1v1 across regions needs `REDIS_URL`.

## Local

```bash
pnpm install
pnpm dev
```

`next dev` does not upgrade WebSockets. The client falls back to SSE + POST on the same room APIs, which is enough for two tabs on one machine.

For the production WebSocket path locally:

```bash
pnpm dlx vercel dev
```

## Deploy on Vercel

```bash
pnpm dlx vercel
```

Then add Redis:

1. Vercel dashboard → Marketplace → **Upstash Redis** (or any Redis integration that injects `REDIS_URL`).
2. `vercel env pull .env.local` if you want the same credentials locally.
3. Redeploy.

WebSockets need [Fluid Compute](https://vercel.com/docs/fluid-compute), which is the default for new Vercel projects.

## How a match is synced

The room creator is the host. They run the 60 Hz simulation. The guest sends inputs; the host sends compact snapshots. The server only assigns slots and relays packets.
