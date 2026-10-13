import { useState, useCallback } from 'react';
import { View, Pressable, ScrollView, ActivityIndicator, TextInput, KeyboardAvoidingView } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Sparkles, Heart, Star, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react-native';
import { callFoodSubstitute } from '@/db/api';
import type { SubstituteResult, SubstituteItem } from '@/types/types';
import { Text } from '@/components/ui/text';

const FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'low_cal', label: '低卡' },
  { key: 'low_fat', label: '低脂' },
  { key: 'low_sugar', label: '低糖' },
  { key: 'low_sodium', label: '低钠' },
  { key: 'high_protein', label: '高蛋白' },
];

const QUICK_FOODS = ['炸鸡', '奶茶', '薯片', '可乐', '蛋糕', '方便面', '油条', '冰淇淋'];

const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n);

interface FoodInput {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  sugar: number;
  sodium: number;
}

const DEFAULT_FOOD: FoodInput = {
  name: '炸鸡',
  calories: 320,
  protein: 18,
  carbs: 20,
  fat: 22,
  sugar: 2,
  sodium: 680,
};

export default function FoodSubstituteScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ name?: string; calories?: string; protein?: string; carbs?: string; fat?: string; sugar?: string; sodium?: string; portion?: string }>();

  const initialFood: FoodInput = params.name
    ? {
        name: String(params.name),
        calories: Number(params.calories) || 0,
        protein: Number(params.protein) || 0,
        carbs: Number(params.carbs) || 0,
        fat: Number(params.fat) || 0,
        sugar: Number(params.sugar) || 0,
        sodium: Number(params.sodium) || 0,
      }
    : DEFAULT_FOOD;

  const [food, setFood] = useState<FoodInput>(initialFood);
  const [filter, setFilter] = useState('all');
  const [result, setResult] = useState<SubstituteResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<number | null>(null);

  const run = useCallback(async () => {
    if (!food.name.trim()) {
      setError('请输入食物名称');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await callFoodSubstitute({
        food: {
          name: food.name.trim(),
          calories: food.calories || 0,
          protein: food.protein || 0,
          carbs: food.carbs || 0,
          fat: food.fat || 0,
          sugar: food.sugar || 0,
          sodium: food.sodium || 0,
        },
        filter,
        portion: params.portion || '100g',
      });
      setResult(res);
    } catch (e) {
      let msg = String((e as Error)?.message || e);
      try {
        const parsed = JSON.parse(msg);
        if (parsed.error) msg = parsed.error;
      } catch {
        // not json
      }
      if (msg.includes('模型返回解析失败') || msg.includes('{"error"')) {
        msg = '健康替代生成暂时繁忙，请点击重试';
      }
      setError(msg || '健康替代方案获取失败，请重试');
    } finally {
      setLoading(false);
    }
  }, [food, filter, params.portion]);

  const filteredItems = result?.items?.filter((i) => filter === 'all' || i.category?.includes(FILTERS.find((f) => f.key === filter)?.label || '')) || [];

  const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n);

  return (
    <View className="flex-1 bg-background">
      <KeyboardAvoidingView behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <ScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
        >
          {/* 顶部导航 */}
          <View className="flex-row items-center px-4 pt-4 pb-2" style={{ paddingTop: insets.top + 8 }}>
            <Pressable onPress={() => router.back()} className="w-10 h-10 items-center justify-center rounded-full active:bg-muted">
              <ArrowLeft size={22} color="#3F3A33" />
            </Pressable>
            <View className="flex-1 items-center">
              <Text className="text-lg font-bold text-foreground">AI 健康替代</Text>
            </View>
            <View className="w-10" />
          </View>

          {/* 食物输入区 */}
          <View className="mx-4 mt-2 bg-card rounded-2xl p-4 border border-border" style={{ borderCurve: 'continuous' }}>
            <View className="flex-row items-center gap-2 mb-3">
              <Sparkles size={16} color="#D97724" />
              <Text className="text-base font-semibold text-foreground">输入你想替代的食物</Text>
            </View>
            <TextInput
              value={food.name}
              onChangeText={(t) => setFood((p) => ({ ...p, name: t }))}
              placeholder="如：炸鸡、奶茶、薯片"
              placeholderTextColor="#a8a29e"
              className="bg-secondary rounded-xl px-4 py-3 text-base text-foreground"
              returnKeyType="search"
              onSubmitEditing={run}
            />
            <View className="flex-row flex-wrap gap-2 mt-3">
              {QUICK_FOODS.map((q) => (
                <Pressable
                  key={q}
                  onPress={() => setFood((p) => ({ ...p, name: q }))}
                  className="bg-secondary rounded-full px-3 py-1.5 active:bg-accent/20"
                >
                  <Text className="text-xs text-secondary-foreground">{q}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable
              onPress={run}
              disabled={loading}
              className="mt-4 bg-primary rounded-xl py-3.5 items-center flex-row justify-center gap-2 active:opacity-90"
            >
              {loading ? (
                <ActivityIndicator color="#FFFCF7" />
              ) : (
                <>
                  <Sparkles size={18} color="#FFFCF7" />
                  <Text className="text-base font-semibold text-primary-foreground">{loading ? 'AI 分析中...' : '生成健康替代方案'}</Text>
                </>
              )}
            </Pressable>
            {error ? <Text className="text-destructive text-sm mt-2 text-center">{error}</Text> : null}
          </View>

          {/* 结果区 */}
          {result ? (
            <View className="mt-4">
              {/* 原食物卡片 */}
              <View className="mx-4 bg-muted/60 rounded-2xl p-4 border border-border" style={{ borderCurve: 'continuous' }}>
                <View className="flex-row items-center gap-2 mb-2">
                  <View className="bg-destructive/15 rounded px-2 py-0.5">
                    <Text className="text-[10px] text-destructive font-semibold">原选择</Text>
                  </View>
                  <Text className="text-base font-semibold text-foreground">{food.name}</Text>
                </View>
                <View className="flex-row gap-4">
                  <Metric label="热量" value={`${food.calories}`} unit="kcal" />
                  <Metric label="脂肪" value={`${food.fat}`} unit="g" />
                  <Metric label="糖" value={`${food.sugar}`} unit="g" />
                  <Metric label="钠" value={`${food.sodium}`} unit="mg" />
                </View>
                <Text className="text-xs text-muted-foreground mt-3 leading-5">{result.analysis}</Text>
              </View>

              {/* 筛选条 */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingVertical: 12 }}>
                {FILTERS.map((f) => (
                  <Pressable
                    key={f.key}
                    onPress={() => setFilter(f.key)}
                    className={`rounded-full px-4 py-2 ${filter === f.key ? 'bg-primary' : 'bg-secondary'}`}
                  >
                    <Text className={`text-sm ${filter === f.key ? 'text-primary-foreground font-semibold' : 'text-secondary-foreground'}`}>{f.label}</Text>
                  </Pressable>
                ))}
              </ScrollView>

              {/* 替代列表 */}
              {filteredItems.length === 0 ? (
                <View className="mx-4 bg-card rounded-2xl p-6 items-center border border-border">
                  <Text className="text-sm text-muted-foreground">暂未找到符合该筛选的健康替代，试试「全部」</Text>
                </View>
              ) : (
                filteredItems.map((item, idx) => (
                  <SubstituteCard
                    key={idx}
                    item={item}
                    original={food}
                    expanded={expanded === idx}
                    onToggle={() => setExpanded(expanded === idx ? null : idx)}
                    onReplace={() => router.back()}
                  />
                ))
              )}
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function Metric({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <View className="flex-1">
      <Text className="text-[10px] text-muted-foreground">{label}</Text>
      <View className="flex-row items-baseline gap-0.5">
        <Text className="text-base font-bold text-foreground">{value}</Text>
        <Text className="text-[10px] text-muted-foreground">{unit}</Text>
      </View>
    </View>
  );
}

function SubstituteCard({
  item,
  original,
  expanded,
  onToggle,
  onReplace,
}: {
  item: SubstituteItem;
  original: FoodInput;
  expanded: boolean;
  onToggle: () => void;
  onReplace: () => void;
}) {
  const diff = (a: number, b: number) => Math.round(a - b);
  return (
    <View className="mx-4 mb-3 bg-card rounded-2xl p-4 border border-border" style={{ borderCurve: 'continuous' }}>
      <View className="flex-row items-start justify-between">
        <View className="flex-1 pr-2">
          <View className="flex-row items-center gap-2 flex-wrap">
            <Text className="text-base font-bold text-foreground">{item.name}</Text>
            <View className="bg-primary/15 rounded px-1.5 py-0.5">
              <Text className="text-[10px] text-primary font-semibold">口感相似 {item.similarity}%</Text>
            </View>
          </View>
          <Text className="text-xs text-amber-600 mt-1">{stars(item.health_score)}</Text>
        </View>
        <View className="bg-accent/15 rounded px-2 py-1">
          <Text className="text-[10px] text-accent font-semibold">{item.category}</Text>
        </View>
      </View>

      {/* 对比数据 */}
      <View className="flex-row mt-3 bg-secondary/60 rounded-xl p-3">
        <CompareCell label="热量" orig={original.calories} alt={item.calories} unit="kcal" />
        <CompareCell label="脂肪" orig={original.fat} alt={item.fat} unit="g" />
        <CompareCell label="糖" orig={original.sugar} alt={item.sugar} unit="g" />
        <CompareCell label="钠" orig={original.sodium} alt={item.sodium} unit="mg" />
      </View>

      <Text className="text-xs text-muted-foreground mt-3 leading-5">{item.reason}</Text>

      <Pressable onPress={onToggle} className="flex-row items-center mt-2 active:opacity-60">
        <Text className="text-xs text-primary font-medium">{expanded ? '收起推荐理由' : '为什么推荐这个？'}</Text>
        {expanded ? <ChevronUp size={14} color="#38764A" /> : <ChevronDown size={14} color="#38764A" />}
      </Pressable>
      {expanded ? (
        <View className="mt-2 bg-secondary/50 rounded-xl p-3">
          <Text className="text-xs text-muted-foreground leading-5">
            建议分量：{item.portion}{'\n'}{item.reason}
          </Text>
        </View>
      ) : null}

      <View className="flex-row gap-3 mt-3">
        <Pressable onPress={onReplace} className="flex-1 bg-primary rounded-xl py-3 items-center active:opacity-90">
          <Text className="text-sm font-semibold text-primary-foreground">替换原食物</Text>
        </Pressable>
        <Pressable onPress={() => {}} className="w-12 h-12 rounded-xl bg-secondary items-center justify-center active:bg-muted">
          <Heart size={18} color="#38764A" />
        </Pressable>
      </View>
    </View>
  );
}

function CompareCell({ label, orig, alt, unit }: { label: string; orig: number; alt: number; unit: string }) {
  const d = Math.round(alt - orig);
  const better = d < 0;
  return (
    <View className="flex-1 items-center">
      <Text className="text-[10px] text-muted-foreground">{label}</Text>
      <Text className="text-sm font-bold text-primary mt-0.5">{alt}</Text>
      <Text className="text-[9px] text-muted-foreground">{unit}</Text>
      <Text className={`text-[10px] font-semibold mt-0.5 ${better ? 'text-primary' : 'text-destructive'}`}>
        {d > 0 ? `↑${d}` : d < 0 ? `↓${Math.abs(d)}` : '持平'}
      </Text>
    </View>
  );
}