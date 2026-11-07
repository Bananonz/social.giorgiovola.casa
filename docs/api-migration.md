# API v1 migration

Goal: every feature of the app is reachable through a documented, versioned JSON API under
`/api/v1/*`, usable with a bearer token and no cookies. The web UI is a client of that API.

## Audit (before the migration)

### Page loads and form actions

| route                         | load                                                     | actions                                                 | logic / DB in the route file                      |
| ----------------------------- | -------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------- |
| `+layout.server.ts`           | user, role, mute, unread counts, account switcher, motd  | –                                                       | inbox count query                                 |
| `/`                           | feed (all / following + regiorgs), timeline pins         | `default`: infinite scroll (form post, `currentPage`)   | feed selection                                    |
| `/@[username]`                | profile, tab posts/replies, pinned post, follow stats, mutuals, moderation state | `default`: infinite scroll                | user query, moderation lookup                     |
| `/@[username]/[post]`         | post + streamed replies                                  | –                                                       | –                                                 |
| `/@[username]/followers`, `/following`, `/followers/known` | profile, counts, first page    | `default`: infinite scroll (`offset`)                   | in `follows.ts` (throws SvelteKit errors)         |
| `/hashtag/[tag]`              | posts, count                                             | `default`: infinite scroll                              | –                                                 |
| `/notifications`              | every notification                                       | `default`: mark one read                                | inbox query + update                              |
| `/search`                     | users + hashtags (20)                                    | –                                                       | –                                                 |
| `/login`                      | –                                                        | `default`: password login (rate limited)                | all of it                                         |
| `/register`                   | registration open?                                       | `default`: register                                     | all of it                                         |
| `/logout`                     | –                                                        | `current`, `all`                                        | –                                                 |
| `/accounts`                   | identity members                                         | `switch`, `create`, `delete`, `share`, `unshare`, `leave` | all of it                                       |
| `/settings`                   | bots, passkeys, rpID, user handle                        | `createBot`, `regenerateToken`, `editBot`, `deleteBot`, `renamePasskey`, `deletePasskey` | all of it      |
| `/admin`                      | account list with filters, motd                          | `motd`, `ban`, `unban`, `mute`, `unmute`, `role`, `password` | list queries, password reset                 |
| `/messages`                   | conversations, groups, muted peers                       | –                                                       | –                                                 |
| `/messages/[username]`        | peer, thread, block, muted                               | –                                                       | –                                                 |
| `/messages/groups/[id]`, `/settings` | group, thread, muted                              | –                                                       | –                                                 |
| `/developers`                 | limits                                                   | –                                                       | –                                                 |

Callers of the actions: `Posts.svelte` and `FollowList.svelte` (infinite scroll with `deserialize`),
`AccountSwitcher.svelte` (`/accounts?/switch`), `ModerationControls.svelte` (`/admin?/…`),
`@[username]/+page.svelte` (`/logout?/current`) and the pages themselves.

### Internal `/api/*` routes (cookie only, many with plain-text errors)

`groups/**`, `messages/**`, `notifications/**`, `passkeys/**`, `posts/**` (create, delete, like,
regiorg, pin, timeline-pin, vote, seen, replies, likes, regiorgs, quotes), `push`, `search`,
`stream`, `typing`, `uploads/**`, `user` (profile edit), `users/[username]/card`,
`users/[username]/follow`, `users/search`.

Callers: `Post.svelte`, `PostComposer.svelte`, `PollCard.svelte`, `Likes.svelte`, `Chat.svelte`,
`ShareDialog.svelte`, `ProfileCard.svelte`, `FollowList.svelte`, `MentionInput.svelte`,
`UserPicker.svelte`, `Search.svelte`, `attachment.svelte.ts`, `mentions.ts`, `profileCard.svelte.ts`,
`push.ts`, `realtime.ts`, `typing.svelte.ts`, and the messages, settings, login, notifications and
profile pages. The service worker ignores `/api/*`.

### Bot API (`/api/bot/*`)

Bearer `sgc_…` tokens, JSON, `{ "error" }` everywhere, documented in `/api.txt`, `README.md` and
`src/lib/botDocs.ts`. Kept unchanged.

## Design

- **One API under `/api/v1/*`**: JSON in and out, `{ "error": "message" }` with a 4xx/5xx status
  on every failure (handlers run inside `v1()` from `src/lib/server/api.ts`, which turns thrown `ApiError`s and crashes into that shape; unknown routes under `/api/v1` get it from `hooks.server.ts`).
- **Pagination**: every list answers `{ "items": [...], "next_cursor": string | null }` and takes
  `?limit=` and `?cursor=`. Cursors are opaque strings (internally an offset for ranked lists such
  as timelines, a message id for chat threads). `next_cursor` is null on the last page.
- **One auth helper** (`src/lib/server/auth.ts`, `authenticate(event)`), called once per request
  from `hooks.server.ts`, fills `locals` with the same shape for:
  - `Authorization: Bearer sgu_…`: a human token (login token or personal access token),
  - `Authorization: Bearer sgc_…`: a bot token (the bot acts as its own profile; account-only
    endpoints answer 403),
  - the session cookie, only when the request carries no foreign `Origin`.
- **Human tokens** live in the existing `sessions` table: new columns `id` (public id), `kind`
  (`cookie` | `token` | `personal`), `name`, `user_agent`, `expires_at` and `last_used_at`. For token
  rows the primary key holds the sha256 of the bearer token, never the token itself. Reusing the
  table keeps identity switching (`acting_id`), sign-out on ban / password reset and push
  subscriptions (which reference `sessions.token`) working for tokens with no extra code.
  Cookie sessions keep their (unhashed) uuid so nobody is signed out by the migration.
- **CSRF / CORS**: SvelteKit's origin check rejects cross-site mutating requests that have no
  Content-Type or a form Content-Type. Non-browser clients therefore send `Content-Type:
  application/json` on writes and upload images as the raw request body. JSON requests skip
  that check, so cookie authentication is additionally ignored whenever a request carries an
  `Origin` other than our own. `/api/v1/*` answers CORS with `Access-Control-Allow-Origin: *`
  and never `Allow-Credentials`, so browsers never send or expose cookies cross-origin; bearer
  tokens work from any origin.
- **Thin endpoints**: authenticate (locals), validate (`validation.ts`), rate limit, call a service
  in `src/lib/server/`, return JSON. Helpers in `src/lib/server/api.ts`.
- **Web UI**: `+page.server.ts` / `+layout.server.ts` only call the API with `event.fetch` (helper
  `src/lib/apiLoad.ts`), plus redirects and 404s. Components call the API with `fetch` (helper
  `src/lib/api.ts`). Infinite scroll uses `next_cursor`.

### Deviations from the brief

- Login / register / logout no longer work without JavaScript: the form actions are gone and the
  pages call the API. Progressive enhancement would have needed form actions that proxy the API,
  which the API-first rule forbids.
- `/api/bot/*` stays as it is rather than becoming an alias: its list semantics (`after`, oldest
  first) differ from v1 cursors, and keeping the files untouched is the safest way to not break
  existing bots. v1 also accepts bot tokens.
- Profile tabs: only `posts` and `replies` exist in the app, so only those are exposed (no media or
  likes tab).
- Users cannot mute other users in the app (only conversations); muting is exposed on
  conversations and groups, and account mutes on the admin endpoints.
- Post editing did not exist (`edited_at` was never written). `PATCH /api/v1/posts/:id` is new
  (author only, text only); the web UI has no edit button yet.

## Endpoints

See `/api.txt` for the full reference. Summary (all under `/api/v1`):

| group         | endpoints |
| ------------- | --------- |
| instance      | `GET /instance` |
| auth          | `POST /auth/login`, `POST /auth/register`, `POST /auth/logout`, `POST /auth/passkeys/options`, `POST /auth/passkeys/login`, `GET /auth/accounts`, `POST /auth/switch`, `GET /auth/sessions`, `DELETE /auth/sessions/:id`, `POST /auth/tokens` |
| me            | `GET /me`, `PATCH /me`, `PUT/DELETE /me/avatar`, `PUT /me/password`, `GET /me/following`, `GET /me/passkeys`, `POST /me/passkeys/options`, `POST /me/passkeys`, `PATCH/DELETE /me/passkeys/:id`, `GET/POST /me/identities`, `DELETE /me/identities/:username`, `POST /me/identities/:username/members`, `DELETE /me/identities/:username/members/:member`, `POST /me/identities/:username/leave`, `GET/POST /me/bots`, `PATCH/DELETE /me/bots/:username`, `PUT/DELETE /me/bots/:username/avatar`, `POST /me/bots/:username/token` |
| push          | `GET/POST/DELETE /push` (also still at `/api/push`) |
| timeline      | `GET /timeline?feed=all|following`, `GET /timeline/pinned` |
| posts         | `POST /posts`, `GET/PATCH/DELETE /posts/:id`, `GET /posts/:id/replies`, `GET /posts/:id/likes`, `GET /posts/:id/regiorgs`, `GET /posts/:id/quotes`, `PUT/DELETE /posts/:id/like`, `PUT/DELETE /posts/:id/regiorg`, `PUT /posts/:id/vote`, `PUT/DELETE /posts/:id/pin`, `PUT/DELETE /posts/:id/timeline-pin`, `POST /posts/:id/seen` |
| users         | `GET /users/:username`, `GET /users/:username/card`, `GET /users/:username/posts?tab=posts|replies`, `GET /users/:username/pinned`, `GET /users/:username/followers`, `GET /users/:username/following`, `GET /users/:username/followers/known`, `PUT/DELETE /users/:username/follow`, `PUT/DELETE /users/:username/block` |
| search        | `GET /search`, `GET /search/users`, `GET /hashtags/:tag`, `GET /hashtags/:tag/posts` |
| notifications | `GET /notifications`, `GET /notifications/unread`, `POST /notifications/read`, `POST /notifications/:id/read` |
| conversations | `GET /conversations`, `GET /conversations/recent`, `GET /conversations/:username`, `GET/POST /conversations/:username/messages`, `DELETE /conversations/:username/messages/:id`, `PUT/DELETE /conversations/:username/messages/:id/reaction`, `POST /conversations/:username/read`, `PUT/DELETE /conversations/:username/mute`, `POST /conversations/:username/typing` |
| groups        | `POST /groups`, `GET/PATCH /groups/:id`, `GET/POST /groups/:id/messages`, `DELETE /groups/:id/messages/:messageId`, `PUT/DELETE /groups/:id/messages/:messageId/reaction`, `POST /groups/:id/read`, `PUT/DELETE /groups/:id/mute`, `POST /groups/:id/members`, `DELETE /groups/:id/members/:username`, `POST /groups/:id/leave`, `POST /groups/:id/typing` |
| uploads       | `POST /uploads`, `DELETE /uploads/:id` |
| admin         | `GET /admin/users`, `GET/PUT /admin/motd`, `PUT/DELETE /admin/users/:username/ban`, `PUT/DELETE /admin/users/:username/mute`, `PUT /admin/users/:username/role`, `PUT /admin/users/:username/password` |
| realtime      | `GET /stream`, `GET /stream/bot` |
