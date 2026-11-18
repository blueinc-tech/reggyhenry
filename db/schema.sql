-- RHAGF website database. Safe to run repeatedly (npm run db:migrate).

create table if not exists authors (
	id serial primary key,
	slug text not null unique,
	name text not null,
	bio text not null default '',
	avatar_url text,
	wp_id integer unique
);

create table if not exists terms (
	id serial primary key,
	taxonomy text not null check (taxonomy in ('category', 'tag')),
	slug text not null,
	name text not null,
	description text not null default '',
	parent_id integer references terms(id) on delete set null,
	wp_id integer,
	unique (taxonomy, slug),
	unique (taxonomy, wp_id)
);

create table if not exists media (
	id serial primary key,
	url text not null,
	storage_key text not null unique,
	original_url text unique,
	mime text not null default 'image/jpeg',
	width integer,
	height integer,
	size_bytes integer,
	alt text not null default '',
	caption text not null default '',
	wp_id integer unique,
	created_at timestamptz not null default now()
);

create table if not exists posts (
	id serial primary key,
	type text not null default 'post' check (type in ('post', 'page')),
	slug text not null,
	title text not null,
	excerpt text not null default '',
	content text not null default '',
	status text not null default 'draft' check (status in ('draft', 'published')),
	published_at timestamptz,
	modified_at timestamptz not null default now(),
	created_at timestamptz not null default now(),
	author_id integer references authors(id) on delete set null,
	featured_media_id integer references media(id) on delete set null,
	seo_title text not null default '',
	seo_description text not null default '',
	sticky boolean not null default false,
	wp_id integer,
	search tsvector generated always as (
		setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
		setweight(to_tsvector('english', coalesce(excerpt, '')), 'B') ||
		setweight(to_tsvector('english', regexp_replace(coalesce(content, ''), '<[^>]+>', ' ', 'g')), 'C')
	) stored,
	unique (type, slug),
	unique (type, wp_id)
);
create index if not exists posts_listing on posts (type, status, published_at desc);
create index if not exists posts_search on posts using gin (search);

create table if not exists post_terms (
	post_id integer not null references posts(id) on delete cascade,
	term_id integer not null references terms(id) on delete cascade,
	position integer not null default 0,
	primary key (post_id, term_id)
);
create index if not exists post_terms_term on post_terms (term_id);

create table if not exists users (
	id serial primary key,
	email text not null unique,
	name text not null,
	password_hash text not null,
	role text not null default 'editor' check (role in ('admin', 'editor')),
	author_id integer references authors(id) on delete set null,
	created_at timestamptz not null default now(),
	last_login_at timestamptz
);

create table if not exists sessions (
	id text primary key,
	user_id integer not null references users(id) on delete cascade,
	expires_at timestamptz not null,
	created_at timestamptz not null default now()
);

create table if not exists submissions (
	id serial primary key,
	form text not null,
	data jsonb not null,
	email_sent boolean not null default false,
	read_at timestamptz,
	created_at timestamptz not null default now()
);

-- Added with the full WordPress replacement (see WORDPRESS-AUDIT.md). Safe to re-run.

-- Reader view counts, carried over from the theme's counter (_empath_views_count).
alter table posts add column if not exists views integer not null default 0;

-- The search phrase an article is written for (Yoast's "focus keyphrase"), used by the editor's SEO analysis.
alter table posts add column if not exists focus_keyphrase text not null default '';

-- Enquiry handling: a status, private notes, and when they last changed.
alter table submissions add column if not exists status text not null default 'new';
alter table submissions add column if not exists notes text not null default '';
alter table submissions add column if not exists updated_at timestamptz not null default now();
do $$ begin
	alter table submissions add constraint submissions_status check (status in ('new', 'in_progress', 'resolved', 'spam'));
exception when duplicate_object then null; end $$;
create index if not exists submissions_created on submissions (created_at desc);

-- Site-wide settings edited in the admin (contact details, social links, menus, forms).
create table if not exists settings (
	key text primary key,
	value jsonb not null,
	updated_at timestamptz not null default now(),
	updated_by integer references users(id) on delete set null
);

-- What was changed in the admin, by whom.
create table if not exists activity (
	id serial primary key,
	user_id integer references users(id) on delete set null,
	user_name text not null default '',
	action text not null,
	target text not null default '',
	created_at timestamptz not null default now()
);
create index if not exists activity_created on activity (created_at desc);

/* ---------- RHAGF: events, donation campaigns, gallery, team, comments ---------- */

-- Events (the theme's "event" post type): listed on the home and Events pages, each with its own page at /event/<slug>/.
create table if not exists events (
	id serial primary key,
	slug text not null unique,
	title text not null,
	-- Short description shown at the top of the event page.
	summary text not null default '',
	content text not null default '',
	-- The day shown on cards ("30 Sep, 2022") and the one on the event page ("Date:"), as the old site kept them separately.
	event_date date not null,
	time_text text not null default '',
	location text not null default '',
	category text not null default '',
	map_query text not null default '',
	button_label text not null default '',
	button_url text not null default '',
	image_media_id integer references media(id) on delete set null,
	status text not null default 'published' check (status in ('draft', 'published')),
	position integer not null default 0,
	wp_id integer unique,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

-- Donation campaigns (GiveWP forms): progress bars on the home and Donations pages, each with its own page at /donations/<slug>/.
create table if not exists campaigns (
	id serial primary key,
	slug text not null unique,
	title text not null,
	excerpt text not null default '',
	content text not null default '',
	goal numeric(14, 2) not null default 0,
	-- Raised before this site (GiveWP's total); confirmed donations made here are added to it.
	raised_offset numeric(14, 2) not null default 0,
	-- Suggested amounts (the "Level" buttons) and the default one.
	levels numeric(14, 2)[] not null default '{}',
	default_amount numeric(14, 2),
	minimum numeric(14, 2) not null default 1000,
	image_media_id integer references media(id) on delete set null,
	status text not null default 'published' check (status in ('draft', 'published', 'closed')),
	position integer not null default 0,
	wp_id integer unique,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

-- Pledges made through the donation forms. Payment is by bank transfer; an administrator confirms it once the money arrives.
create table if not exists donations (
	id serial primary key,
	reference text not null unique,
	campaign_id integer references campaigns(id) on delete set null,
	first_name text not null,
	last_name text not null default '',
	email text not null,
	phone text not null default '',
	amount numeric(14, 2) not null check (amount > 0),
	message text not null default '',
	status text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled')),
	notes text not null default '',
	email_sent boolean not null default false,
	confirmed_at timestamptz,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);
create index if not exists donations_campaign on donations (campaign_id, status);
create index if not exists donations_created on donations (created_at desc);

-- Gallery page pictures, in order.
create table if not exists gallery_items (
	id serial primary key,
	media_id integer not null references media(id) on delete cascade,
	title text not null default '',
	subtitle text not null default '',
	position integer not null default 0,
	created_at timestamptz not null default now()
);

-- People on the Volunteers page.
create table if not exists team_members (
	id serial primary key,
	name text not null,
	role text not null default '',
	photo_media_id integer references media(id) on delete set null,
	links jsonb not null default '[]',
	position integer not null default 0,
	created_at timestamptz not null default now()
);

-- Comments left on campaign pages ("Leave a Comment"); shown only once approved.
create table if not exists comments (
	id serial primary key,
	target_type text not null check (target_type in ('campaign', 'post')),
	target_id integer not null,
	name text not null,
	email text not null,
	website text not null default '',
	body text not null,
	status text not null default 'pending' check (status in ('pending', 'approved', 'spam')),
	created_at timestamptz not null default now()
);
create index if not exists comments_target on comments (target_type, target_id, status);

-- Event cards show a short time and place ("9:00am", "Abuja"); the event page a fuller one ("9:00am to 12:00pm", "Nigeria").
alter table events add column if not exists time_detail text not null default '';
alter table events add column if not exists location_detail text not null default '';
