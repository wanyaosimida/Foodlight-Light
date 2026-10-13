import { useState, useCallback } from 'react';
import { View, Pressable, ScrollView, ActivityIndicator, TextInput, KeyboardAvoidingView, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Sparkles, Plus, X, Clock, Flame, ChefHat, BookmarkPlus, Check } from 'lucide-react-native';
import { callRecipeGenerate, createRecipe } from '@/db/api';
import type { GeneratedRecipe, MealType } from '@/types/types';
import { Text } from '@/components/ui/text';

const TASTES = ['清淡', '咸香', '酸甜', '麻辣', '原味'];
const MEAL_TYPES = [
  { key: 'breakfast', label: '早餐' },
  { key: 'lunch', label: '午餐' },
  { key: 'dinner', label: '晚餐' },
  { key: 'snack', label: '加餐' },
];
const CAL_OPTIONS = [300, 400, 500, 600, 700];
const TIME_OPTIONS = ['不限', '15分钟', '30分钟', '45分钟', '60分钟'];
const TOOLS = ['灶台', '烤箱', '空气炸锅', '微波炉', '电饭煲'];
const QUICK_INGREDIENTS = ['鸡胸肉', '西兰花', '鸡蛋', '番茄', '豆腐', '虾仁', '燕麦', '牛油果'];

export default function RecipeGenerateScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [ingredients, setIngredients] = useState<string[]>([]);
  const [ingInput, setIngInput] = useState('');
  const [taste, setTaste] = useState('清淡');
  const [mealType, setMealType] = useState('lunch');
  const [calLimit, setCalLimit] = useState(450);
  const [cookTime, setCookTime] = useState('30分钟');
  const [tools, setTools] = useState<string[]>(['灶台']);
  const [servings, setServings] = useState(1);
  const [recipes, setRecipes] = useState<GeneratedRecipe[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState<GeneratedRecipe | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  const addIngredient = (name: string) => {
    const t = name.trim();
    if (t && !ingredients.includes(t)) setIngredients((p) => [...p, t]);
    setIngInput('');
  };

  const toggleTool = (t: string) => setTools((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]));

  const run = useCallback(async () => {
    if (ingredients.length === 0) {
      setError('请至少添加一种食材');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await callRecipeGenerate({
        ingredients,
        taste,
        meal_type: mealType,
        calorie_limit: calLimit,
        cook_time: cookTime,
        tools,
        servings,
      });
      setRecipes(res.recipes || []);
    } catch (e) {
      let msg = String((e as Error)?.message || e);
      try {
        const parsed = JSON.parse(msg);
        if (parsed.error) msg = parsed.error;
      } catch {
        // not json
      }
      setError(msg || '食谱生成暂时繁忙，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, [ingredients, taste, mealType, calLimit, cookTime, tools, servings]);

  const saveRecipe = async (r: GeneratedRecipe) => {
    try {
      const recipe = await createRecipe({
        title: r.title,
        description: `难度${r.difficulty}星 · 约${r.cook_minutes}分钟 · ${(r.tags || []).join('、')}`,
        cover_url: null,
        meal_type: mealType as MealType,
        ingredients: r.ingredients,
        steps: r.steps,
        nutrition: { calories: r.calories, protein: r.protein, carbs: r.carbs, fat: r.fat },
        nutritionist_comment: r.tip || null,
        is_ai_generated: true,
        source: 'ai',
      });
      setSavedId(recipe.id);
    } catch (e) {
      setError(String((e as Error)?.message || e));
    }
  };

  const difficultyLabel = (n: number) => ['极易', '简单', '中等', '偏难', '高难'][Math.min(4, Math.max(0, n - 1))];

  return (
    <View className="flex-1 bg-background">
      <KeyboardAvoidingView behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <ScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
        >
          <View className="flex-row items-center px-4 pt-4 pb-2" style={{ paddingTop: insets.top + 8 }}>
            <Pressable onPress={() => router.back()} className="w-10 h-10 items-center justify-center rounded-full active:bg-muted">
              <ArrowLeft size={22} color="#3F3A33" />
            </Pressable>
            <View className="flex-1 items-center">
              <Text className="text-lg font-bold text-foreground">AI 食谱生成</Text>
            </View>
            <View className="w-10" />
          </View>

          {/* 食材 */}
          <Section title="选择食材" icon={<ChefHat size={15} color="#38764A" />}>
            <View className="flex-row items-center gap-2">
              <TextInput
                value={ingInput}
                onChangeText={setIngInput}
                placeholder="输入食材后回车添加"
                placeholderTextColor="#a8a29e"
                className="flex-1 bg-secondary rounded-xl px-4 py-3 text-base text-foreground"
                returnKeyType="done"
                onSubmitEditing={() => addIngredient(ingInput)}
              />
              <Pressable onPress={() => addIngredient(ingInput)} className="w-12 h-12 bg-primary rounded-xl items-center justify-center active:opacity-90">
                <Plus size={20} color="#FFFCF7" />
              </Pressable>
            </View>
            {ingredients.length > 0 ? (
              <View className="flex-row flex-wrap gap-2 mt-3">
                {ingredients.map((i) => (
                  <View key={i} className="flex-row items-center bg-primary/15 rounded-full pl-3 pr-1.5 py-1.5">
                    <Text className="text-sm text-primary font-medium mr-1">{i}</Text>
                    <Pressable onPress={() => setIngredients((p) => p.filter((x) => x !== i))} className="w-5 h-5 items-center justify-center rounded-full active:bg-primary/30">
                      <X size={13} color="#38764A" />
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : null}
            <View className="flex-row flex-wrap gap-2 mt-3">
              {QUICK_INGREDIENTS.map((q) => (
                <Pressable key={q} onPress={() => addIngredient(q)} className="bg-secondary rounded-full px-3 py-1.5 active:bg-accent/20">
                  <Text className="text-xs text-secondary-foreground">+ {q}</Text>
                </Pressable>
              ))}
            </View>
          </Section>

          {/* 口味 */}
          <Section title="口味偏好">
            <ChipRow options={TASTES} value={taste} onChange={setTaste} />
          </Section>

          {/* 餐次 */}
          <Section title="餐次">
            <ChipRow options={MEAL_TYPES.map((m) => m.label)} values={MEAL_TYPES.map((m) => m.key)} value={mealType} onChange={setMealType} />
          </Section>

          {/* 热量上限 */}
          <Section title="单份热量上限（千卡）">
            <ChipRow options={CAL_OPTIONS.map(String)} values={CAL_OPTIONS.map(String)} value={String(calLimit)} onChange={(v) => setCalLimit(Number(v))} />
          </Section>

          {/* 烹饪时间 */}
          <Section title="烹饪时间">
            <ChipRow options={TIME_OPTIONS} value={cookTime} onChange={setCookTime} />
          </Section>

          {/* 厨具 */}
          <Section title="可用厨具">
            <View className="flex-row flex-wrap gap-2">
              {TOOLS.map((t) => (
                <Pressable
                  key={t}
                  onPress={() => toggleTool(t)}
                  className={`rounded-full px-4 py-2 ${tools.includes(t) ? 'bg-primary' : 'bg-secondary'}`}
                >
                  <Text className={`text-sm ${tools.includes(t) ? 'text-primary-foreground font-semibold' : 'text-secondary-foreground'}`}>{t}</Text>
                </Pressable>
              ))}
            </View>
          </Section>

          {/* 人数 */}
          <Section title="用餐人数">
            <View className="flex-row items-center gap-4">
              <Pressable onPress={() => setServings((p) => Math.max(1, p - 1))} className="w-11 h-11 bg-secondary rounded-xl items-center justify-center active:bg-muted">
                <Text className="text-xl font-bold text-foreground">-</Text>
              </Pressable>
              <Text className="text-lg font-bold text-foreground w-8 text-center">{servings}</Text>
              <Pressable onPress={() => setServings((p) => Math.min(10, p + 1))} className="w-11 h-11 bg-secondary rounded-xl items-center justify-center active:bg-muted">
                <Text className="text-xl font-bold text-foreground">+</Text>
              </Pressable>
              <Text className="text-sm text-muted-foreground ml-1">人</Text>
            </View>
          </Section>

          {/* 生成按钮 */}
          <View className="mx-4 mt-2">
            <Pressable onPress={run} disabled={loading} className="bg-primary rounded-xl py-4 items-center flex-row justify-center gap-2 active:opacity-90">
              {loading ? (
                <ActivityIndicator color="#FFFCF7" />
              ) : (
                <>
                  <Sparkles size={18} color="#FFFCF7" />
                  <Text className="text-base font-semibold text-primary-foreground">{loading ? 'AI 烹饪中...' : '生成健康食谱方案'}</Text>
                </>
              )}
            </Pressable>
            {error ? <Text className="text-destructive text-sm mt-2 text-center">{error}</Text> : null}
          </View>

          {/* 结果 */}
          {recipes.length > 0 ? (
            <View className="mt-5">
              <Text className="px-4 text-base font-bold text-foreground mb-3">为你生成 {recipes.length} 个方案</Text>
              {recipes.map((r, idx) => (
                <View key={idx} className="mx-4 mb-3 bg-card rounded-2xl p-4 border border-border" style={{ borderCurve: 'continuous' }}>
                  <View className="flex-row items-start justify-between">
                    <View className="flex-1 pr-2">
                      <Text className="text-base font-bold text-foreground">{r.title}</Text>
                      <View className="flex-row items-center gap-3 mt-2">
                        <View className="flex-row items-center gap-1">
                          <Flame size={13} color="#D97724" />
                          <Text className="text-xs text-muted-foreground">{r.calories} kcal</Text>
                        </View>
                        <View className="flex-row items-center gap-1">
                          <Clock size={13} color="#38764A" />
                          <Text className="text-xs text-muted-foreground">{r.cook_minutes} 分钟</Text>
                        </View>
                        <Text className="text-xs text-muted-foreground">{difficultyLabel(r.difficulty)}</Text>
                      </View>
                    </View>
                  </View>
                  <View className="flex-row gap-2 mt-3">
                    <Macro label="蛋白" value={r.protein} />
                    <Macro label="碳水" value={r.carbs} />
                    <Macro label="脂肪" value={r.fat} />
                  </View>
                  <View className="flex-row flex-wrap gap-1.5 mt-3">
                    {r.tags.map((t) => (
                      <View key={t} className="bg-accent/15 rounded px-2 py-0.5">
                        <Text className="text-[10px] text-accent font-medium">{t}</Text>
                      </View>
                    ))}
                  </View>
                  <View className="flex-row gap-3 mt-3">
                    <Pressable onPress={() => setDetail(r)} className="flex-1 bg-secondary rounded-xl py-3 items-center active:bg-muted">
                      <Text className="text-sm font-semibold text-secondary-foreground">查看做法</Text>
                    </Pressable>
                    <Pressable onPress={() => saveRecipe(r)} className="flex-1 bg-primary rounded-xl py-3 items-center flex-row justify-center gap-1.5 active:opacity-90">
                      {savedId ? <Check size={16} color="#FFFCF7" /> : <BookmarkPlus size={16} color="#FFFCF7" />}
                      <Text className="text-sm font-semibold text-primary-foreground">{savedId ? '已加入食谱' : '加入饮食计划'}</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* 食谱详情 Modal */}
      <Modal visible={!!detail} animationType="slide" transparent onRequestClose={() => setDetail(null)}>
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-background rounded-t-3xl max-h-[85%]" style={{ paddingBottom: insets.bottom + 16 }}>
            <View className="items-center pt-3">
              <View className="w-10 h-1 bg-muted rounded-full" />
            </View>
            <ScrollView className="px-5 pt-3">
              {detail ? (
                <>
                  <Text className="text-xl font-bold text-foreground">{detail.title}</Text>
                  <View className="flex-row items-center gap-4 mt-2">
                    <Text className="text-sm text-muted-foreground">热量 {detail.calories} kcal</Text>
                    <Text className="text-sm text-muted-foreground">蛋白 {detail.protein}g</Text>
                    <Text className="text-sm text-muted-foreground">碳水 {detail.carbs}g</Text>
                    <Text className="text-sm text-muted-foreground">脂肪 {detail.fat}g</Text>
                  </View>
                  <Text className="text-base font-bold text-foreground mt-5 mb-2">食材清单</Text>
                  {detail.ingredients.map((ing, i) => (
                    <View key={i} className="flex-row justify-between py-2 border-b border-border">
                      <Text className="text-sm text-foreground">{ing.name}</Text>
                      <Text className="text-sm text-muted-foreground">{ing.amount}</Text>
                    </View>
                  ))}
                  <Text className="text-base font-bold text-foreground mt-5 mb-2">烹饪步骤</Text>
                  {detail.steps.map((s, i) => (
                    <View key={i} className="flex-row gap-3 mb-3">
                      <View className="w-6 h-6 rounded-full bg-primary items-center justify-center mt-0.5">
                        <Text className="text-[11px] font-bold text-primary-foreground">{i + 1}</Text>
                      </View>
                      <View className="flex-1">
                        <Text className="text-sm text-foreground leading-5">{s.text}</Text>
                        {s.time ? <Text className="text-xs text-muted-foreground mt-0.5">{s.time}</Text> : null}
                      </View>
                    </View>
                  ))}
                  {detail.tip ? (
                    <View className="bg-accent/10 rounded-xl p-3 mt-2 mb-4">
                      <Text className="text-xs text-accent leading-5">💡 {detail.tip}</Text>
                    </View>
                  ) : null}
                </>
              ) : null}
            </ScrollView>
            <View className="px-5 pt-3">
              <Pressable onPress={() => setDetail(null)} className="bg-primary rounded-xl py-3.5 items-center active:opacity-90">
                <Text className="text-base font-semibold text-primary-foreground">关闭</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <View className="mx-4 mt-3 bg-card rounded-2xl p-4 border border-border" style={{ borderCurve: 'continuous' }}>
      <View className="flex-row items-center gap-1.5 mb-3">
        {icon}
        <Text className="text-sm font-semibold text-foreground">{title}</Text>
      </View>
      {children}
    </View>
  );
}

function ChipRow({ options, values, value, onChange }: { options: string[]; values?: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <View className="flex-row flex-wrap gap-2">
      {options.map((opt, i) => {
        const v = values ? values[i] : opt;
        const active = value === v;
        return (
          <Pressable key={opt} onPress={() => onChange(v)} className={`rounded-full px-4 py-2 ${active ? 'bg-primary' : 'bg-secondary'}`}>
            <Text className={`text-sm ${active ? 'text-primary-foreground font-semibold' : 'text-secondary-foreground'}`}>{opt}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Macro({ label, value }: { label: string; value: number }) {
  return (
    <View className="flex-1 bg-secondary/60 rounded-xl py-2 items-center">
      <Text className="text-[10px] text-muted-foreground">{label}</Text>
      <Text className="text-sm font-bold text-foreground">{value}g</Text>
    </View>
  );
}