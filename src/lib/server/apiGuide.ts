import { MAX_BOTS } from './bots.js';
import { MAX_IDENTITIES, MAX_MEMBERS } from './accounts.js';
import { MAX_PASSKEYS } from './passkeys.js';
import { MAX_PERSONAL_TOKENS, SESSION_DAYS, TOKEN_DAYS } from './session.js';
import { LIMITS } from './validation.js';

/**
 * Part 1 of /api.txt: the whole /api/v1 API, written for an LLM (or a person) building a client
 * from scratch. Every v1 endpoint belongs here, in the same change that adds or changes it.
 */
export const v1Guide = (origin: string) => `# API guide (v1)

This is the HTTP API of the social network at ${origin}. Everything the website can do is
available here, so you can build any client on it: a mobile app, a CLI, another web UI, a
script or an AI agent. The official website is itself a client of this API.

This file has two parts:
  Part 1 (this one): the v1 API, under ${origin}/api/v1, for people's accounts, apps and bots.
  Part 2: the older bot API, under ${origin}/api/bot, kept unchanged for existing bots.

Read all of Part 1 before making requests.

## Basics

- Base URL: ${origin}/api/v1
- Bodies are JSON (\`Content-Type: application/json\`), except image uploads, which send the
  raw image bytes with an image Content-Type (see "Uploads").
- IMPORTANT: send a Content-Type header on EVERY POST, PUT, PATCH and DELETE, even when there
  is no body (use \`Content-Type: application/json\`; an empty body counts as \`{}\`). The server
  refuses writes without a Content-Type, and form-encoded or multipart writes from non-browser
  clients, with a plain-text 403 "Cross-site … form submissions are forbidden". This is its
  protection against cross-site requests and can't be turned off.
- Responses are JSON. Dates are ISO 8601 strings in UTC. Ids are positive integers.
  Usernames are 1-${LIMITS.username} characters: a-z, 0-9 and _ (paths accept a leading @ and
  any case).
- 204 No Content means success with no body.
- The API is versioned: within v1 changes are only additive (new endpoints, new fields).
  Ignore fields you don't know. A breaking change would come as /api/v2.

### Errors

Every error is JSON with a 4xx or 5xx status:

  { "error": "A human readable message" }

  400 bad input (the message says what)      401 not signed in, or a bad or expired token
  403 not allowed (muted, banned, not yours, staff only, bots can't do this)
  404 not found (also for things you may not see) 405 wrong method   409 conflict
  410 an uploaded image expired: upload it again   413 too big   429 rate limited
  500 server error

Some errors add fields; they are listed with their endpoint. The only non-JSON errors are
the plain-text 403 described in Basics, which comes before the API is reached.

### Pagination

Every list answers the same shape:

  { "items": [ ... ], "next_cursor": "40" | null }

Pass \`?limit=\` (default 20 unless stated, maximum 100 unless stated) and, for the next
page, \`?cursor=<next_cursor>\` with the same other parameters. \`next_cursor\` is null on the
last page. Cursors are opaque strings: don't build or change them. Lists of posts, people
and notifications are newest first; chat threads are oldest first and their cursor moves
to OLDER messages (see "Direct messages").

### CORS

Every /api/v1 response has \`Access-Control-Allow-Origin: *\`, and preflight (OPTIONS)
requests are answered, so a web app on any origin can call the API with a bearer token.
Cookies are never accepted from other origins.

## Authentication

Send a token in every request:

  Authorization: Bearer <token>

Three kinds of token exist:
  sgu_…  a person's token: from POST /auth/login (or /auth/register, or the passkey login)
         or a personal access token made in the website's settings or with POST /auth/tokens.
  sgc_…  a bot token (see Part 2 for what bots are). Bots can use v1 too: they act as their
         own profile. Account endpoints (sessions, tokens, passkeys, password, identities,
         bots, admin, push) answer 403 for bots. Bots keep the bot API's limits in v1: they
         can't create, rename or add people to groups, remove others from one, upload
         images or attach them to posts and messages (403), post at most 20 a minute and
         send at most 20 messages a minute (these limits are shared with the bot API, not
         added to it), and get 10 profile edits an hour (name, username, bio, website,
         picture); 429 beyond that.
Without a token you are anonymous: public reads work (posts, profiles, timelines), the rest
answers 401. The website uses a session cookie instead; cookies only work on the website's
own origin and never from other sites.

Only a hash of each token is stored. Tokens are shown once: keep them secret, like a
password. A login token lasts ${TOKEN_DAYS} days, then requests answer 401 and you sign in
again. Personal access tokens last what was chosen (or never expire). Any token stops
working when it is revoked (POST /auth/logout, DELETE /auth/sessions/:id), when the
account's password changes (every session but the one that changed it), when an admin
resets the password, or when the account is banned. An event stream (GET /stream) opened
with it is closed at the same moment.

### Profiles and identities

A token belongs to an ACCOUNT (a person with an email and a password). An account can own
identities: extra profiles with their own name, posts, follows, messages and notifications,
but no email or password (at most ${MAX_IDENTITIES} per account). An identity can be shared
with up to ${MAX_MEMBERS} other accounts, which can then act as it too. A token acts as ONE
profile at a time: the account, or one of its identities. Everything you do (post, like,
message, read notifications) is done as that profile. Switch with POST /auth/switch;
GET /me says which profile is in use (\`user\`) and the account behind it (\`account\`).
Moderation (bans, mutes, roles) belongs to the account, whatever profile is in use.

### Muted and banned accounts

A muted account can still read everything, but can't post, reply, quote, regiorgio (repost),
edit posts, upload images or send messages: those answer 403 with the reason. GET /me has
\`muted\` and \`mute_reason\`. A banned account is signed out everywhere and can't sign in.

## Objects

User (in lists, posts and messages): { "username", "name", "avatar" }
  "avatar" is a path on ${origin} (prefix it with ${origin}) or null; null means "show the
  generated avatar", which is ${origin}/avatar/<username>.svg (or .png).

Post:
  {
    "id": 123,
    "user": { "id", "username", "name", "avatar", "bot": false, "created_at" },
    "content": "text, may contain @mentions, #hashtags and links",
    "images": ["/uploads/….webp"],      // paths on ${origin}, at most ${LIMITS.postImages}
    "created_at": "…", "edited_at": "…" | null,
    "likes": 3, "liked": true,           // liked, regiorged: by you (only when signed in)
    "regiorgs": 1, "regiorged": false,   // a regiorg ("regiorgio") is a repost
    "quotes": 0,                          // posts quoting this one
    "quote": <QuotedPost> | { "deleted": true } | null,   // this post quotes another one
    "linked_post": <QuotedPost> | null,   // first post of ${origin} linked in the text
    "poll": <Poll> | null,
    "replies_count": 2,
    "reply_to": { "id": 120, "username": "…", "likes": 4 } | null,
    "pinned": false,                      // pinned to its author's profile
    "timeline_pinned": false,             // pinned by staff above the home timeline
    "regiorged_by": { "username", "name", "others": 2 } | null
                                          // only in timelines: whose regiorg put it there
  }
  A reply "ratios" its parent when it has more likes than the parent (and at least 3).

QuotedPost: { "id", "user": User, "content", "images", "created_at", "is_quote" }

Poll:
  { "options": ["Tea", "Coffee"], "votes": [3, 5], "ends_at": "…", "closed": false,
    "voted": 1 | null }                   // voted: index of your choice, null if none

Profile (GET /users/:username):
  { "username", "name", "avatar", "bot", "bio", "website", "created_at",
    "followers": 10, "following": 4,
    "followed": true,       // you follow them
    "followsYou": false,    // they follow you
    "self": false,          // it is the profile you are using
    "followedBy": { "users": [User, … up to 3], "total": 7 },
                            // profiles you follow that follow them ("followers you know")
    "pinned_post_id": 99 | null,
    "blocked": false,       // you blocked them (no direct messages either way)
    "blocks_you": false,    // they blocked you
    "moderation": null | { "banned", "muted", "ban_reason", "mute_reason", "identity" }
                            // only for staff allowed to act on this account
  }
  Relationship fields are false/empty when anonymous.

FollowEntry (followers / following lists):
  { "username", "name", "avatar", "bio", "followed", "followsYou", "self" }

Notification:
  { "id", "type", "sender": { "id", "username", "name", "avatar" },
    "post": { "id", "content" } | null, "created_at", "read_at": "…" | null }
  Types: "like", "reply", "mention", "quote", "regiorg", "follow" (post is null),
  "ratio" (the sender's reply to your post ratioed it), "ratioed_by_you" (your reply
  ratioed the sender's post). For like, regiorg and ratioed_by_you the post is YOURS;
  for the others it is the sender's.

Me (GET /me):
  { "user": { "id", "username", "name", "avatar", "bio", "website", "email" (null for
              identities and bots), "bot", "identity", "created_at" },
    "account": { "id", "username" } | null,   // null for bots
    "role": "user" | "mod" | "admin", "muted", "mute_reason",
    "unread": { "notifications": 2, "messages": 5 },
    "auth": "token" | "bot" | "cookie" }

Message (direct message):
  { "id", "sender": "alice", "recipient": "bob",   // usernames
    "content", "images": ["/uploads/…"], "created_at",
    "edited_at": null | when the sender last changed the text,
    "reply_to": { "id", "sender": { "username", "name" }, "content" (cut to 200),
                  "images": 2 } | null,
    "reactions": [ { "emoji", "username", "name", "avatar" } ],
    "linked_post": <QuotedPost> | null }

GroupMessage (message or event of a group chat):
  { "id", "group_id", "kind": "message" | "created" | "added" | "removed" | "left" |
    "renamed" | "owner", "sender": User, "target": User | null, "content", "images",
    "created_at", "edited_at", "reply_to", "reactions", "linked_post" }
  Anything but "message" is an event line ("Alice added Bob"): never unread, can't be
  replied or reacted to. "target" is who was added or removed; for "created" and
  "renamed" the content is the group's name.

Group: { "id", "name", "owner": "alice" | null, "members": [User], "muted": false }
  Members longest standing first. Any member can rename it and add people; only the owner
  removes others. When the owner leaves the longest standing member takes over; the last
  member to leave deletes the group.

Conversation (in GET /conversations):
  direct: { "peer": User, "preview", "mine" (you sent the last message), "created_at",
            "unread": 2, "muted": false }
  group:  { "group": { "id", "name", "members": [first 3 others], "size" }, "preview",
            "event", "sender" (display name) | null, "mine", "created_at", "unread",
            "muted" }

## Endpoints

Signed in means any token (or the website's cookie). "Account" means a person's token (not
a bot). Rate limits are per profile per minute unless stated.

### Instance

GET /instance                                                  public
  { "api_version": 1, "version": "<build>", "motd": "message of the day",
    "registration_open": true, "limits": { "postContent": ${LIMITS.postContent},
    "messageContent": ${LIMITS.messageContent}, "name": ${LIMITS.name}, "bio": ${LIMITS.bio},
    "username": ${LIMITS.username}, "postImages": ${LIMITS.postImages}, "messageImages": ${LIMITS.messageImages}, "imageBytes": ${LIMITS.imageBytes},
    "pollOptionsMin": ${LIMITS.pollOptionsMin}, "pollOptionsMax": ${LIMITS.pollOptionsMax},
    "pollOption": ${LIMITS.pollOption}, "pollMinutesMin": ${LIMITS.pollMinutesMin},
    "pollMinutesMax": ${LIMITS.pollMinutesMax}, "pollMinutesDefault": ${LIMITS.pollMinutesDefault},
    "groupName": ${LIMITS.groupName}, "groupMembers": ${LIMITS.groupMembers}, … } }

### Signing in

POST /auth/login                                               public
  Body: { "username": "alice" (or the email), "password": "…",
          "client_name": "My app" (optional, shown in the session list, max 64) }
  200: { "session": "token", "token": "sgu_…", "token_type": "Bearer",
         "expires_at": "…", "me": <Me> }
  Errors: 400 missing fields, 401 "Wrong username or password." (the same for unknown
  users), 403 banned (with the reason), 429 after 10 failures for one account or 30 for
  one IP in 15 minutes, or after 30 successful sign-ins (login, passkey or register) of
  one account in an hour: reuse your token instead of signing in again.
  (The website sends "session": "cookie" to get a cookie instead of a token.)

POST /auth/register                                            public
  Body: { "signup_password": "the instance's invite password", "email", "name",
          "username", "password" (${LIMITS.passwordMin}-${LIMITS.passwordMax} characters), "client_name"? }
  201: like /auth/login. 403 "Registration is closed." when GET /instance says
  registration_open is false, or a wrong signup password (rate limited per IP); 400 with
  every validation problem in one message ("Email already in use. Username already in use.").

POST /auth/passkeys/options                                    public
  Starts a passkey (WebAuthn) sign-in. 200: the WebAuthn PublicKeyCredentialRequestOptions
  JSON plus "challenge_id". Pass the options to the platform's WebAuthn API (in a browser:
  @simplewebauthn/browser startAuthentication). Passkeys are bound to the hostname of
  ${origin}, so only clients allowed to use passkeys for that domain can do this.
POST /auth/passkeys/login                                      public
  Body: { "challenge_id": "…", "response": <the assertion JSON>, "client_name"? }
  200: like /auth/login. 400 when it can't be verified or the challenge expired (5
  minutes, single use); 400 with "unknown": true when the passkey was deleted here.

POST /auth/logout                                              signed in
  Revokes the token used. 204. (Website: { "all": true } signs out every account.)

GET /auth/sessions                                             account
  Every place the account is signed in: { "items": [ { "id", "kind": "cookie" (browser) |
  "token" (an app's login) | "personal" (personal access token), "name", "user_agent",
  "created_at", "expires_at" | null, "last_used_at" | null, "current": true } ] }
DELETE /auth/sessions/:id                                      account
  Revokes one: it is signed out right away. 204, 404 when it isn't yours.
POST /auth/tokens                                              account
  Creates a personal access token: { "name": "my script" (1-64), "current_password"
  (required: the account's password, asked again so a stolen token can't mint lasting
  access), "expires_in_days": 1-3650 | null (never; default 90) }. At most
  ${MAX_PERSONAL_TOKENS} per account, 10 a minute. 201: { "id", "name", "token": "sgu_…",
  "token_type": "Bearer", "expires_at" }. The token is never shown again. 400 when
  current_password is missing, 403 when it is wrong (10 tries per 15 minutes).

GET /auth/accounts                                             account
  The account (website: every account signed in on the browser; a token: its own account)
  with its identities:
  { "items": [ { "id", "username", "name", "avatar", "unread", "unreadMessages",
  "active", "sharedBy": null, "identities": [ same fields, "sharedBy": "owner" | null ] } ] }
POST /auth/switch                                              account
  { "username": "the account, or one of its identities, or one shared with it" }
  Every later request with this token acts as that profile, and its open /stream is closed
  (reconnect). 200: <Me>. 403 when you can't
  use that profile, 404 unknown username. 30 switches a minute.

### You

GET /me                                                        signed in
  <Me>.
PATCH /me                                                      signed in
  Edits the profile in use. Any of: "name" (1-${LIMITS.name}), "username" (must be free;
  the profile URL changes), "bio" (up to ${LIMITS.bio}, "" clears), "website" (http(s);
  https:// is added; "" clears), "email" (accounts only; a different email also needs
  "current_password", sending the current one unchanged doesn't). Fields left out are
  kept. 200: <Me>. 400 when current_password is missing for a new email, 403 when it is
  wrong (10 tries per 15 minutes). 30 edits an hour per profile (bots: 10).
PUT /me/avatar                                                 signed in
  The raw image as the body (PNG, JPEG, GIF, WebP, AVIF, BMP, ICO or SVG, at most 10 MB)
  with its Content-Type, e.g. image/png. Cropped square, re-encoded. 200: { "id", "name",
  "username", "avatar", "bio", "website" }. 10 changes an hour.
DELETE /me/avatar                                              signed in
  Back to the generated avatar. 200: same as PUT.
PUT /me/password                                               account
  { "current_password", "password" }. Signs out every other session and token. 204.
  403 when the current password is wrong (10 tries per 15 minutes).
GET /me/following                                              signed in
  { "items": ["alice", "bob"] }: usernames of everyone the profile follows.

GET /me/passkeys                                               account
  { "items": [ { "id", "name", "backed_up", "created_at", "last_used_at" } ],
    "max": ${MAX_PASSKEYS}, "rp_id", "user_handle" }
POST /me/passkeys/options                                      account
  { "current_password" }. Starts registering a passkey: WebAuthn creation options plus
  "challenge_id". 400 when current_password is missing, 403 when it is wrong (10 tries per
  15 minutes).
POST /me/passkeys                                              account
  { "challenge_id", "name": "My phone" (optional, max 64), "response": <attestation JSON> }
  201: { "id", "name" }.
PATCH /me/passkeys/:id   { "name" } → { "id", "name" }         account
DELETE /me/passkeys/:id  → 204 (the password always keeps working)   account

GET /me/identities                                             account
  { "max_identities", "max_members",
    "owned": [ { "username", "name", "avatar", "created_at", "members": [User] } ],
    "shared_with_me": [ { "username", "name", "avatar", "created_at", "owner" } ] }
POST /me/identities   { "name", "username" } → 201 { "id", "name", "username", "avatar" }
  Then POST /auth/switch to use it.
DELETE /me/identities/:username                                account (owner)
  Deletes it with its posts. 204. Can't be undone.
POST /me/identities/:username/members   { "username": "an account" }   account (owner)
  Shares it. 201: User. 20 attempts a minute.
DELETE /me/identities/:username/members/:member                account (owner) → 204
POST /me/identities/:username/leave                            account → 204
  Gives back an identity someone shared with you.

GET /me/bots                                                   account
  { "items": [ { "id", "name", "username", "avatar", "bio", "website", "created_at",
    "last_used_at" } ], "max": ${MAX_BOTS} }
POST /me/bots   { "name", "username" } → 201 { "username", "token": "sgc_…" } (shown once)
PATCH /me/bots/:username   any of name, username, bio, website → the bot's profile
PUT /me/bots/:username/avatar  (raw image body) / DELETE /me/bots/:username/avatar
POST /me/bots/:username/token  → { "username", "token" }: a new token, the old one stops
DELETE /me/bots/:username      → 204, deletes the bot and its posts
  All bot management: 10 actions a minute.

### Push notifications (web push)

GET /push → { "publicKey": "VAPID key" }                       account
POST /push   { "endpoint", "keys": { "p256dh", "auth" } }  (PushSubscription.toJSON())
  The subscription belongs to the token (or browser session) used: revoking it stops the
  pushes. Only endpoints of the real push services are accepted. 204; 400 invalid.
DELETE /push   { "endpoint" } → 204
  (Also available at /api/push for older website versions.)

### Timeline and posts

GET /timeline?feed=all|following                               public / signed in
  "all" (default): every top-level post, newest first. "following" (signed in): posts and
  regiorgs by the profiles you follow and your own, each post once with "regiorged_by"
  when a regiorg put it there. Paginated. Posts pinned to the timeline are left out:
GET /timeline/pinned                                           public
  The posts staff pinned above the timeline (at most 3), as a page with next_cursor null.

POST /posts                                                    signed in, not muted
  { "content": "text (max ${LIMITS.postContent})",
    "uploads": ["id from POST /uploads", …]   (optional, at most ${LIMITS.postImages}),
    "reply_to": 120 | null,                     (a reply)
    "quote_of": 118 | null,                     (a quote regiorg; can't also reply)
    "poll": { "options": ["a", "b"] (${LIMITS.pollOptionsMin}-${LIMITS.pollOptionsMax}, distinct, max ${LIMITS.pollOption} chars),
              "duration_minutes": ${LIMITS.pollMinutesMin}-${LIMITS.pollMinutesMax} (default ${LIMITS.pollMinutesDefault}) } | null }
  Content may be empty when there are images; a poll needs text. 201: <Post>.
  410 when an upload expired: upload it again. 30 posts a minute.
GET /posts/:id                                                 public
PATCH /posts/:id   { "content" }                                author, not muted
  Edits the text (images and poll stay). Sets "edited_at", re-reads hashtags. 200: <Post>.
  400 when the text would be empty on a post without images, or on a poll (its question).
DELETE /posts/:id                                              author (or staff)
  Deletes it with its replies. 204.
GET /posts/:id/replies          replies, ratioing ones first then oldest first; limit up to 200 (default 50)
GET /posts/:id/likes            Users who liked, latest first; limit up to 200 (default 50)
GET /posts/:id/regiorgs         Users who regiorged, latest first; same limits
GET /posts/:id/quotes           { "id", "content", "username", "name", "avatar" } quotes; same limits
PUT /posts/:id/like / DELETE    signed in → { "liked", "likes" }   60 a minute, idempotent
PUT /posts/:id/regiorg / DELETE signed in (PUT not muted) → { "regiorged", "regiorgs" }  30 a minute
PUT /posts/:id/vote   { "option": index }  → { "voted", "votes": [..] }  30 a minute;
  changeable until the poll ends; 400 when it ended.
PUT /posts/:id/pin / DELETE     your own top-level post on your profile → { "pinned" }
PUT /posts/:id/timeline-pin / DELETE   staff only → { "pinned" }; 409 when 3 are pinned
POST /posts/:id/seen            marks your mention notification for it read → 204
  The counts in responses are absolute: set them, don't add to them.

### Users

GET /users/:username                  <Profile>                        public
GET /users/:username/card             the hover card: Profile without created_at,
                                      pinned_post_id, blocks and moderation
GET /users/:username/posts?tab=posts|replies   paginated Posts. "posts": its posts and
  regiorgs (with regiorged_by), the pinned post left out. "replies": its replies.
GET /users/:username/pinned           { "post": <Post> | null }
GET /users/:username/followers        paginated FollowEntry, newest follow first
GET /users/:username/following        paginated FollowEntry
GET /users/:username/followers/known  signed in: its followers that you follow too
PUT /users/:username/follow / DELETE  signed in → { "followers", "following", "followed" }
  30 a minute, idempotent.
PUT /users/:username/block / DELETE   signed in → { "blocked", "blocks_you" }
  Blocking stops direct messages both ways. 30 a minute.

### Search and hashtags

GET /search?q=&limit=                 signed in
  { "query", "users": [User], "hashtags": [ { "tag", "posts": 12 } ] }. limit per kind,
  default 5, at most 20. "#tea" searches only hashtags, "@al" only users; an empty q lists
  the trending hashtags of the last 7 days.
GET /search/users?q=&limit=           signed in
  Profiles whose username or name starts with q (for @mention pickers), the newest when q
  is empty. Default 6, at most 20. A page with next_cursor null.
GET /hashtags/:tag                    public → { "tag": "tea", "posts": 12 } (normalized)
GET /hashtags/:tag/posts              public, paginated Posts (replies included)

### Notifications

GET /notifications                    signed in, paginated (default 50, at most 200)
GET /notifications/unread             signed in → { "notifications": 2, "messages": 5 }
  (messages: unread direct and group messages, muted chats left out)
POST /notifications/read              marks all read → 204
POST /notifications/:id/read          marks one read → 204

### Direct messages

GET /conversations                    signed in → { "direct": [..], "groups": [..] }
GET /share-targets                    signed in → { "recent": [ { "kind": "user", "peer":
  User } | { "kind": "group", "group": {...} } ], "groups": [...] } (to share a post)
GET /conversations/:username          signed in → { "peer": User, "block": { "me": you
  blocked them, "peer": they blocked you }, "muted": false }
GET /conversations/:username/messages signed in
  30 messages, OLDEST FIRST: the latest ones. For older history pass
  ?cursor=<next_cursor>; next_cursor is null when there is nothing older. Nothing is
  marked read by reading.
POST /conversations/:username/messages   signed in, not muted
  { "content" (max ${LIMITS.messageContent}), "uploads": [ids] (max ${LIMITS.messageImages}), "reply_to": message id | null }
  201: <Message>. 403 when either side blocked the other. 20 messages a minute in all
  (direct and group), 5 a minute with images.
PATCH /conversations/:username/messages/:id   your own message, not muted
  { "content" (max ${LIMITS.messageContent}) } → <Message> with the new text and "edited_at" set.
  Only the text changes (images and reply_to stay); "" is accepted only when the message has
  images. Allowed for 60 minutes after sending: later → 403. 404 when it isn't yours or isn't in
  the conversation with :username; 403 when either side blocked the other. Sending the same
  text changes nothing. 30 edits a minute (direct and group). Both sides get message_edited.
DELETE /conversations/:username/messages/:id   your own message → 204 (for both sides); 404 when it
  isn't yours or isn't in the conversation with :username
PUT /conversations/:username/messages/:id/reaction   { "emoji": "👍" } → { "reactions" }
DELETE /conversations/:username/messages/:id/reaction → { "reactions" }
  One reaction per profile per message; a new one replaces it. 60 a minute.
POST /conversations/:username/read    marks what they sent you read → 204
PUT /conversations/:username/mute / DELETE   → { "muted" }: no push, not in the badge
POST /conversations/:username/typing  → 204: shows "typing…" to them for a few seconds;
  send every 3-4 seconds while the user types. 40 a minute.

### Group chats

GET /groups                           signed in → page of group conversations
POST /groups   { "name" (1-${LIMITS.groupName}), "members": ["alice", "bob"] }   not muted
  201: <Group>. Up to ${LIMITS.groupMembers} members with you. You can't add people who blocked
  you or whom you blocked.
GET /groups/:id                       member → <Group>; 404 when you aren't a member
PATCH /groups/:id   { "name" }        member, not muted → <Group>
GET /groups/:id/messages              member: like a direct conversation, GroupMessages
POST /groups/:id/messages             member, not muted: same body as direct → 201 <GroupMessage>
PATCH /groups/:id/messages/:messageId            your own message, not muted: like direct
  messages, { "content" } → <GroupMessage>, 60 minutes after sending at most. Events (kind
  other than "message") can't be edited (404). Members get group_message_edited.
DELETE /groups/:id/messages/:messageId           your own message → 204
PUT /groups/:id/messages/:messageId/reaction / DELETE   like direct messages
POST /groups/:id/read                 → 204
PUT /groups/:id/mute / DELETE         → { "muted" }
POST /groups/:id/members   { "usernames": ["carla"] }   member → <Group>
DELETE /groups/:id/members/:username  the owner removes someone, or anyone removes
  themself (leaves) → 204
POST /groups/:id/leave                → 204
POST /groups/:id/typing               → 204
  Managing groups (create, rename, add, remove): limited per minute.

### Uploads

POST /uploads                         signed in, not muted
  One image, as the raw request body with its Content-Type (image/png, image/jpeg, …),
  at most 10 MB. It is compressed right away and kept for you for a day: pass its id in
  "uploads" when posting or messaging. 201: { "id": "uuid" }. 30 a minute.
  (Browsers on the website send multipart with an "image" field instead.)
DELETE /uploads/:id                   an upload you no longer need → 204

### Moderation (staff)

Mods can ban and mute users; admins can also manage mods, reset passwords and set the
message of the day. Actions target the account behind a username (an identity or bot
leads to its owner). You can only act on accounts ranked below you. 60 actions a minute.

GET /admin/users?q=&filter=all|banned|muted|staff   staff, paginated (default 25)
  { "username", "name", "avatar", "role", "banned_at", "ban_reason", "muted_at",
    "mute_reason", "created_at", "identities": [ { "username", "name", "avatar", "bot",
    "members": ["usernames"] } ], "shared_with": [ { "username", "name", "avatar",
    "owner_username" } ], "self", "can_moderate", "can_manage" }
PUT /admin/users/:username/ban    { "reason"? (max 200) } → { "message" }   staff
DELETE /admin/users/:username/ban → { "message" }                            staff
PUT /admin/users/:username/mute   { "reason"? } / DELETE → { "message" }    staff
PUT /admin/users/:username/role   { "role": "mod" | "user" } → { "message" }   admin
PUT /admin/users/:username/password   { "password" } → { "message" }  admin; signs them out
GET /admin/motd → { "motd", "custom", "default", "max" }                     admin
PUT /admin/motd   { "motd": "one line" ("" resets) } → { "motd", "message" }   admin

### Realtime (server-sent events)

GET /stream                           public or signed in
  An event stream (text/event-stream). Send the token in the Authorization header (use an
  SSE client that supports headers; the browser's EventSource can't, which is why the
  website uses its cookie). Reconnect when it drops (the server sends "retry: 3000") and
  catch up with the normal endpoints. Lines starting with ":" are keep-alives. The stream
  ends when the token or session it was opened with is revoked; reconnecting then answers
  only public events, or 401 for the revoked bearer token.
  Everyone gets:
    post            <Post> (as an anonymous viewer: no liked/regiorged)
    post_edited     <Post>
    post_deleted    { "id" }
    counts          { "id", "likes"? , "replies_count"?, "regiorgs"?, "quotes"? } absolute
    regiorg         <Post> with "regiorged_by": { "username", "name" }
    poll            { "id": post id, "votes": [..] }
  Signed in, also (for the profile in use):
    notifications   { "count" }   unread notifications, sent on connect and on change
    messages_unread { "count" }   unread messages, sent on connect and on change
    message         <Message> sent or received
    message_deleted { "id" }
    message_edited  <Message> with its new text
    message_reactions        { "id", "reactions" }
    group_message            <GroupMessage> (events included)
    group_message_deleted    { "group_id", "id" }
    group_message_edited     <GroupMessage> with its new text
    group_message_reactions  { "group_id", "id", "reactions" }
    group_updated   { "id" }   renamed or members changed: GET /groups/:id again (404 =
                               you were removed)
    typing          { "group_id": id | null, "user": { "username", "name" } }
  The stream follows the profile in use when it opened: reconnect after POST /auth/switch.
  It is closed by the server when that happens, when the session is revoked, and when an
  identity it acts as stops being shared with the account.

GET /stream/bot                       bot tokens only
  The bot stream, same as /api/bot/stream (see Part 2): ready, mention, post, message,
  group_message.

## Example session (curl)

ORIGIN=${origin}
TOKEN=$(curl -s -X POST -H 'Content-Type: application/json' \\
  -d '{"username":"alice","password":"…","client_name":"curl"}' \\
  $ORIGIN/api/v1/auth/login | jq -r .token)
A="Authorization: Bearer $TOKEN"

curl -H "$A" $ORIGIN/api/v1/me
curl -H "$A" "$ORIGIN/api/v1/timeline?feed=following&limit=10"
NEXT=$(curl -s -H "$A" "$ORIGIN/api/v1/timeline?limit=10" | jq -r .next_cursor)
curl -H "$A" "$ORIGIN/api/v1/timeline?limit=10&cursor=$NEXT"

# post with an image: upload it first, then attach its id
ID=$(curl -s -X POST -H "$A" -H 'Content-Type: image/png' --data-binary @photo.png \\
  $ORIGIN/api/v1/uploads | jq -r .id)
curl -X POST -H "$A" -H 'Content-Type: application/json' \\
  -d "{\\"content\\":\\"hello #tea\\",\\"uploads\\":[\\"$ID\\"]}" $ORIGIN/api/v1/posts

curl -X POST -H "$A" -H 'Content-Type: application/json' \\
  -d '{"content":"agreed","reply_to":123}' $ORIGIN/api/v1/posts
curl -X PUT -H "$A" -H 'Content-Type: application/json' $ORIGIN/api/v1/posts/123/like
curl -X PUT -H "$A" -H 'Content-Type: application/json' $ORIGIN/api/v1/users/bob/follow
curl -H "$A" "$ORIGIN/api/v1/notifications?limit=20"
curl -X POST -H "$A" -H 'Content-Type: application/json' \\
  -d '{"content":"hi bob"}' $ORIGIN/api/v1/conversations/bob/messages
curl -H "$A" "$ORIGIN/api/v1/search?q=tea"
curl -N -H "$A" $ORIGIN/api/v1/stream
curl -X POST -H "$A" -H 'Content-Type: application/json' $ORIGIN/api/v1/auth/logout

Browser sessions last ${SESSION_DAYS} days; tokens as described in Authentication.
`;
