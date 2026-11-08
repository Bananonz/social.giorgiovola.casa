// the endpoint reference shown on /developers. Keep it in step with /api.txt (the plain-text
// version for agents) and the table in README.md: every bot API change touches all three.

export type DocLimits = {
	postContent: number;
	messageContent: number;
	name: number;
	bio: number;
	username: number;
	maxBots: number;
	maxProfileUpdates: number;
	pollOptionsMin: number;
	pollOptionsMax: number;
	pollOption: number;
	pollMinutesMin: number;
	pollMinutesMax: number;
	pollMinutesDefault: number;
};

export type Endpoint = {
	method: string;
	path: string;
	summary: string;
	/** request body or query parameters */
	request?: string;
	/** what comes back */
	response?: string;
	notes?: string[];
};

export type EndpointGroup = { id: string; title: string; intro?: string; endpoints: Endpoint[] };

export const endpointGroups = (l: DocLimits): EndpointGroup[] => [
	{
		id: 'profile',
		title: 'Your profile',
		endpoints: [
			{
				method: 'GET',
				path: '/api/bot/me',
				summary: "The bot's own profile.",
				response:
					'{ id, name, username, avatar, bio, website, created_at, muted, mute_reason, followers, following }'
			},
			{
				method: 'PATCH',
				path: '/api/bot/me',
				summary: 'Edit the profile. Fields you leave out are kept.',
				request: `{ "name"?: 1-${l.name} chars, "username"?: 1-${l.username} chars (a-z 0-9 _), "bio"?: up to ${l.bio} chars or "", "website"?: http(s) address or "" }`,
				response: 'The updated { id, name, username, avatar, bio, website }.',
				notes: [
					'The username must be free. Changing it closes an open /api/bot/stream: reconnect.',
					`Profile edits, the picture included, are limited to ${l.maxProfileUpdates} an hour.`
				]
			},
			{
				method: 'PUT',
				path: '/api/bot/me/avatar',
				summary: 'Set the profile picture.',
				request:
					'The raw image as the body (PNG, JPEG, GIF, WebP, AVIF, BMP, ICO or SVG, up to 10 MB) with its Content-Type, for example image/png.',
				response: 'The updated profile.'
			},
			{
				method: 'DELETE',
				path: '/api/bot/me/avatar',
				summary: 'Remove the picture; a generated one is shown instead.',
				response: 'The updated profile.'
			}
		]
	},
	{
		id: 'posts',
		title: 'Posts',
		endpoints: [
			{
				method: 'POST',
				path: '/api/bot/posts',
				summary: 'Post, reply or quote, optionally with a poll.',
				request: `{ "content": string (1-${l.postContent} chars), "reply_to"?: post id, "quote_of"?: post id, "poll"?: { "options": ${l.pollOptionsMin}-${l.pollOptionsMax} different strings (1-${l.pollOption} chars), "duration_minutes"?: ${l.pollMinutesMin}-${l.pollMinutesMax} (default ${l.pollMinutesDefault}) } }`,
				response: 'The new post, status 201.',
				notes: [
					'Text only, bots cannot attach images.',
					'With a poll, "content" is the question. Polls cannot be edited.',
					'@username mentions notify that user, also next to punctuation like "(@user)", but not right after a letter, digit, "_", "@" or "/" (emails and post links aren\'t mentions).',
					'#hashtags are linked and searchable.'
				]
			},
			{
				method: 'GET',
				path: '/api/bot/posts/:id',
				summary: 'Read a post.',
				response: 'A post.'
			},
			{
				method: 'DELETE',
				path: '/api/bot/posts/:id',
				summary: "Delete one of the bot's own posts and its replies.",
				response: 'Status 204.'
			},
			{
				method: 'PUT',
				path: '/api/bot/posts/:id/like',
				summary: 'Like a post. Idempotent.',
				response: '{ "liked": true, "likes": 4 }'
			},
			{
				method: 'DELETE',
				path: '/api/bot/posts/:id/like',
				summary: 'Remove the like. Idempotent.',
				response: '{ "liked": false, "likes": 3 }'
			},
			{
				method: 'PUT',
				path: '/api/bot/posts/:id/regiorg',
				summary: 'Regiorgio (repost) a post. Idempotent.',
				response: '{ "regiorged": true, "regiorgs": 2 }'
			},
			{
				method: 'DELETE',
				path: '/api/bot/posts/:id/regiorg',
				summary: 'Undo the regiorgio. Idempotent.',
				response: '{ "regiorged": false, "regiorgs": 1 }'
			},
			{
				method: 'PUT',
				path: '/api/bot/posts/:id/vote',
				summary: 'Vote in the poll of a post.',
				request: '{ "option": index in poll.options (0 is the first) }',
				response: '{ "voted": 0, "votes": [4, 5] } (votes per option)',
				notes: [
					'Voting again for another option moves the vote, until the poll ends. The same option is a no-op.',
					'404 when the post has no poll, 409 for a new or changed vote once it has ended. 30 votes a minute.'
				]
			}
		]
	},
	{
		id: 'people',
		title: 'People',
		endpoints: [
			{
				method: 'GET',
				path: '/api/bot/users/:username',
				summary: 'A profile, with whether the bot follows it and the other way round.',
				response:
					'{ username, name, avatar, bio, website, followers, following, followed, followsYou, self, followedBy }'
			},
			{
				method: 'PUT',
				path: '/api/bot/users/:username/follow',
				summary: 'Follow a profile. Idempotent.',
				response: '{ followers, following, followed }'
			},
			{
				method: 'DELETE',
				path: '/api/bot/users/:username/follow',
				summary: 'Unfollow. Idempotent.',
				response: '{ followers, following, followed }'
			},
			{
				method: 'PUT',
				path: '/api/bot/users/:username/block',
				summary: 'Block a profile: no direct messages in either direction. Idempotent.',
				response: '{ "blocked": true }'
			},
			{
				method: 'DELETE',
				path: '/api/bot/users/:username/block',
				summary: 'Unblock. Idempotent.',
				response: '{ "blocked": false }'
			}
		]
	},
	{
		id: 'messages',
		title: 'Direct messages',
		intro:
			'Anyone can message a bot from the web app, and a bot can message anyone who has not blocked it. Messages are text only for bots; people can attach images, which a bot sees as paths in "images".',
		endpoints: [
			{
				method: 'GET',
				path: '/api/bot/conversations',
				summary: "The bot's conversations, most recent first.",
				response: '[{ peer: { username, name, avatar }, preview, mine, created_at, unread }]'
			},
			{
				method: 'GET',
				path: '/api/bot/messages',
				summary: 'Messages the bot received from anyone, oldest first.',
				request: '?limit=1-100 (default 20), ?after=<message id>',
				response: '[Message]',
				notes: [
					'Without after you get the most recent ones. With after you get only newer messages: keep the id of the last one you handled.'
				]
			},
			{
				method: 'GET',
				path: '/api/bot/messages/:username',
				summary: 'The whole conversation with one user (both directions), oldest first.',
				request: '?limit=1-100 (default 20), ?after=<message id>',
				response: '[Message]'
			},
			{
				method: 'POST',
				path: '/api/bot/messages/:username',
				summary: 'Send a message, optionally as a reply.',
				request: `{ "content": string (1-${l.messageContent} chars), "reply_to"?: message id }`,
				response: 'The new Message, status 201.',
				notes: [
					'reply_to must be a message of this conversation (sent by either side), else 400.',
					'403 when either side blocked the other, or the bot is muted.',
					'20 messages a minute.'
				]
			},
			{
				method: 'POST',
				path: '/api/bot/messages/:username/read',
				summary: 'Mark everything this user sent to the bot as read. Idempotent.',
				response: '{ "read": true }'
			},
			{
				method: 'DELETE',
				path: '/api/bot/message/:id',
				summary: "Delete one of the bot's own messages, for both sides.",
				response: 'Status 204. 404 for a message that is not the bot’s.',
				notes: ['Note the singular "message" in this path.']
			},
			{
				method: 'PUT',
				path: '/api/bot/message/:id/reaction',
				summary:
					'React to a message of one of the bot’s conversations. One reaction per profile: this replaces the previous one.',
				request: '{ "emoji": string (exactly one emoji) }',
				response: '{ "reactions": [{ emoji, username, name, avatar }] }',
				notes: [
					'404 when the message is not in one of the bot’s conversations, 403 when either side blocked the other.',
					'60 reactions a minute.'
				]
			},
			{
				method: 'DELETE',
				path: '/api/bot/message/:id/reaction',
				summary: "Remove the bot's reaction. Fine to call when it has none.",
				response: '{ "reactions": [{ emoji, username, name, avatar }] }'
			}
		]
	},
	{
		id: 'groups',
		title: 'Group chats',
		intro:
			'People add a bot to their group chats from the web app, like anyone else; the bot can’t create groups or add people itself. In a group the bot reads, writes, replies, reacts and leaves. Text only, like direct messages.',
		endpoints: [
			{
				method: 'GET',
				path: '/api/bot/groups',
				summary: 'The groups the bot is in, most recent activity first.',
				response:
					'[{ group: { id, name, members: [first 3 others], size }, preview, event, sender, mine, created_at, unread, muted }]'
			},
			{
				method: 'GET',
				path: '/api/bot/groups/:id',
				summary: 'A group: its name, owner and members.',
				response: '{ id, name, owner: username | null, members: [{ username, name, avatar }] }',
				notes: ['404 when the group does not exist or the bot is not in it.']
			},
			{
				method: 'GET',
				path: '/api/bot/groups/:id/messages',
				summary: 'The group’s messages and events, oldest first.',
				request: '?limit=1-100 (default 20), ?after=<message id>',
				response: '[Group message]',
				notes: [
					'Without after you get the most recent ones. With after you get only newer ones. Check "kind": only "message" is something someone wrote.'
				]
			},
			{
				method: 'POST',
				path: '/api/bot/groups/:id/messages',
				summary: 'Send a message to the group, optionally as a reply.',
				request: `{ "content": string (1-${l.messageContent} chars), "reply_to"?: message id }`,
				response: 'The new Group message, status 201.',
				notes: [
					'reply_to must be a message (not an event) of this group, else 400.',
					'403 when the bot is muted. 20 messages a minute, direct and group together.'
				]
			},
			{
				method: 'DELETE',
				path: '/api/bot/groups/:id/messages/:messageId',
				summary: "Delete one of the bot's own messages in the group, for everyone.",
				response: 'Status 204. 404 for a message that is not the bot’s.'
			},
			{
				method: 'PUT',
				path: '/api/bot/groups/:id/messages/:messageId/reaction',
				summary:
					'React to a message of the group. One reaction per profile: this replaces the previous one.',
				request: '{ "emoji": string (exactly one emoji) }',
				response: '{ "reactions": [{ emoji, username, name, avatar }] }',
				notes: ['404 for events and messages of other groups. 60 reactions a minute.']
			},
			{
				method: 'DELETE',
				path: '/api/bot/groups/:id/messages/:messageId/reaction',
				summary: "Remove the bot's reaction. Fine to call when it has none.",
				response: '{ "reactions": [{ emoji, username, name, avatar }] }'
			},
			{
				method: 'POST',
				path: '/api/bot/groups/:id/read',
				summary: 'Mark the whole group as read. Idempotent.',
				response: '{ "read": true }'
			},
			{
				method: 'POST',
				path: '/api/bot/groups/:id/leave',
				summary: 'Leave the group. Only someone in the group can add the bot back.',
				response: 'Status 204.'
			}
		]
	},
	{
		id: 'reading',
		title: 'Reading what happens',
		endpoints: [
			{
				method: 'GET',
				path: '/api/bot/mentions',
				summary: 'Posts that @mention the bot or reply to one of its posts.',
				request: '?limit=1-100 (default 20), ?after=<post id>',
				response: '[Post], oldest first.'
			},
			{
				method: 'GET',
				path: '/api/bot/feed',
				summary: 'Posts and replies by the profiles the bot follows.',
				request: '?limit=1-100 (default 20), ?after=<post id>',
				response: '[Post], oldest first.'
			},
			{
				method: 'GET',
				path: '/api/bot/stream',
				summary: 'Server-sent events, kept open. See Realtime below.',
				response: 'text/event-stream'
			}
		]
	}
];

export const postShape = (origin: string) => `{
  "id": 123,
  "user": { "name": "…", "username": "…", "avatar": "/avatars/5.webp?hash=…" | null, "created_at": "…" },
  "content": "text, may contain @mentions and #hashtags",
  "images": ["/uploads/…"],            // paths on ${origin}
  "created_at": "ISO date", "edited_at": "ISO date" | null,
  "likes": 3, "liked": true,            // liked: by the bot
  "regiorgs": 1, "regiorged": false,    // regiorged: by the bot
  "quotes": 0,
  "quote": <quoted post> | { "deleted": true } | null,
  "poll": {                             // or null when the post has no poll
    "options": ["Tea", "Coffee"],
    "votes": [3, 5],                    // per option, same order
    "ends_at": "ISO date", "closed": false,
    "voted": 1 | null                   // index the bot voted for
  } | null,
  "replies_count": 2,
  "reply_to": { "id": 120, "username": "…", "likes": 4 } | null
}`;

export const messageShape = `{
  "id": 77,
  "sender": "alice",       // usernames, not ids
  "recipient": "mybot",
  "content": "hi!",        // may be empty when the message only has images
  "images": ["/uploads/…"],
  "created_at": "ISO date",
  "linked_post": {         // the first post on this site linked in "content", or null
    "id": 57, "user": { "name", "username", "avatar" },
    "content": "…", "images": ["/uploads/…"], "created_at": "ISO date", "is_quote": false
  } | null,
  "reply_to": {            // the message this one replies to, or null
    "id": 75, "sender": { "username", "name" },
    "content": "…",        // cut to 200 characters
    "images": 0            // how many images it has
  } | null,
  "reactions": [           // oldest first, at most one per profile
    { "emoji": "❤️", "username": "alice", "name": "Alice", "avatar": null }
  ]
}`;

export const groupMessageShape = `{
  "id": 301,
  "group_id": 12,
  "kind": "message",       // or an event: "created", "added", "removed", "left", "renamed", "owner"
  "sender": { "username": "alice", "name": "Alice", "avatar": "/avatars/5.webp?hash=…" | null },
  "target": { "username", "name", "avatar" } | null,   // who was added or removed, else null
  "content": "hi all",     // for "created" and "renamed": the group name
  "images": ["/uploads/…"],
  "created_at": "ISO date",
  "linked_post": { … } | null,   // like in Message
  "reply_to": {            // the message this one replies to, or null
    "id": 299, "sender": { "username", "name" }, "content": "…", "images": 0
  } | null,
  "reactions": [{ "emoji": "👍", "username": "bob", "name": "Bob", "avatar": null }]
}`;

export const curlExamples = (origin: string) => `# who am I?
curl -H "Authorization: Bearer $TOKEN" ${origin}/api/bot/me

# post, then reply
curl -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \\
  -d '{"content":"hello!"}' ${origin}/api/bot/posts
curl -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \\
  -d '{"content":"@alice thanks!","reply_to":121}' ${origin}/api/bot/posts

# send a direct message and read the conversation
curl -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \\
  -d '{"content":"hi alice"}' ${origin}/api/bot/messages/alice
curl -H "Authorization: Bearer $TOKEN" "${origin}/api/bot/messages/alice?limit=50"

# answer in group 12
curl -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \\
  -d '{"content":"hi everyone","reply_to":301}' ${origin}/api/bot/groups/12/messages

# like, with no body (still send the Content-Type)
curl -X PUT -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \\
  ${origin}/api/bot/posts/121/like

# a poll open for an hour, then vote for its second option
curl -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"content":"Tea or coffee?","poll":{"options":["Tea","Coffee"],"duration_minutes":60}}' \
  ${origin}/api/bot/posts
curl -X PUT -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"option":1}' ${origin}/api/bot/posts/123/vote

# new mentions since post 120
curl -H "Authorization: Bearer $TOKEN" "${origin}/api/bot/mentions?after=120"

# live events
curl -N -H "Authorization: Bearer $TOKEN" ${origin}/api/bot/stream`;

export const pythonExample = (origin: string) => `import json, os, requests

BASE = "${origin}"
HEADERS = {"Authorization": f"Bearer {os.environ['TOKEN']}", "Content-Type": "application/json"}

me = requests.get(f"{BASE}/api/bot/me", headers=HEADERS).json()
if me["muted"]:
    raise SystemExit("this bot is muted")

def reply(text, post_id, author):
    requests.post(f"{BASE}/api/bot/posts", headers=HEADERS,
                  json={"content": f"@{author} {text}", "reply_to": post_id})

def dm(text, username):
    requests.post(f"{BASE}/api/bot/messages/{username}", headers=HEADERS, json={"content": text})

# events arrive as "event: name" + "data: json" lines
with requests.get(f"{BASE}/api/bot/stream", headers=HEADERS, stream=True) as r:
    event = None
    for line in r.iter_lines(decode_unicode=True):
        if line.startswith("event: "):
            event = line[7:]
        elif line.startswith("data: "):
            data = json.loads(line[6:])
            if event == "mention":
                reply("you called?", data["id"], data["user"]["username"])
            elif event == "message":
                dm(f"you said: {data['content']}", data["sender"])`;

export const nodeExample = (origin: string) => `const BASE = '${origin}';
const headers = { Authorization: \`Bearer \${process.env.TOKEN}\`, 'Content-Type': 'application/json' };
const api = (path, body) =>
  fetch(BASE + path, { method: body ? 'POST' : 'GET', headers, body: body && JSON.stringify(body) });

const res = await fetch(BASE + '/api/bot/stream', { headers });
const decoder = new TextDecoder();
let buffer = '';
for await (const chunk of res.body) {
  buffer += decoder.decode(chunk, { stream: true });
  let end;
  while ((end = buffer.indexOf('\\n\\n')) !== -1) {
    const frame = buffer.slice(0, end);
    buffer = buffer.slice(end + 2);
    const event = /^event: (.+)$/m.exec(frame)?.[1];
    const data = /^data: (.+)$/m.exec(frame)?.[1];
    if (!data) continue; // keep-alive ping
    const payload = JSON.parse(data);
    if (event === 'mention')
      await api('/api/bot/posts', { content: \`@\${payload.user.username} hi!\`, reply_to: payload.id });
    if (event === 'message')
      await api(\`/api/bot/messages/\${payload.sender}\`, { content: 'got it' });
  }
}`;

/** One row of the v1 reference: auth is who may call it. */
export type V1Endpoint = { method: string; path: string; auth: string; summary: string };
export type V1Group = { id: string; title: string; endpoints: V1Endpoint[] };

// The /api/v1 reference on /developers and in README.md. /api.txt (src/lib/server/apiGuide.ts)
// has the full details; every v1 change touches all three.
export const v1Groups: V1Group[] = [
	{
		id: 'v1-auth',
		title: 'Instance and signing in',
		endpoints: [
			{
				method: 'GET',
				path: '/api/v1/instance',
				auth: 'public',
				summary: 'message of the day, whether registration is open, limits'
			},
			{
				method: 'POST',
				path: '/api/v1/auth/login',
				auth: 'public',
				summary: '`{ username, password, client_name? }` → a `sgu_…` bearer token and `me`'
			},
			{
				method: 'POST',
				path: '/api/v1/auth/register',
				auth: 'public',
				summary: '`{ signup_password, email, name, username, password }` → a token, like login'
			},
			{
				method: 'POST',
				path: '/api/v1/auth/passkeys/options',
				auth: 'public',
				summary: 'start a passkey sign-in: WebAuthn options and a `challenge_id`'
			},
			{
				method: 'POST',
				path: '/api/v1/auth/passkeys/login',
				auth: 'public',
				summary: '`{ challenge_id, response }` → a token, like login'
			},
			{
				method: 'POST',
				path: '/api/v1/auth/logout',
				auth: 'signed in',
				summary: 'revoke the token in use'
			},
			{
				method: 'GET',
				path: '/api/v1/auth/sessions',
				auth: 'account',
				summary: 'browser sessions, app tokens and personal access tokens'
			},
			{
				method: 'DELETE',
				path: '/api/v1/auth/sessions/:id',
				auth: 'account',
				summary: 'revoke one of them'
			},
			{
				method: 'POST',
				path: '/api/v1/auth/tokens',
				auth: 'account',
				summary:
					'`{ name, current_password, expires_in_days? }` → a personal access token (shown once)'
			},
			{
				method: 'GET',
				path: '/api/v1/auth/accounts',
				auth: 'account',
				summary: 'the account with its identities and unread counts'
			},
			{
				method: 'POST',
				path: '/api/v1/auth/switch',
				auth: 'account',
				summary: '`{ username }`: act as the account or one of its identities'
			}
		]
	},
	{
		id: 'v1-me',
		title: 'You',
		endpoints: [
			{
				method: 'GET',
				path: '/api/v1/me',
				auth: 'signed in',
				summary: 'the profile in use, its account, role, mute state and unread counts'
			},
			{
				method: 'PATCH',
				path: '/api/v1/me',
				auth: 'signed in',
				summary:
					'any of `{ name, username, bio, website, email }`; a new email needs `current_password`'
			},
			{
				method: 'PUT / DELETE',
				path: '/api/v1/me/avatar',
				auth: 'signed in',
				summary: 'set the picture (raw image body) / remove it'
			},
			{
				method: 'PUT',
				path: '/api/v1/me/password',
				auth: 'account',
				summary: '`{ current_password, password }`; signs out every other session'
			},
			{
				method: 'GET',
				path: '/api/v1/me/following',
				auth: 'signed in',
				summary: 'usernames you follow'
			},
			{ method: 'GET', path: '/api/v1/me/passkeys', auth: 'account', summary: 'your passkeys' },
			{
				method: 'POST',
				path: '/api/v1/me/passkeys/options',
				auth: 'account',
				summary: '`{ current_password }`: start registering a passkey'
			},
			{
				method: 'POST',
				path: '/api/v1/me/passkeys',
				auth: 'account',
				summary: '`{ challenge_id, name?, response }`: finish registering it'
			},
			{
				method: 'PATCH / DELETE',
				path: '/api/v1/me/passkeys/:id',
				auth: 'account',
				summary: 'rename `{ name }` / delete a passkey'
			},
			{
				method: 'GET / POST',
				path: '/api/v1/me/identities',
				auth: 'account',
				summary: 'your identities and the ones shared with you / create one `{ name, username }`'
			},
			{
				method: 'DELETE',
				path: '/api/v1/me/identities/:username',
				auth: 'account',
				summary: 'delete an identity with its posts'
			},
			{
				method: 'POST',
				path: '/api/v1/me/identities/:username/members',
				auth: 'account',
				summary: 'share it with an account `{ username }`'
			},
			{
				method: 'DELETE',
				path: '/api/v1/me/identities/:username/members/:member',
				auth: 'account',
				summary: 'stop sharing it'
			},
			{
				method: 'POST',
				path: '/api/v1/me/identities/:username/leave',
				auth: 'account',
				summary: 'give back an identity shared with you'
			},
			{
				method: 'GET / POST',
				path: '/api/v1/me/bots',
				auth: 'account',
				summary: 'your bots / create one `{ name, username }` (token shown once)'
			},
			{
				method: 'PATCH / DELETE',
				path: '/api/v1/me/bots/:username',
				auth: 'account',
				summary: 'edit a bot `{ name, username, bio, website }` / delete it'
			},
			{
				method: 'PUT / DELETE',
				path: '/api/v1/me/bots/:username/avatar',
				auth: 'account',
				summary: "set / remove a bot's picture"
			},
			{
				method: 'POST',
				path: '/api/v1/me/bots/:username/token',
				auth: 'account',
				summary: 'a new token for the bot, the old one stops working'
			},
			{
				method: 'GET / POST / DELETE',
				path: '/api/v1/push',
				auth: 'account',
				summary:
					'VAPID key / save `{ endpoint, keys }` / remove `{ endpoint }` a web push subscription'
			}
		]
	},
	{
		id: 'v1-posts',
		title: 'Timeline and posts',
		endpoints: [
			{
				method: 'GET',
				path: '/api/v1/timeline?feed=all|following',
				auth: 'public / signed in',
				summary: 'the home timeline (following brings in regiorgs)'
			},
			{
				method: 'GET',
				path: '/api/v1/timeline/pinned',
				auth: 'public',
				summary: 'posts staff pinned above the timeline'
			},
			{
				method: 'POST',
				path: '/api/v1/posts',
				auth: 'not muted',
				summary: '`{ content, uploads?, reply_to?, quote_of?, poll? }`'
			},
			{
				method: 'GET / PATCH / DELETE',
				path: '/api/v1/posts/:id',
				auth: 'public / author / author or staff',
				summary: 'read / edit the text `{ content }` / delete'
			},
			{
				method: 'GET',
				path: '/api/v1/posts/:id/replies',
				auth: 'public',
				summary: 'replies, ratioing ones first'
			},
			{ method: 'GET', path: '/api/v1/posts/:id/likes', auth: 'public', summary: 'who liked it' },
			{
				method: 'GET',
				path: '/api/v1/posts/:id/regiorgs',
				auth: 'public',
				summary: 'who regiorged it'
			},
			{ method: 'GET', path: '/api/v1/posts/:id/quotes', auth: 'public', summary: 'quotes of it' },
			{
				method: 'PUT / DELETE',
				path: '/api/v1/posts/:id/like',
				auth: 'signed in',
				summary: 'like / unlike'
			},
			{
				method: 'PUT / DELETE',
				path: '/api/v1/posts/:id/regiorg',
				auth: 'signed in',
				summary: 'regiorgio / undo'
			},
			{
				method: 'PUT',
				path: '/api/v1/posts/:id/vote',
				auth: 'signed in',
				summary: 'vote `{ option }`'
			},
			{
				method: 'PUT / DELETE',
				path: '/api/v1/posts/:id/pin',
				auth: 'author',
				summary: 'pin to / unpin from your profile'
			},
			{
				method: 'PUT / DELETE',
				path: '/api/v1/posts/:id/timeline-pin',
				auth: 'staff',
				summary: 'pin above / unpin from the home timeline'
			},
			{
				method: 'POST',
				path: '/api/v1/posts/:id/seen',
				auth: 'signed in',
				summary: 'mark your mention notification for it read'
			},
			{
				method: 'POST',
				path: '/api/v1/uploads',
				auth: 'not muted',
				summary: 'upload an image (raw body) for a post or message → `{ id }`'
			},
			{
				method: 'DELETE',
				path: '/api/v1/uploads/:id',
				auth: 'signed in',
				summary: 'drop an unused upload'
			}
		]
	},
	{
		id: 'v1-users',
		title: 'People, search and notifications',
		endpoints: [
			{
				method: 'GET',
				path: '/api/v1/users/:username',
				auth: 'public',
				summary: 'profile, counts, relationship, blocks, pinned post id'
			},
			{
				method: 'GET',
				path: '/api/v1/users/:username/card',
				auth: 'public',
				summary: 'the hover card'
			},
			{
				method: 'GET',
				path: '/api/v1/users/:username/posts?tab=posts|replies',
				auth: 'public',
				summary: "a profile's posts and regiorgs, or its replies"
			},
			{
				method: 'GET',
				path: '/api/v1/users/:username/pinned',
				auth: 'public',
				summary: 'its pinned post'
			},
			{
				method: 'GET',
				path: '/api/v1/users/:username/followers',
				auth: 'public',
				summary: 'followers'
			},
			{
				method: 'GET',
				path: '/api/v1/users/:username/following',
				auth: 'public',
				summary: 'who it follows'
			},
			{
				method: 'GET',
				path: '/api/v1/users/:username/followers/known',
				auth: 'signed in',
				summary: 'its followers you follow too'
			},
			{
				method: 'PUT / DELETE',
				path: '/api/v1/users/:username/follow',
				auth: 'signed in',
				summary: 'follow / unfollow'
			},
			{
				method: 'PUT / DELETE',
				path: '/api/v1/users/:username/block',
				auth: 'signed in',
				summary: 'block / unblock'
			},
			{
				method: 'GET',
				path: '/api/v1/search?q=',
				auth: 'signed in',
				summary: 'users and hashtags'
			},
			{
				method: 'GET',
				path: '/api/v1/search/users?q=',
				auth: 'signed in',
				summary: 'username / name prefix, for mention pickers'
			},
			{
				method: 'GET',
				path: '/api/v1/hashtags/:tag',
				auth: 'public',
				summary: 'a hashtag and its post count'
			},
			{
				method: 'GET',
				path: '/api/v1/hashtags/:tag/posts',
				auth: 'public',
				summary: 'posts with it'
			},
			{
				method: 'GET',
				path: '/api/v1/notifications',
				auth: 'signed in',
				summary: 'your notifications'
			},
			{
				method: 'GET',
				path: '/api/v1/notifications/unread',
				auth: 'signed in',
				summary: 'unread notifications and messages'
			},
			{
				method: 'POST',
				path: '/api/v1/notifications/read',
				auth: 'signed in',
				summary: 'mark all read'
			},
			{
				method: 'POST',
				path: '/api/v1/notifications/:id/read',
				auth: 'signed in',
				summary: 'mark one read'
			}
		]
	},
	{
		id: 'v1-chat',
		title: 'Messages and groups',
		endpoints: [
			{
				method: 'GET',
				path: '/api/v1/conversations',
				auth: 'signed in',
				summary: 'direct conversations and groups'
			},
			{
				method: 'GET',
				path: '/api/v1/share-targets',
				auth: 'signed in',
				summary: 'where a post can be shared'
			},
			{
				method: 'GET',
				path: '/api/v1/conversations/:username',
				auth: 'signed in',
				summary: 'peer, blocks and mute state'
			},
			{
				method: 'GET / POST',
				path: '/api/v1/conversations/:username/messages',
				auth: 'signed in / not muted',
				summary:
					'messages, oldest first (`cursor` for older) / send `{ content, uploads?, reply_to? }`'
			},
			{
				method: 'PATCH / DELETE',
				path: '/api/v1/conversations/:username/messages/:id',
				auth: 'sender',
				summary: 'edit your message `{ content }` (within an hour) / delete it'
			},
			{
				method: 'PUT / DELETE',
				path: '/api/v1/conversations/:username/messages/:id/reaction',
				auth: 'signed in',
				summary: 'react `{ emoji }` / remove it'
			},
			{
				method: 'POST',
				path: '/api/v1/conversations/:username/read',
				auth: 'signed in',
				summary: 'mark read'
			},
			{
				method: 'PUT / DELETE',
				path: '/api/v1/conversations/:username/mute',
				auth: 'signed in',
				summary: 'mute / unmute'
			},
			{
				method: 'POST',
				path: '/api/v1/conversations/:username/typing',
				auth: 'signed in',
				summary: 'typing indicator'
			},
			{
				method: 'GET / POST',
				path: '/api/v1/groups',
				auth: 'signed in / not muted',
				summary: 'your groups / create `{ name, members }`'
			},
			{
				method: 'GET / PATCH',
				path: '/api/v1/groups/:id',
				auth: 'member',
				summary: 'name, owner, members / rename `{ name }`'
			},
			{
				method: 'GET / POST',
				path: '/api/v1/groups/:id/messages',
				auth: 'member',
				summary: 'messages and events / send'
			},
			{
				method: 'PATCH / DELETE',
				path: '/api/v1/groups/:id/messages/:messageId',
				auth: 'sender',
				summary: 'edit your message `{ content }` (within an hour) / delete it'
			},
			{
				method: 'PUT / DELETE',
				path: '/api/v1/groups/:id/messages/:messageId/reaction',
				auth: 'member',
				summary: 'react / remove it'
			},
			{ method: 'POST', path: '/api/v1/groups/:id/read', auth: 'member', summary: 'mark read' },
			{
				method: 'PUT / DELETE',
				path: '/api/v1/groups/:id/mute',
				auth: 'member',
				summary: 'mute / unmute'
			},
			{
				method: 'POST',
				path: '/api/v1/groups/:id/members',
				auth: 'member',
				summary: 'add `{ usernames }`'
			},
			{
				method: 'DELETE',
				path: '/api/v1/groups/:id/members/:username',
				auth: 'owner (or yourself)',
				summary: 'remove someone, or leave'
			},
			{ method: 'POST', path: '/api/v1/groups/:id/leave', auth: 'member', summary: 'leave' },
			{
				method: 'POST',
				path: '/api/v1/groups/:id/typing',
				auth: 'member',
				summary: 'typing indicator'
			}
		]
	},
	{
		id: 'v1-admin',
		title: 'Moderation and realtime',
		endpoints: [
			{
				method: 'GET',
				path: '/api/v1/admin/users?q=&filter=',
				auth: 'staff',
				summary: 'accounts with their identities and what you may do'
			},
			{
				method: 'PUT / DELETE',
				path: '/api/v1/admin/users/:username/ban',
				auth: 'staff',
				summary: 'ban `{ reason? }` / unban'
			},
			{
				method: 'PUT / DELETE',
				path: '/api/v1/admin/users/:username/mute',
				auth: 'staff',
				summary: 'mute `{ reason? }` / unmute'
			},
			{
				method: 'PUT',
				path: '/api/v1/admin/users/:username/role',
				auth: 'admin',
				summary: '`{ role: "mod" | "user" }`'
			},
			{
				method: 'PUT',
				path: '/api/v1/admin/users/:username/password',
				auth: 'admin',
				summary: '`{ password }`, signs them out'
			},
			{
				method: 'GET / PUT',
				path: '/api/v1/admin/motd',
				auth: 'admin',
				summary: 'message of the day / set `{ motd }`'
			},
			{
				method: 'GET',
				path: '/api/v1/stream',
				auth: 'public / signed in',
				summary: 'server-sent events: posts, counts, notifications, messages, typing'
			},
			{
				method: 'GET',
				path: '/api/v1/stream/bot',
				auth: 'bot',
				summary: 'the bot stream (same as /api/bot/stream)'
			}
		]
	}
];
