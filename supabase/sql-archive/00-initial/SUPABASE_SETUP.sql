-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 1. Profiles Table
create table public.profiles (
  id uuid references auth.users on delete cascade not null primary key,
  
  username text unique,
  display_name text,
  bio text,
  full_name text, -- legacy fallback
  avatar_url text,
  visibility text default 'private' check (visibility in ('private', 'friends', 'public')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Tasks Table
create table public.tasks (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  name text not null,
  description text,
  category text,
  duration text,
  recurring text default 'none' check (recurring in ('none', 'daily', 'weekdays', 'weekly')),
  created_at date not null default current_date,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. Task Completions Table
create table public.task_completions (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  task_id uuid references public.tasks(id) on delete cascade not null,
  completed_date date not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(user_id, task_id, completed_date)
);

-- 4. Daily Data (Notes & Status)
create table public.daily_data (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  date date not null,
  note text,
  manual_completion boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(user_id, date)
);

-- 5. Friendships Table
create table public.friendships (
  id uuid default uuid_generate_v4() primary key,
  requester_id uuid references public.profiles(id) on delete cascade not null,
  receiver_id uuid references public.profiles(id) on delete cascade not null,
  status text default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(requester_id, receiver_id)
);

-- ==========================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==========================================

alter table public.profiles enable row level security;
alter table public.tasks enable row level security;
alter table public.task_completions enable row level security;
alter table public.daily_data enable row level security;
alter table public.friendships enable row level security;

-- Profiles: Users can read public/friends profiles, update their own
create policy "Public profiles are viewable by everyone" on profiles for select using (visibility = 'public');
create policy "Users can view their own profile" on profiles for select using (auth.uid() = id);
create policy "Friends can view friends profiles" on profiles for select using (
  visibility = 'friends' and (
    exists (select 1 from friendships where status = 'accepted' and (
      (requester_id = auth.uid() and receiver_id = profiles.id) or 
      (receiver_id = auth.uid() and requester_id = profiles.id)
    ))
  )
);
create policy "Users can insert their own profile" on profiles for insert with check (auth.uid() = id);
create policy "Users can update their own profile" on profiles for update using (auth.uid() = id);

-- Tasks: Users can CRUD their own tasks
create policy "Users can view their own tasks" on tasks for select using (auth.uid() = user_id);
create policy "Users can insert their own tasks" on tasks for insert with check (auth.uid() = user_id);
create policy "Users can update their own tasks" on tasks for update using (auth.uid() = user_id);
create policy "Users can delete their own tasks" on tasks for delete using (auth.uid() = user_id);

-- Task Completions: Users can CRUD their own completions
create policy "Users can view their own completions" on task_completions for select using (auth.uid() = user_id);
create policy "Users can insert their own completions" on task_completions for insert with check (auth.uid() = user_id);
create policy "Users can delete their own completions" on task_completions for delete using (auth.uid() = user_id);

-- Daily Data: Users can CRUD their own daily data
create policy "Users can view their own daily data" on daily_data for select using (auth.uid() = user_id);
create policy "Users can insert their own daily data" on daily_data for insert with check (auth.uid() = user_id);
create policy "Users can update their own daily data" on daily_data for update using (auth.uid() = user_id);

-- Friendships: Users can CRUD if they are requester or receiver
create policy "Users can view their friendships" on friendships for select using (auth.uid() = requester_id or auth.uid() = receiver_id);
create policy "Users can insert friendships" on friendships for insert with check (auth.uid() = requester_id);
create policy "Users can update friendships" on friendships for update using (auth.uid() = requester_id or auth.uid() = receiver_id);
create policy "Users can delete friendships" on friendships for delete using (auth.uid() = requester_id or auth.uid() = receiver_id);

-- Functions and Triggers for updated_at
create or replace function handle_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger profiles_updated_at before update on profiles for each row execute procedure handle_updated_at();
create trigger tasks_updated_at before update on tasks for each row execute procedure handle_updated_at();
create trigger daily_data_updated_at before update on daily_data for each row execute procedure handle_updated_at();
create trigger friendships_updated_at before update on friendships for each row execute procedure handle_updated_at();


-- 6. Storage Bucket for Avatars
insert into storage.buckets (id, name, public) values ('profile-images', 'profile-images', true) on conflict do nothing;

create policy "Avatar images are publicly accessible" on storage.objects for select using ( bucket_id = 'profile-images' );
create policy "Anyone can upload an avatar" on storage.objects for insert with check ( bucket_id = 'profile-images' and auth.uid() = owner );
create policy "Anyone can update their own avatar" on storage.objects for update with check ( bucket_id = 'profile-images' and auth.uid() = owner );
create policy "Anyone can delete their own avatar" on storage.objects for delete using ( bucket_id = 'profile-images' and auth.uid() = owner );
