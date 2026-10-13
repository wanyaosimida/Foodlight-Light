import { useState, useCallback } from 'react';
import { View, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Sparkles, Search, ChevronRight, Flame, Beef, Wheat, Droplet, Save } from 'lucide-react-native';
import {
  getProfile,
  callDeepSeekRecipe,
  callBaiduNutrition,
  createRecipe,
  calcBMR,
  calcTDEE,
  calcDailyTarget,
} from '@/db/api';
import { useSession } from '@/ctx';
import type { Profile, AiMealPlan, AiMeal, MealType } from '@/types/types';
import { GOAL_LABELS, MEAL_TYPE_LABELS } from '@/types/types';
import { PageHeader } from '@/components/PageHeader';
import { Text } from '@/components/ui/text';
import { isLocalBackend } from '@/client/supabase';

const MEAL_KEYS: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

type LocalNutritionReference = {
  id: string;
  title: string;
  source: string;
  source_label: string;
  record_date: string | null;
  basis: string;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
};

export default function MealGeneratorScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useSession();
  const userId = session?.user?.id;

  const [profile, setProfile] = useState<Profile | null>(null);
  const [plan, setPlan] = useState<AiMealPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyText, setVerifyText] = useState('');
  const [verifyState, setVerifyState] = useState<'idle' | 'found' | 'empty' | 'error'>('idle');
  const [references, setReferences] = useState<LocalNutritionReference[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useFocusEffect(useCallback(() => {
    if (userId && !profile) {
      getProfile(userId).then(setProfile).catch(console.error);
    }
  }, [userId, profile]));

  const canGenerate = profile?.age && profile?.height_cm && profile?.weight_kg;

  const handleGenerate = async () => {
    if (!canGenerate || !userId) return;
    setLoading(true);
    setError('');
    setPlan(null);
    setVerifyText('');
    setVerifyState('idle');
    setReferences([]);
    try {
      const bmr = calcBMR(profile!.gender!, Number(profile!.weight_kg), Number(profile!.height_cm), Number(profile!.age));
      const tdee = calcTDEE(bmr, profile!.activity_level || 'medium');
      const res = await callDeepSeekRecipe({
        goal: profile!.goal || 'balance',
        gender: profile!.gender!,
        age: Number(profile!.age),
        height_cm: Number(profile!.height_cm),
        weight_kg: Number(profile!.weight_kg),
        activity_level: profile!.activity_level || 'medium',
        allergies: profile!.allergies || '',
        tdee: Math.round(tdee),
      });
      if (res?.recipe) {
        setPlan(res.recipe);
      } else {
        setError('生成失败，请重试');
      }
    } catch (e) {
      setError(String((e as Error).message || e));
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!plan) return;
    setVerifying(true);
    setVerifyText(isLocalBackend ? '正在查找本地营养记录...' : '正在检索营养参考数据...');
    setReferences([]);
    try {
      // Search only for the first dish; finding a source is not independent verification.
      const firstMeal = plan.breakfast;
      const res = await callBaiduNutrition(firstMeal.title);
      const results = Array.isArray(res?.results) ? res.results : [];
      if (results.length > 0) {
        setVerifyState('found');
        if (res?.source === 'local-records') {
          setReferences(results);
          setVerifyText(`找到 ${results.length} 条与「${firstMeal.title}」相关的本地记录。以下数值保留原始份量，仅供参考；当前生成食谱的营养值仍为估计值。`);
        } else {
          setVerifyText(`找到「${firstMeal.title}」的 ${results.length} 条参考信息；当前食谱的营养值仍为估计值，尚未完成独立核验。`);
        }
      } else {
        setVerifyState('empty');
        setVerifyText(isLocalBackend ? `没有找到与「${firstMeal.title}」匹配的本地记录，当前营养值仍为估计值。` : '暂无匹配的营养参考信息，当前营养值仍为估计值。');
      }
    } catch (e) {
      setVerifyState('error');
      setVerifyText(`${(e as Error).message || '营养参考检索失败'}。当前营养值仍为估计值。`);
    } finally {
      setVerifying(false);
    }
  };

  const handleSave = async (meal: AiMeal, mealType: MealType) => {
    if (!userId) return;
    setSaving(true);
    try {
      await createRecipe({
        title: meal.title,
        description: null,
        cover_url: null,
        meal_type: mealType,
        ingredients: meal.ingredients || [],
        steps: (meal.steps || []).map((s) => ({ text: s })),
        nutrition: {
          calories: meal.calories || 0,
          protein: meal.protein || 0,
          carbs: meal.carbs || 0,
          fat: meal.fat || 0,
        },
        nutritionist_comment: plan?.comment || null,
        is_ai_generated: true,
        source: 'ai',
      });
      router.push('/(app)/(tabs)/workshop');
    } catch (e) {
      setError(String((e as Error).message || e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View className="flex-1 bg-background">
      <PageHeader title="智能膳食生成" subtitle="AI为你定制一日三餐" />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
        {!canGenerate ? (
          <View className="px-6 mt-8 items-center">
            <View className="w-16 h-16 rounded-2xl bg-secondary items-center justify-center mb-4">
              <Sparkles size={30} color="#38764A" />
            </View>
            <Text className="text-base text-foreground font-semibold mb-2">先完善健康信息</Text>
            <Text className="text-sm text-muted-foreground text-center mb-6">
              填写你的身体数据与目标，AI 才能为你生成个性化食谱
            </Text>
            <Pressable
              onPress={() => router.push('/(app)/onboarding')}
              className="bg-primary rounded-2xl px-8 h-12 items-center justify-center active:opacity-90"
              style={{ borderCurve: 'continuous' }}
            >
              <Text className="text-primary-foreground font-semibold">去完善信息</Text>
            </Pressable>
          </View>
        ) : (
          <View className="px-5">
            {/* 当前偏好概览 */}
            <View
              className="bg-card rounded-2xl p-4 border border-border mb-4"
              style={{ borderCurve: 'continuous' }}
            >
              <View className="flex-row items-center justify-between">
                <Text className="text-sm text-muted-foreground">当前目标</Text>
                <Text className="text-sm font-semibold text-primary">
                  {profile?.goal ? GOAL_LABELS[profile.goal] : '均衡'}
                </Text>
              </View>
              <View className="flex-row gap-4 mt-2">
                <Text className="text-xs text-muted-foreground">
                  {profile?.gender === 'male' ? '男' : '女'} · {profile?.age}岁
                </Text>
                <Text className="text-xs text-muted-foreground">{profile?.height_cm}cm</Text>
                <Text className="text-xs text-muted-foreground">{profile?.weight_kg}kg</Text>
                {profile?.allergies ? (
                  <Text className="text-xs text-destructive" numberOfLines={1}>
                    忌口: {profile.allergies}
                  </Text>
                ) : null}
              </View>
            </View>

            {!plan && (
              <Pressable
                onPress={handleGenerate}
                disabled={loading}
                className="bg-primary rounded-2xl h-14 items-center justify-center active:opacity-90 mb-4"
                style={{ borderCurve: 'continuous' }}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <View className="flex-row items-center">
                    <Sparkles size={20} color="#fff" />
                    <Text className="text-primary-foreground text-lg font-semibold ml-2">
                      生成今日食谱
                    </Text>
                  </View>
                )}
              </Pressable>
            )}

            {error ? <Text className="text-destructive text-sm mb-4">{error}</Text> : null}

            {plan && (
              <View className="gap-4">
                {/* 营养师点评 */}
                {plan.comment ? (
                  <View
                    className="bg-secondary rounded-2xl p-4 border border-border"
                    style={{ borderCurve: 'continuous' }}
                  >
                    <Text className="text-xs font-semibold text-secondary-foreground mb-1">
                      营养师点评
                    </Text>
                    <Text className="text-sm text-secondary-foreground leading-5">
                      {plan.comment}
                    </Text>
                  </View>
                ) : null}

                {/* 营养参考 */}
                <Pressable
                  onPress={handleVerify}
                  disabled={verifying}
                  className="bg-card rounded-2xl p-4 border border-border flex-row items-center active:bg-muted"
                  style={{ borderCurve: 'continuous' }}
                >
                  <Search size={18} color="#38764A" />
                  <Text className="flex-1 text-sm text-foreground ml-3">
                    {verifying ? verifyText : isLocalBackend ? '本地营养记录参考' : '检索营养参考数据'}
                  </Text>
                  {!verifying && verifyText ? (
                    <Text className="text-xs text-primary" numberOfLines={1}>
                      {verifyState === 'found' ? '找到参考' : verifyState === 'empty' ? '暂无匹配' : '查询失败'}
                    </Text>
                  ) : null}
                </Pressable>
                {verifyText && !verifying ? (
                  <Text className="text-xs text-muted-foreground -mt-2">{verifyText}</Text>
                ) : null}
                {!verifying && references.map((item) => (
                  <View key={`${item.source}:${item.id}`} className="bg-secondary rounded-xl p-3 gap-1">
                    <Text className="text-sm font-medium text-foreground">{item.title} · 原记录估计值</Text>
                    <Text className="text-xs text-muted-foreground">{item.source_label}{item.record_date ? ` · ${item.record_date}` : ''}</Text>
                    <Text className="text-xs text-muted-foreground">{item.basis}，未统一换算为每100克</Text>
                    <Text className="text-xs text-foreground">热量 {item.calories ?? '未记录'} 千卡 · 蛋白 {item.protein ?? '未记录'} g · 碳水 {item.carbs ?? '未记录'} g · 脂肪 {item.fat ?? '未记录'} g</Text>
                  </View>
                ))}

                {/* 三餐卡片 */}
                {MEAL_KEYS.map((mt) => {
                  const meal = plan[mt] as AiMeal | undefined;
                  if (!meal) return null;
                  return (
                    <View
                      key={mt}
                      className="bg-card rounded-2xl p-4 border border-border"
                      style={{ borderCurve: 'continuous' }}
                    >
                      <View className="flex-row items-center justify-between mb-2">
                        <Text className="text-sm font-bold text-foreground">
                          {MEAL_TYPE_LABELS[mt]} · {meal.title}
                        </Text>
                        <Pressable
                          onPress={() => handleSave(meal, mt)}
                          disabled={saving}
                          className="flex-row items-center bg-secondary rounded-lg px-3 py-1.5 active:opacity-80"
                        >
                          <Save size={14} color="#38764A" />
                          <Text className="text-xs text-primary font-medium ml-1">存入工坊</Text>
                        </Pressable>
                      </View>

                      <View className="flex-row gap-3 mb-3">
                        <MacroChip icon={Flame} value={meal.calories} unit="千卡" color="#D97724" />
                        <MacroChip icon={Beef} value={meal.protein} unit="g蛋白" color="#D97724" />
                        <MacroChip icon={Wheat} value={meal.carbs} unit="g碳水" color="#38764A" />
                        <MacroChip icon={Droplet} value={meal.fat} unit="g脂肪" color="#7c5cbf" />
                      </View>
                      <Text className="text-[10px] text-muted-foreground mb-3">以上营养数值为 AI 估计，仅供参考</Text>

                      <Text className="text-xs font-semibold text-muted-foreground mb-1">食材</Text>
                      <View className="flex-row flex-wrap gap-1.5 mb-3">
                        {(meal.ingredients || []).map((ing, idx) => (
                          <View key={idx} className="bg-muted rounded-lg px-2 py-1">
                            <Text className="text-xs text-foreground">
                              {ing.name}
                              {ing.amount ? ` ${ing.amount}` : ''}
                            </Text>
                          </View>
                        ))}
                      </View>

                      <Text className="text-xs font-semibold text-muted-foreground mb-1">步骤</Text>
                      {(meal.steps || []).map((step, idx) => (
                        <View key={idx} className="flex-row mb-1">
                          <Text className="text-xs font-bold text-primary mr-2">{idx + 1}.</Text>
                          <Text className="flex-1 text-xs text-foreground leading-5">{step}</Text>
                        </View>
                      ))}
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function MacroChip({
  icon: Icon,
  value,
  unit,
  color,
}: {
  icon: typeof Flame;
  value: number;
  unit: string;
  color: string;
}) {
  return (
    <View className="flex-row items-center bg-muted rounded-lg px-2 py-1">
      <Icon size={12} color={color} />
      <Text className="text-xs text-foreground ml-1">
        {value}
        <Text className="text-muted-foreground"> {unit}</Text>
      </Text>
    </View>
  );
}
