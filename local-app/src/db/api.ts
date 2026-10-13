import { supabase } from '@/client/supabase';
import { notifyHealthDataChanged } from '@/lib/health-data-events';
import type {
  ActivityLevel,
  CommunityComment,
  CommunityPost,
  FoodLibraryItem,
  Gender,
  Goal,
  MealLog,
  MealType,
  Profile,
  Recipe,
  WeightLog,
} from '@/types/types';
import { KCAL_PER_GRAM, MACRO_RATIOS } from '@/types/types';

const BUCKET = 'app-ejgfa726qvi9_foodlight_images';

// 计算 BMR（Mifflin-St Jeor）
export function calcBMR(gender: Gender, weight: number, height: number, age: number): number {
  const base = 10 * weight + 6.25 * height - 5 * age;
  return gender === 'male' ? base + 5 : base - 161;
}

// 计算 TDEE
export function calcTDEE(bmr: number, activity: ActivityLevel): number {
  const factor = activity === 'low' ? 1.2 : activity === 'medium' ? 1.55 : 1.725;
  return bmr * factor;
}

// 根据目标计算每日推荐热量
export function calcDailyTarget(goal: Goal, tdee: number): number {
  if (goal === 'lose_fat') return Math.round(tdee * 0.8);
  if (goal === 'gain_muscle') return Math.round(tdee * 1.1);
  if (goal === 'control_sugar') return Math.round(tdee * 0.9);
  return Math.round(tdee);
}

// 根据热量目标和营养素比例计算克数
export function calcMacroGrams(goal: Goal, dailyCalories: number) {
  const ratios = MACRO_RATIOS[goal];
  const protein = Math.round((dailyCalories * ratios.protein) / KCAL_PER_GRAM.protein);
  const carbs = Math.round((dailyCalories * ratios.carbs) / KCAL_PER_GRAM.carbs);
  const fat = Math.round((dailyCalories * ratios.fat) / KCAL_PER_GRAM.fat);
  return { protein, carbs, fat };
}

// ===== Profile =====
export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateProfile(
  userId: string,
  updates: Partial<Pick<Profile, 'nickname' | 'gender' | 'age' | 'height_cm' | 'weight_kg' | 'activity_level' | 'goal' | 'allergies' | 'avatar_url'>>
): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', userId);
  if (error) throw new Error(error.message);
}

// ===== Recipes =====
export async function listRecipes(userId: string): Promise<Recipe[]> {
  const { data, error } = await supabase
    .from('recipes')
    .select('*')
    .eq('owner_id', userId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return Array.isArray(data) ? data : [];
}

export async function getRecipe(id: string): Promise<Recipe | null> {
  const { data, error } = await supabase
    .from('recipes')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function createRecipe(
  recipe: Omit<Recipe, 'id' | 'owner_id' | 'created_at' | 'updated_at'>
): Promise<Recipe> {
  const { data, error } = await supabase
    .from('recipes')
    .insert(recipe)
    .select()
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as Recipe;
}

export async function updateRecipe(
  id: string,
  updates: Partial<Recipe>
): Promise<void> {
  const { error } = await supabase
    .from('recipes')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteRecipe(id: string): Promise<void> {
  const { error } = await supabase.from('recipes').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ===== Meal Logs =====
export async function listMealLogs(userId: string, date: string): Promise<MealLog[]> {
  const { data, error } = await supabase
    .from('meal_logs')
    .select('*')
    .eq('owner_id', userId)
    .eq('log_date', date)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return Array.isArray(data) ? data : [];
}

export async function listMealLogsRange(
  userId: string,
  startDate: string,
  endDate: string
): Promise<MealLog[]> {
  const { data, error } = await supabase
    .from('meal_logs')
    .select('*')
    .eq('owner_id', userId)
    .gte('log_date', startDate)
    .lte('log_date', endDate)
    .order('log_date', { ascending: true })
    .limit(1000);
  if (error) throw new Error(error.message);
  return Array.isArray(data) ? data : [];
}

export async function createMealLog(
  log: Omit<MealLog, 'id' | 'owner_id' | 'created_at'>
): Promise<void> {
  const { error } = await supabase.from('meal_logs').insert(log);
  if (error) throw new Error(error.message);
  notifyHealthDataChanged('meal');
}

export async function deleteMealLog(id: string): Promise<void> {
  const { error } = await supabase.from('meal_logs').delete().eq('id', id);
  if (error) throw new Error(error.message);
  notifyHealthDataChanged('meal');
}

// ===== Weight Logs =====
export async function listWeightLogs(userId: string): Promise<WeightLog[]> {
  const { data, error } = await supabase
    .from('weight_logs')
    .select('*')
    .eq('owner_id', userId)
    .order('log_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(365);
  if (error) throw new Error(error.message);
  return Array.isArray(data) ? data.reverse() : [];
}

export async function saveWeightLog(
  weightKg: number,
  date: string
): Promise<'created' | 'updated'> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error('未登录');

  const { data: existing, error: queryError } = await supabase
    .from('weight_logs')
    .select('id')
    .eq('owner_id', userId)
    .eq('log_date', date)
    .limit(1);
  if (queryError) throw new Error(queryError.message);

  const action = existing?.length ? 'updated' : 'created';
  if (action === 'updated') {
    // 历史导入可能存在同日多条记录；统一更新可保证旧数据也保持一致。
    const { error } = await supabase
      .from('weight_logs')
      .update({ weight_kg: weightKg })
      .eq('owner_id', userId)
      .eq('log_date', date);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from('weight_logs').insert({
      owner_id: userId,
      log_date: date,
      weight_kg: weightKg,
    });
    if (error) throw new Error(error.message);
  }

  if (date === todayStr()) {
    await updateProfile(userId, { weight_kg: weightKg });
  }
  notifyHealthDataChanged('weight');
  return action;
}

// ===== Storage =====
export function getPublicUrl(path: string | null | undefined): string {
  if (!path) return '';
  const trimmed = path.trim();
  if (!trimmed) return '';
  // 如果已经是完整的 HTTP(S) URL 或 data: URL，直接返回
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('data:')) {
    return trimmed;
  }
  // 兼容意外嵌套的完整 URL（如 /public/bucket/https://...）
  const httpIdx = trimmed.indexOf('http://');
  if (httpIdx !== -1) return trimmed.slice(httpIdx);
  const httpsIdx = trimmed.indexOf('https://');
  if (httpsIdx !== -1) return trimmed.slice(httpsIdx);

  // 清除可能多余的 bucket 前缀
  const cleanPath = trimmed.startsWith(`${BUCKET}/`) ? trimmed.slice(BUCKET.length + 1) : trimmed;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(cleanPath);
  return data?.publicUrl || '';
}

export function getThumbUrl(path: string | null | undefined, w = 400, h = 400): string {
  if (!path) return '';
  const trimmed = path.trim();
  if (!trimmed) return '';
  // 如果已经是完整的 HTTP(S) URL 或 data: URL，直接返回
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('data:')) {
    return trimmed;
  }
  const httpIdx = trimmed.indexOf('http://');
  if (httpIdx !== -1) return trimmed.slice(httpIdx);
  const httpsIdx = trimmed.indexOf('https://');
  if (httpsIdx !== -1) return trimmed.slice(httpsIdx);

  const cleanPath = trimmed.startsWith(`${BUCKET}/`) ? trimmed.slice(BUCKET.length + 1) : trimmed;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(cleanPath, {
    transform: { width: w, height: h, resize: 'cover', quality: 75 },
  });
  return data?.publicUrl || '';
}

// ===== Edge Function 调用 =====
export async function callDeepSeekRecipe(params: {
  goal: Goal;
  gender: Gender;
  age: number;
  height_cm: number;
  weight_kg: number;
  activity_level: ActivityLevel;
  allergies: string;
  tdee: number;
}) {
  const { data, error } = await supabase.functions.invoke('deepseek-recipe', {
    body: params,
    method: 'POST',
  });
  if (error) {
    const msg = await error?.context?.text?.();
    throw new Error(safeErrorMessage(msg || error.message, '食谱生成失败'));
  }
  return data;
}

export async function callBaiduNutrition(query: string) {
  const { data, error } = await supabase.functions.invoke('baidu-nutrition', {
    body: { query },
    method: 'POST',
  });
  if (error) {
    const msg = await error?.context?.text?.();
    throw new Error(safeErrorMessage(msg || error.message, '营养检索失败'));
  }
  return data;
}

export async function callImageGeneration(prompt: string, size = '1024x1024') {
  const { data, error } = await supabase.functions.invoke('image-generations', {
    body: { prompt, size },
    method: 'POST',
  });
  if (error) {
    const msg = await error?.context?.text?.();
    throw new Error(safeErrorMessage(msg || error.message, '图片生成失败'));
  }
  return data;
}

export async function callImageEdit(
  prompt: string,
  images: { b64_json: string }[],
  size = '1024x1024'
) {
  const { data, error } = await supabase.functions.invoke('image-edits', {
    body: { prompt, images, size },
    method: 'POST',
  });
  if (error) {
    const msg = await error?.context?.text?.();
    throw new Error(safeErrorMessage(msg || error.message, '图片编辑失败'));
  }
  return data;
}

export async function callKlingSound(prompt: string) {
  const { data, error } = await supabase.functions.invoke('kling-sound', {
    body: { prompt },
    method: 'POST',
  });
  if (error) {
    const msg = await error?.context?.text?.();
    throw new Error(safeErrorMessage(msg || error.message, '音效生成失败'));
  }
  return data;
}

export async function callFoodRecognition(imageBase64: string) {
  const { data, error } = await supabase.functions.invoke('food-recognition', {
    body: { image: imageBase64 },
    method: 'POST',
  });
  if (error) {
    const msg = await error?.context?.text?.();
    throw new Error(safeErrorMessage(msg || error.message, '识别失败'));
  }
  return data;
}

// ===== 工具函数 =====
export function todayStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return formatDate(d);
}

export function aggregateMealLogs(logs: MealLog[]) {
  return logs.reduce(
    (acc, log) => {
      acc.calories += Number(log.calories) || 0;
      acc.protein += Number(log.protein) || 0;
      acc.carbs += Number(log.carbs) || 0;
      acc.fat += Number(log.fat) || 0;
      return acc;
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );
}

export function groupByMealType(logs: MealLog[]): Record<MealType, MealLog[]> {
  const groups: Record<MealType, MealLog[]> = {
    breakfast: [],
    lunch: [],
    dinner: [],
    snack: [],
  };
  for (const log of logs) {
    const mt = (log.meal_type || 'snack') as MealType;
    if (groups[mt]) groups[mt].push(log);
  }
  return groups;
}

function safeErrorMessage(raw: any, fallback = '服务暂时繁忙，请重试'): string {
  if (!raw) return fallback;
  let text = typeof raw === 'string' ? raw : String(raw?.message || raw);
  try {
    const parsed = JSON.parse(text);
    if (parsed?.error && typeof parsed.error === 'string') {
      text = parsed.error;
    } else if (parsed?.message && typeof parsed.message === 'string') {
      text = parsed.message;
    }
  } catch {
    // not json
  }
  if (text.includes('模型返回解析失败') || (text.includes('{') && text.includes('error'))) {
    return 'AI 助手暂时繁忙，请稍后重试';
  }
  return text || fallback;
}

// ===== AI 食物替代（双网关高可用通道）=====
export async function callFoodSubstitute(params: {
  food: {
    name: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    sugar: number;
    sodium: number;
  };
  filter?: string;
  portion?: string;
}) {
  const { data, error } = await supabase.functions.invoke('food-substitute', {
    body: params,
    method: 'POST',
  });
  if (error) {
    const msg = await error?.context?.text?.();
    throw new Error(safeErrorMessage(msg || error.message, '替代推荐失败'));
  }
  if (data?.error) {
    throw new Error(safeErrorMessage(data.error, '替代推荐失败'));
  }
  return data;
}

// ===== AI 食谱生成（双网关高可用通道）=====
export async function callRecipeGenerate(params: {
  ingredients: string[];
  taste: string;
  meal_type: string;
  calorie_limit: number;
  cook_time: string;
  tools: string[];
  servings: number;
}) {
  const { data, error } = await supabase.functions.invoke('recipe-generate', {
    body: params,
    method: 'POST',
  });
  if (error) {
    const msg = await error?.context?.text?.();
    throw new Error(safeErrorMessage(msg || error.message, '食谱生成失败'));
  }
  if (data?.error) {
    throw new Error(safeErrorMessage(data.error, '食谱生成失败'));
  }
  return data;
}

// ===== AI 包装解读（双网关高可用通道）=====
export async function callPackageScan(imageBase64: string) {
  const { data, error } = await supabase.functions.invoke('package-scan', {
    body: { image: imageBase64 },
    method: 'POST',
  });
  if (error) {
    const msg = await error?.context?.text?.();
    throw new Error(safeErrorMessage(msg || error.message, '包装解读失败'));
  }
  if (data?.error) {
    throw new Error(safeErrorMessage(data.error, '包装解读失败'));
  }
  return data;
}

// ===== 社区AI引擎（双网关高可用通道）=====
export async function callCommunityAI(params: {
  action: 'caption' | 'moderate' | 'comment';
  context?: Record<string, unknown>;
  text?: string;
  post_type?: string;
  summary?: string;
}) {
  const { data, error } = await supabase.functions.invoke('community-ai', {
    body: params,
    method: 'POST',
  });
  if (error) {
    const msg = await error?.context?.text?.();
    throw new Error(safeErrorMessage(msg || error.message, '社区AI服务繁忙'));
  }
  if (data?.error) {
    throw new Error(safeErrorMessage(data.error, '社区AI服务繁忙'));
  }
  return data;
}

// ===== 冰箱盲盒清库与零浪费极速出餐 =====
export async function callFridgeClearance(params: {
  expiring_ingredients: string[];
  regular_ingredients?: string[];
  seasonings?: string[];
  cook_minutes_limit?: number;
  tools?: string[];
  servings?: number;
}) {
  const { data, error } = await supabase.functions.invoke('fridge-clearance', {
    body: params,
    method: 'POST',
  });
  if (error) {
    const msg = await error?.context?.text?.();
    throw new Error(safeErrorMessage(msg || error.message, '清库食谱生成失败'));
  }
  if (data?.error) {
    throw new Error(safeErrorMessage(data.error, '清库食谱生成失败'));
  }
  return data;
}

// ===== 外卖与聚餐避坑军师 =====
export async function callTakeoutAdvisor(params: {
  scene: 'takeout' | 'dining_out' | 'banquet';
  target_cuisine: string;
  menu_text?: string;
  calorie_budget: number;
  dietary_goal: 'lose_fat' | 'gain_muscle' | 'low_carb' | 'low_sodium' | 'balance';
}) {
  const { data, error } = await supabase.functions.invoke('takeout-advisor', {
    body: params,
    method: 'POST',
  });
  if (error) {
    const msg = await error?.context?.text?.();
    throw new Error(safeErrorMessage(msg || error.message, '避坑指南分析失败'));
  }
  if (data?.error) {
    throw new Error(safeErrorMessage(data.error, '避坑指南分析失败'));
  }
  return data;
}

// ===== 动态GL与餐后困倦预警 =====
export async function callGlycemicAdvisor(params: {
  meal_name: string;
  items?: { name: string; carbs: number; amount?: string }[];
  total_carbs: number;
  total_protein?: number;
  total_fat?: number;
}) {
  const { data, error } = await supabase.functions.invoke('glycemic-advisor', {
    body: params,
    method: 'POST',
  });
  if (error) {
    const msg = await error?.context?.text?.();
    throw new Error(safeErrorMessage(msg || error.message, 'GL与困倦评估失败'));
  }
  if (data?.error) {
    throw new Error(safeErrorMessage(data.error, 'GL与困倦评估失败'));
  }
  return data;
}

// ===== AI健康数字分身体态图像生成 (ImageGen Super) =====
export async function callAvatarImageGeneration(prompt: string, size = '1024x1024') {
  const { data, error } = await supabase.functions.invoke('image-generations', {
    body: { prompt, size },
    method: 'POST',
  });
  if (error) {
    const msg = await error?.context?.text?.();
    throw new Error(safeErrorMessage(msg || error.message, '体态生图失败'));
  }
  if (data?.error) {
    throw new Error(safeErrorMessage(data.error, '体态生图失败'));
  }
  return data;
}

// ===== 社区动态 =====
export async function listCommunityPosts(
  tab: string,
  userId: string,
  page = 0,
  pageSize = 15,
  category = 'all'
): Promise<CommunityPost[]> {
  let query = supabase
    .from('community_posts')
    .select('*')
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .range(page * pageSize, (page + 1) * pageSize - 1);
  if (category !== 'all') query = query.eq('type', category);
  if (tab === 'follow') {
    const { data: follows, error: followsError } = await supabase
      .from('community_follows')
      .select('followee_id')
      .eq('follower_id', userId)
      .limit(500);
    if (followsError) throw new Error(followsError.message);
    const ids = (follows || []).map((f: { followee_id: string }) => f.followee_id);
    if (ids.length === 0) return [];
    query = query.in('owner_id', ids);
  }
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return Array.isArray(data) ? (data as CommunityPost[]) : [];
}

export async function listMyPosts(userId: string): Promise<CommunityPost[]> {
  const { data, error } = await supabase
    .from('community_posts')
    .select('*')
    .eq('owner_id', userId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return Array.isArray(data) ? (data as CommunityPost[]) : [];
}

export async function getCommunityPost(id: string): Promise<CommunityPost | null> {
  const { data, error } = await supabase
    .from('community_posts')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as CommunityPost | null;
}

export async function createCommunityPost(post: {
  type: string;
  content: string;
  images: string[];
  data: Record<string, unknown>;
  tags: string[];
  status: string;
  author_name: string;
  author_avatar: string | null;
}): Promise<void> {
  const { error } = await supabase.from('community_posts').insert(post);
  if (error) throw new Error(error.message);
}

export async function deleteCommunityPost(id: string): Promise<void> {
  const { error } = await supabase.from('community_posts').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ===== 社区评论 =====
export async function listComments(postId: string): Promise<CommunityComment[]> {
  const { data, error } = await supabase
    .from('community_comments')
    .select('*')
    .eq('post_id', postId)
    .order('created_at', { ascending: true })
    .limit(200);
  if (error) throw new Error(error.message);
  return Array.isArray(data) ? (data as CommunityComment[]) : [];
}

export async function createComment(postId: string, content: string, authorName: string, authorAvatar: string | null): Promise<void> {
  const { error } = await supabase.from('community_comments').insert({
    post_id: postId,
    content,
    author_name: authorName,
    author_avatar: authorAvatar,
  });
  if (error) throw new Error(error.message);
}

// ===== 点赞 / 收藏 / 关注 =====
export async function isLiked(postId: string, userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('community_likes')
    .select('id')
    .eq('post_id', postId)
    .eq('owner_id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return !!data;
}
export async function toggleLike(postId: string, userId: string): Promise<boolean> {
  const liked = await isLiked(postId, userId);
  if (liked) {
    const { error } = await supabase.from('community_likes').delete().eq('post_id', postId).eq('owner_id', userId);
    if (error) throw new Error(error.message);
    return false;
  }
  const { error } = await supabase.from('community_likes').insert({ post_id: postId });
  if (error) throw new Error(error.message);
  return true;
}
export async function isFavorited(postId: string, userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('community_favorites')
    .select('id')
    .eq('post_id', postId)
    .eq('owner_id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return !!data;
}
export async function toggleFavorite(postId: string, userId: string): Promise<boolean> {
  const fav = await isFavorited(postId, userId);
  if (fav) {
    const { error } = await supabase.from('community_favorites').delete().eq('post_id', postId).eq('owner_id', userId);
    if (error) throw new Error(error.message);
    return false;
  }
  const { error } = await supabase.from('community_favorites').insert({ post_id: postId });
  if (error) throw new Error(error.message);
  return true;
}
export async function isFollowing(followeeId: string, userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('community_follows')
    .select('id')
    .eq('follower_id', userId)
    .eq('followee_id', followeeId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return !!data;
}
export async function toggleFollow(followeeId: string, userId: string): Promise<boolean> {
  const following = await isFollowing(followeeId, userId);
  if (following) {
    const { error } = await supabase.from('community_follows').delete().eq('follower_id', userId).eq('followee_id', followeeId);
    if (error) throw new Error(error.message);
    return false;
  }
  const { error } = await supabase.from('community_follows').insert({ followee_id: followeeId });
  if (error) throw new Error(error.message);
  return true;
}

// ===== 个人食物库 =====
export async function listFoodLibrary(userId: string): Promise<FoodLibraryItem[]> {
  const { data, error } = await supabase
    .from('food_library')
    .select('*')
    .eq('owner_id', userId)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return Array.isArray(data) ? (data as FoodLibraryItem[]) : [];
}
export async function addToFoodLibrary(item: {
  name: string;
  brand?: string | null;
  net_content?: string | null;
  nutrition: Record<string, unknown>;
  ingredients?: string | null;
  advice?: string | null;
  level?: string | null;
  category?: string;
}): Promise<void> {
  const { error } = await supabase.from('food_library').insert(item);
  if (error) throw new Error(error.message);
}
