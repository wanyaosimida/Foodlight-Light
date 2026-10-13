export type UserRole = 'user' | 'admin';
export type Gender = 'male' | 'female';
export type ActivityLevel = 'low' | 'medium' | 'high';
export type Goal = 'lose_fat' | 'gain_muscle' | 'balance' | 'control_sugar';
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export type RecipeSource = 'ai' | 'custom';

export interface Profile {
  id: string;
  email: string | null;
  phone: string | null;
  role: UserRole;
  nickname: string | null;
  avatar_url: string | null;
  gender: Gender | null;
  age: number | null;
  height_cm: number | null;
  weight_kg: number | null;
  activity_level: ActivityLevel | null;
  goal: Goal | null;
  allergies: string | null;
  created_at: string;
  updated_at: string;
}

export interface Ingredient {
  name: string;
  amount: string;
}

export interface RecipeNutrition {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface RecipeStep {
  text: string;
  image_url?: string;
}

export interface Recipe {
  id: string;
  owner_id: string;
  title: string;
  description: string | null;
  cover_url: string | null;
  meal_type: MealType | null;
  ingredients: Ingredient[];
  steps: RecipeStep[];
  nutrition: RecipeNutrition;
  nutritionist_comment: string | null;
  is_ai_generated: boolean;
  source: RecipeSource;
  created_at: string;
  updated_at: string;
}

export interface MealLog {
  id: string;
  owner_id: string;
  log_date: string;
  meal_type: MealType | null;
  food_name: string;
  portion: string | null;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  gl_value?: number | null;
  image_url: string | null;
  recipe_id: string | null;
  created_at: string;
}

export interface WeightLog {
  id: string;
  owner_id: string;
  log_date: string;
  weight_kg: number;
  created_at: string;
}

export interface DailySummary {
  date: string;
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
}

// AI 生成的食谱结构
export interface AiMealPlan {
  breakfast: AiMeal;
  lunch: AiMeal;
  dinner: AiMeal;
  snack: AiMeal;
  comment: string;
}

export interface AiMeal {
  title: string;
  ingredients: Ingredient[];
  steps: string[];
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface RecognizedFood {
  name: string;
  portion: string;
  weight_g?: number;
  cooking_method?: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  verified?: boolean;
}

export const GOAL_LABELS: Record<Goal, string> = {
  lose_fat: '减脂',
  gain_muscle: '增肌',
  balance: '均衡',
  control_sugar: '控糖',
};

export const MEAL_TYPE_LABELS: Record<MealType, string> = {
  breakfast: '早餐',
  lunch: '午餐',
  dinner: '晚餐',
  snack: '加餐',
};

export const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  low: '久坐少动',
  medium: '中等活动',
  high: '高强度运动',
};

// 营养素分配比例
export const MACRO_RATIOS: Record<Goal, { carbs: number; protein: number; fat: number }> = {
  lose_fat: { carbs: 0.4, protein: 0.35, fat: 0.25 },
  gain_muscle: { carbs: 0.5, protein: 0.3, fat: 0.2 },
  balance: { carbs: 0.5, protein: 0.2, fat: 0.3 },
  control_sugar: { carbs: 0.35, protein: 0.35, fat: 0.3 },
};

// 蛋白质/碳水/脂肪 每克热量
export const KCAL_PER_GRAM = { protein: 4, carbs: 4, fat: 9 };

// ===== AI 食物替代 =====
export interface SubstituteItem {
  name: string;
  category: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  sugar: number;
  sodium: number;
  similarity: number;
  health_score: number;
  reason: string;
  portion: string;
}
export interface SubstituteResult {
  analysis: string;
  items: SubstituteItem[];
}

// ===== AI 食谱生成 =====
export interface GeneratedIngredient {
  name: string;
  amount: string;
}
export interface GeneratedStep {
  text: string;
  time: string;
}
export interface GeneratedRecipe {
  title: string;
  ingredients: GeneratedIngredient[];
  steps: GeneratedStep[];
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  difficulty: number;
  cook_minutes: number;
  tags: string[];
  tip: string;
}

// ===== AI 食品包装解读 =====
export interface PackageNutrition {
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  sugar: number;
  sodium: number;
  fiber: number;
}
export interface PackageResult {
  product_name: string;
  brand: string;
  net_content: string;
  nutrition: PackageNutrition;
  ingredients: string;
  risk_points: string[];
  level: string;
  advice: string;
  translations: string[];
  alternatives: { name: string; calories: number }[];
}

// ===== 美食社区 =====
export type PostType = 'meal' | 'progress' | 'recipe' | 'workout' | 'talk';
export interface CommunityPost {
  id: string;
  owner_id: string;
  type: PostType;
  content: string;
  images: string[];
  data: Record<string, unknown>;
  tags: string[];
  status: string;
  author_name: string;
  author_avatar: string | null;
  like_count: number;
  comment_count: number;
  favorite_count: number;
  created_at: string;
}
export interface CommunityComment {
  id: string;
  post_id: string;
  owner_id: string;
  content: string;
  author_name: string;
  author_avatar: string | null;
  created_at: string;
}
export interface FoodLibraryItem {
  id: string;
  owner_id: string;
  name: string;
  brand: string | null;
  net_content: string | null;
  nutrition: PackageNutrition;
  ingredients: string | null;
  advice: string | null;
  level: string | null;
  category: string;
  created_at: string;
}

export const POST_TYPE_LABELS: Record<PostType, string> = {
  meal: '美食打卡',
  progress: '减肥进度',
  recipe: '减脂餐教程',
  workout: '运动打卡',
  talk: '健康心得',
};