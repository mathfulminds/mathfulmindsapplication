-- =========================================
-- 0001_roles_and_profiles.sql
-- =========================================

create type user_role as enum ('student', 'parent', 'teacher', 'admin');
create type math_category as enum (
  'arithmetic',
  'number_theory',
  'algebra',
  'geometry',
  'trigonometry',
  'calculus',
  'statistics_probability',
  'miscellaneous'
);

-- profiles: 1:1 with auth.users
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text not null,
  role user_role not null default 'student',
  grade_level int,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- parent <-> student links (many-to-many, supports multiple guardians/students)
create table public.parent_student_links (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references public.profiles(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','approved','revoked')),
  created_at timestamptz not null default now(),
  unique (parent_id, student_id)
);

-- teacher <-> class <-> student
create table public.classes (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  class_name text not null,
  join_code text unique not null default substr(md5(random()::text), 1, 6),
  created_at timestamptz not null default now()
);

create table public.class_enrollments (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (class_id, student_id)
);

-- question history (referenced by History tab; solved in later phase)
create table public.questions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  description text not null,
  category math_category not null,
  raw_input_type text not null check (raw_input_type in ('typed','upload','camera')),
  raw_input_url text,
  created_at timestamptz not null default now()
);
