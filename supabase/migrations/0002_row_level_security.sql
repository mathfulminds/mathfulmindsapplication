-- =========================================
-- 0002_row_level_security.sql
-- =========================================

alter table public.profiles enable row level security;
alter table public.parent_student_links enable row level security;
alter table public.classes enable row level security;
alter table public.class_enrollments enable row level security;
alter table public.questions enable row level security;

-- PROFILES
create policy "profiles_select_self"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles_select_admin"
  on public.profiles for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

create policy "profiles_select_parent_of_student"
  on public.profiles for select
  using (
    exists (
      select 1 from public.parent_student_links l
      where l.student_id = profiles.id
      and l.parent_id = auth.uid()
      and l.status = 'approved'
    )
  );

create policy "profiles_select_teacher_of_student"
  on public.profiles for select
  using (
    exists (
      select 1 from public.class_enrollments ce
      join public.classes c on c.id = ce.class_id
      where ce.student_id = profiles.id
      and c.teacher_id = auth.uid()
    )
  );

create policy "profiles_update_self"
  on public.profiles for update
  using (auth.uid() = id);

create policy "profiles_insert_self"
  on public.profiles for insert
  with check (auth.uid() = id);

-- PARENT_STUDENT_LINKS
create policy "psl_select_involved"
  on public.parent_student_links for select
  using (auth.uid() = parent_id or auth.uid() = student_id);

create policy "psl_insert_parent"
  on public.parent_student_links for insert
  with check (auth.uid() = parent_id);

create policy "psl_update_involved"
  on public.parent_student_links for update
  using (auth.uid() = parent_id or auth.uid() = student_id);

-- CLASSES
create policy "classes_select_teacher_owner"
  on public.classes for select
  using (auth.uid() = teacher_id);

create policy "classes_select_enrolled_student"
  on public.classes for select
  using (
    exists (
      select 1 from public.class_enrollments ce
      where ce.class_id = classes.id and ce.student_id = auth.uid()
    )
  );

create policy "classes_insert_teacher"
  on public.classes for insert
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'teacher')
  );

-- CLASS_ENROLLMENTS
create policy "enrollments_select_teacher"
  on public.class_enrollments for select
  using (
    exists (select 1 from public.classes c where c.id = class_enrollments.class_id and c.teacher_id = auth.uid())
  );

create policy "enrollments_select_self"
  on public.class_enrollments for select
  using (auth.uid() = student_id);

create policy "enrollments_insert_self"
  on public.class_enrollments for insert
  with check (auth.uid() = student_id);

-- QUESTIONS
create policy "questions_select_owner"
  on public.questions for select
  using (auth.uid() = student_id);

create policy "questions_select_parent"
  on public.questions for select
  using (
    exists (
      select 1 from public.parent_student_links l
      where l.student_id = questions.student_id
      and l.parent_id = auth.uid()
      and l.status = 'approved'
    )
  );

create policy "questions_select_teacher"
  on public.questions for select
  using (
    exists (
      select 1 from public.class_enrollments ce
      join public.classes c on c.id = ce.class_id
      where ce.student_id = questions.student_id
      and c.teacher_id = auth.uid()
    )
  );

create policy "questions_insert_owner"
  on public.questions for insert
  with check (auth.uid() = student_id);
