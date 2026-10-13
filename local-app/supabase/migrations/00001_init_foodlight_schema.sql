-- 用户角色枚举
CREATE TYPE public.user_role AS ENUM ('user', 'admin');

-- 用户资料表（扩展健康信息）
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  phone text,
  role public.user_role NOT NULL DEFAULT 'user',
  nickname text,
  avatar_url text,
  -- 健康基础信息
  gender text CHECK (gender IN ('male', 'female')),
  age integer,
  height_cm numeric,
  weight_kg numeric,
  activity_level text CHECK (activity_level IN ('low', 'medium', 'high')),
  goal text CHECK (goal IN ('lose_fat', 'gain_muscle', 'balance', 'control_sugar')),
  allergies text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 新用户自动同步到 profiles
CREATE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, phone, role)
  VALUES (NEW.id, NEW.email, NEW.phone, 'user'::public.user_role);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- 角色查询辅助函数（防止 RLS 递归）
CREATE OR REPLACE FUNCTION public.get_user_role(uid uuid)
RETURNS public.user_role
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = uid;
$$;

-- profiles RLS
CREATE POLICY "Admins full access profiles" ON public.profiles
  FOR ALL TO authenticated USING (public.get_user_role(auth.uid()) = 'admin'::public.user_role);
CREATE POLICY "Users view own profile" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id)
  WITH CHECK (role IS NOT DISTINCT FROM public.get_user_role(auth.uid()));

CREATE VIEW public.public_profiles AS
  SELECT id, nickname, avatar_url, role FROM public.profiles;

-- 食谱表
CREATE TABLE public.recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  cover_url text,
  meal_type text CHECK (meal_type IN ('breakfast', 'lunch', 'dinner', 'snack')),
  ingredients jsonb NOT NULL DEFAULT '[]'::jsonb,
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  nutrition jsonb NOT NULL DEFAULT '{}'::jsonb,
  nutritionist_comment text,
  is_ai_generated boolean NOT NULL DEFAULT false,
  source text CHECK (source IN ('ai', 'custom')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own recipes" ON public.recipes
  FOR SELECT TO authenticated USING (auth.uid() = owner_id);
CREATE POLICY "Users insert own recipes" ON public.recipes
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Users update own recipes" ON public.recipes
  FOR UPDATE TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Users delete own recipes" ON public.recipes
  FOR DELETE TO authenticated USING (auth.uid() = owner_id);
CREATE POLICY "Admins full access recipes" ON public.recipes
  FOR ALL TO authenticated USING (public.get_user_role(auth.uid()) = 'admin'::public.user_role);

-- 饮食记录表
CREATE TABLE public.meal_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  log_date date NOT NULL DEFAULT CURRENT_DATE,
  meal_type text CHECK (meal_type IN ('breakfast', 'lunch', 'dinner', 'snack')),
  food_name text NOT NULL,
  portion text,
  calories numeric NOT NULL DEFAULT 0,
  protein numeric NOT NULL DEFAULT 0,
  carbs numeric NOT NULL DEFAULT 0,
  fat numeric NOT NULL DEFAULT 0,
  image_url text,
  recipe_id uuid REFERENCES public.recipes(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.meal_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own meal_logs" ON public.meal_logs
  FOR SELECT TO authenticated USING (auth.uid() = owner_id);
CREATE POLICY "Users insert own meal_logs" ON public.meal_logs
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Users update own meal_logs" ON public.meal_logs
  FOR UPDATE TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Users delete own meal_logs" ON public.meal_logs
  FOR DELETE TO authenticated USING (auth.uid() = owner_id);
CREATE POLICY "Admins full access meal_logs" ON public.meal_logs
  FOR ALL TO authenticated USING (public.get_user_role(auth.uid()) = 'admin'::public.user_role);

-- 体重记录表
CREATE TABLE public.weight_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  log_date date NOT NULL DEFAULT CURRENT_DATE,
  weight_kg numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.weight_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own weight_logs" ON public.weight_logs
  FOR SELECT TO authenticated USING (auth.uid() = owner_id);
CREATE POLICY "Users insert own weight_logs" ON public.weight_logs
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Users update own weight_logs" ON public.weight_logs
  FOR UPDATE TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Users delete own weight_logs" ON public.weight_logs
  FOR DELETE TO authenticated USING (auth.uid() = owner_id);
CREATE POLICY "Admins full access weight_logs" ON public.weight_logs
  FOR ALL TO authenticated USING (public.get_user_role(auth.uid()) = 'admin'::public.user_role);

-- Storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('app-ejgfa726qvi9_foodlight_images', 'app-ejgfa726qvi9_foodlight_images', true);

CREATE POLICY "Public read foodlight images" ON storage.objects
  FOR SELECT TO public USING (bucket_id = 'app-ejgfa726qvi9_foodlight_images');
CREATE POLICY "Auth upload foodlight images" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'app-ejgfa726qvi9_foodlight_images');
CREATE POLICY "Auth update foodlight images" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'app-ejgfa726qvi9_foodlight_images');
CREATE POLICY "Auth delete foodlight images" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'app-ejgfa726qvi9_foodlight_images');