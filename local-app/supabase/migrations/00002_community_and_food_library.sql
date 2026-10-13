-- 社区动态表
create table public.community_posts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  type text not null default 'talk',
  content text not null default '',
  images jsonb not null default '[]'::jsonb,
  data jsonb not null default '{}'::jsonb,
  tags text[] not null default '{}',
  status text not null default 'approved',
  reject_reason text,
  author_name text not null default '',
  author_avatar text,
  like_count integer not null default 0,
  comment_count integer not null default 0,
  favorite_count integer not null default 0,
  created_at timestamptz not null default now()
);
create index idx_community_posts_created on public.community_posts (created_at desc);
create index idx_community_posts_owner on public.community_posts (owner_id);

-- 社区评论表
create table public.community_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  owner_id uuid not null default auth.uid(),
  content text not null,
  author_name text not null default '',
  author_avatar text,
  created_at timestamptz not null default now()
);
create index idx_community_comments_post on public.community_comments (post_id, created_at asc);

-- 点赞表
create table public.community_likes (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  owner_id uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (post_id, owner_id)
);

-- 收藏表
create table public.community_favorites (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  owner_id uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (post_id, owner_id)
);

-- 关注关系表
create table public.community_follows (
  id uuid primary key default gen_random_uuid(),
  follower_id uuid not null default auth.uid(),
  followee_id uuid not null,
  created_at timestamptz not null default now(),
  unique (follower_id, followee_id)
);
create index idx_community_follows_follower on public.community_follows (follower_id);
create index idx_community_follows_followee on public.community_follows (followee_id);

-- 个人食物库表（包装解读入库）
create table public.food_library (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  name text not null,
  brand text,
  net_content text,
  nutrition jsonb not null default '{}'::jsonb,
  ingredients text,
  advice text,
  level text,
  category text not null default '其他',
  created_at timestamptz not null default now()
);
create index idx_food_library_owner on public.food_library (owner_id);

-- 计数器维护触发器函数
create or replace function public.bump_post_count(p_post_id uuid, p_col text, p_delta integer)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_col = 'like_count' then
    update public.community_posts set like_count = greatest(0, like_count + p_delta) where id = p_post_id;
  elsif p_col = 'comment_count' then
    update public.community_posts set comment_count = greatest(0, comment_count + p_delta) where id = p_post_id;
  elsif p_col = 'favorite_count' then
    update public.community_posts set favorite_count = greatest(0, favorite_count + p_delta) where id = p_post_id;
  end if;
end; $$;

create or replace function public.tg_likes_count()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then perform public.bump_post_count(new.post_id, 'like_count', 1); return new;
  elsif tg_op = 'DELETE' then perform public.bump_post_count(old.post_id, 'like_count', -1); return old;
  end if;
  return null;
end; $$;
create trigger trg_likes_count after insert or delete on public.community_likes
for each row execute function public.tg_likes_count();

create or replace function public.tg_comments_count()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then perform public.bump_post_count(new.post_id, 'comment_count', 1); return new;
  elsif tg_op = 'DELETE' then perform public.bump_post_count(old.post_id, 'comment_count', -1); return old;
  end if;
  return null;
end; $$;
create trigger trg_comments_count after insert or delete on public.community_comments
for each row execute function public.tg_comments_count();

create or replace function public.tg_favorites_count()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then perform public.bump_post_count(new.post_id, 'favorite_count', 1); return new;
  elsif tg_op = 'DELETE' then perform public.bump_post_count(old.post_id, 'favorite_count', -1); return old;
  end if;
  return null;
end; $$;
create trigger trg_favorites_count after insert or delete on public.community_favorites
for each row execute function public.tg_favorites_count();

-- 启用 RLS
alter table public.community_posts enable row level security;
alter table public.community_comments enable row level security;
alter table public.community_likes enable row level security;
alter table public.community_favorites enable row level security;
alter table public.community_follows enable row level security;
alter table public.food_library enable row level security;

-- community_posts 策略
create policy "posts_select_all" on public.community_posts for select to anon, authenticated using (true);
create policy "posts_insert_own" on public.community_posts for insert to authenticated with check (owner_id = auth.uid());
create policy "posts_update_own" on public.community_posts for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "posts_delete_own" on public.community_posts for delete to authenticated using (owner_id = auth.uid());

-- community_comments 策略
create policy "comments_select_all" on public.community_comments for select to anon, authenticated using (true);
create policy "comments_insert_own" on public.community_comments for insert to authenticated with check (owner_id = auth.uid());
create policy "comments_update_own" on public.community_comments for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "comments_delete_own" on public.community_comments for delete to authenticated using (owner_id = auth.uid());

-- community_likes 策略
create policy "likes_select_all" on public.community_likes for select to anon, authenticated using (true);
create policy "likes_insert_own" on public.community_likes for insert to authenticated with check (owner_id = auth.uid());
create policy "likes_delete_own" on public.community_likes for delete to authenticated using (owner_id = auth.uid());

-- community_favorites 策略
create policy "favorites_select_own" on public.community_favorites for select to authenticated using (owner_id = auth.uid());
create policy "favorites_insert_own" on public.community_favorites for insert to authenticated with check (owner_id = auth.uid());
create policy "favorites_delete_own" on public.community_favorites for delete to authenticated using (owner_id = auth.uid());

-- community_follows 策略
create policy "follows_select_all" on public.community_follows for select to anon, authenticated using (true);
create policy "follows_insert_own" on public.community_follows for insert to authenticated with check (follower_id = auth.uid());
create policy "follows_delete_own" on public.community_follows for delete to authenticated using (follower_id = auth.uid());

-- food_library 策略
create policy "foodlib_select_own" on public.food_library for select to authenticated using (owner_id = auth.uid());
create policy "foodlib_insert_own" on public.food_library for insert to authenticated with check (owner_id = auth.uid());
create policy "foodlib_update_own" on public.food_library for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "foodlib_delete_own" on public.food_library for delete to authenticated using (owner_id = auth.uid());