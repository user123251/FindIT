# FindIt – University Lost & Found

A working full-stack site. One Node.js server, a SQLite database and no npm packages to install.

## Run it
Requires **Node.js 22.13 or newer**.

```
node server.js          # or: npm start
```
Open http://localhost:3000. Data is stored in `data/` (database + uploaded photos). Back up that folder.

## What it does
- Students create an account, post lost or found items (with photo), and search/filter the board.
- Anyone signed in can message the poster. Replies go to the poster's dashboard, so contact details are never public.
- Posters mark items resolved or delete them. Passwords are hashed with scrypt, sessions use HttpOnly cookies, and the API has CSRF checks, input validation and rate limits.

## Configure (environment variables)
| Variable | Purpose |
|---|---|
| `PORT` | Port to listen on (default 3000) |
| `ALLOWED_EMAIL_DOMAIN` | Only allow sign-ups from this domain, e.g. `university.edu` |
| `NODE_ENV=production` | Marks cookies `Secure`. Use when served over HTTPS |

Categories and campus locations are the `CATEGORIES` and `LOCATIONS` lists at the top of `server.js`.

## Deploy
Any host that runs Node 22.13+ and has a persistent disk works (a campus VM, Railway, Render with a disk, a VPS). Put it behind HTTPS (Caddy or nginx), set `NODE_ENV=production`, and set `ALLOWED_EMAIL_DOMAIN`.

## Structure
```
findit/
├── server.js        API, auth, database, static file server
├── package.json
├── data/            created on first run (findit.db, uploads/)
└── public/          index, login, dashboard, about + css/ and js/
```
