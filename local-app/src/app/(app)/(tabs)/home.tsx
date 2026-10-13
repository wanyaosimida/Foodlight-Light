import { useState, useCallback } from 'react';
import { View, Pressable, ScrollView, ActivityIndicator, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import {
  Camera,
  Sparkles,
  Flame,
  Beef,
  Wheat,
  Droplet,
  ChevronRight,
  Settings,
} from 'lucide-react-native';
import { getProfile, listMealLogs, todayStr, aggregateMealLogs, getPublicUrl } from '@/db/api';
import { calcBMR, calcTDEE, calcDailyTarget, calcMacroGrams } from '@/db/api';
import { useSession } from '@/ctx';
import type { Profile, MealLog, Goal } from '@/types/types';
import { GOAL_LABELS, MEAL_TYPE_LABELS } from '@/types/types';
import { FEATURED_RECIPES } from '@/lib/featured';
import { MacroDonut } from '@/components/MacroDonut';
import { AnimatedNumber } from '@/components/AnimatedNumber';
import { Text } from '@/components/ui/text';

const MACRO_META = [
  { key: 'protein', label: '蛋白质', icon: Beef, color: '#D97724' },
  { key: 'carbs', label: '碳水', icon: Wheat, color: '#38764A' },
  { key: 'fat', label: '脂肪', icon: Droplet, color: '#7c5cbf' },
] as const;

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useSession();
  const userId = session?.user?.id;

  const [profile, setProfile] = useState<Profile | null>(null);
  const [logs, setLogs] = useState<MealLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');

  const loadData = useCallback(async () => {
    if (!userId) return;
    setLoadError('');
    try {
      const [p, l] = await Promise.all([
        getProfile(userId),
        listMealLogs(userId, todayStr()),
      ]);
      setProfile(p);
      setLogs(l);
    } catch (e) {
      setLoadError((e as Error).message || '餐食记录加载失败');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" color="#38764A" />
      </View>
    );
  }

  const hasProfile = profile?.age && profile?.height_cm && profile?.weight_kg;
  const goal = (profile?.goal || 'balance') as Goal;
  const bmr = hasProfile
    ? calcBMR(profile!.gender!, Number(profile!.weight_kg), Number(profile!.height_cm), Number(profile!.age))
    : 0;
  const tdee = hasProfile ? calcTDEE(bmr, profile!.activity_level || 'medium') : 0;
  const dailyTarget = hasProfile ? calcDailyTarget(goal, tdee) : 2000;
  const macroTargets = calcMacroGrams(goal, dailyTarget);

  const agg = aggregateMealLogs(logs);
  const progress = dailyTarget > 0 ? Math.round((agg.calories / dailyTarget) * 100) : 0;

  const grouped: Record<string, MealLog[]> = { breakfast: [], lunch: [], dinner: [], snack: [] };
  for (const l of logs) {
    const mt = l.meal_type || 'snack';
    if (grouped[mt]) grouped[mt].push(l);
  }

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        contentContainerStyle={{ paddingBottom: 100 }}
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#38764A" />
        }
      >
        {/* 顶部标题 */}
        <View
          className="px-5 pb-4"
          style={{ paddingTop: insets.top + 12 }}
        >
          <View className="flex-row items-center justify-between">
            <View>
              <Text className="text-sm text-muted-foreground">今日膳食</Text>
              <Text className="text-2xl font-bold text-foreground">
                你好，{profile?.nickname || '美食家'}
              </Text>
            </View>
            <Pressable
              onPress={() => router.push('/(app)/onboarding')}
              className="w-10 h-10 rounded-full bg-card border border-border items-center justify-center active:bg-muted"
            >
              <Settings size={20} color="#38764A" />
            </Pressable>
          </View>
        </View>

        {/* 摄入聚合卡 */}
        {loadError ? (
          <Pressable onPress={loadData} className="mx-5 mb-3 p-3 bg-card rounded-xl border border-border">
            <Text className="text-sm text-destructive">记录加载失败：{loadError}</Text>
            <Text className="text-xs text-primary mt-1">点击重新加载</Text>
          </Pressable>
        ) : null}
        <View className="px-5">
          <View
            className="bg-card rounded-3xl p-5 border border-border"
            style={{ borderCurve: 'continuous' }}
          >
            <View className="flex-row items-center">
              <View className="items-center">
                <MacroDonut
                  progress={progress}
                  consumed={Math.round(agg.calories)}
                  target={dailyTarget}
                  size={140}
                />
              </View>
              <View className="flex-1 ml-5 gap-3">
                <View className="flex-row items-center gap-2">
                  <Flame size={18} color="#D97724" />
                  <Text className="text-sm text-muted-foreground">已摄入</Text>
                  <AnimatedNumber
                    value={Math.round(agg.calories)}
                    className="text-lg font-bold text-foreground"
                  />
                  <Text className="text-xs text-muted-foreground">/ {dailyTarget} 千卡</Text>
                </View>
                <View className="gap-2">
                  {MACRO_META.map((m) => {
                    const consumed = Math.round(agg[m.key]);
                    const target = macroTargets[m.key];
                    const pct = target > 0 ? Math.min(100, Math.round((consumed / target) * 100)) : 0;
                    return (
                      <View key={m.key}>
                        <View className="flex-row items-center justify-between mb-1">
                          <View className="flex-row items-center gap-1.5">
                            <m.icon size={14} color={m.color} />
                            <Text className="text-xs text-muted-foreground">{m.label}</Text>
                          </View>
                          <Text className="text-xs text-foreground">
                            {consumed}/{target}g
                          </Text>
                        </View>
                        <View className="h-2 rounded-full bg-muted overflow-hidden">
                          <View
                            className="h-2 rounded-full"
                            style={{ width: `${pct}%`, backgroundColor: m.color }}
                          />
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>
            </View>
            {!hasProfile && (
              <Pressable
                onPress={() => router.push('/(app)/onboarding')}
                className="mt-4 bg-secondary rounded-xl p-3 flex-row items-center justify-between active:opacity-80"
              >
                <Text className="text-sm text-secondary-foreground font-medium">
                  完善健康信息，获取个性化推荐
                </Text>
                <ChevronRight size={18} color="#38764A" />
              </Pressable>
            )}
          </View>
        </View>

        {/* 核心快捷操作区 */}
        <View className="px-5 mt-5 flex-row gap-3">
          <Pressable
            onPress={() => router.push('/(app)/meal-record')}
            className="flex-1 bg-primary rounded-2xl p-3.5 flex-row items-center justify-between active:opacity-90 shadow-sm overflow-hidden"
            style={{ borderCurve: 'continuous' }}
          >
            <View className="flex-1 min-w-0 mr-2">
              <Text className="text-primary-foreground font-bold text-base" numberOfLines={1}>
                拍照记餐
              </Text>
              <Text className="text-primary-foreground/80 text-xs mt-1" numberOfLines={1}>
                AI 识别营养热量
              </Text>
            </View>
            <View className="w-10 h-10 rounded-xl bg-white/20 items-center justify-center shrink-0">
              <Camera size={20} color="#fff" />
            </View>
          </Pressable>

          <Pressable
            onPress={() => router.push('/(app)/meal-generator')}
            className="flex-1 bg-accent rounded-2xl p-3.5 flex-row items-center justify-between active:opacity-90 shadow-sm overflow-hidden"
            style={{ borderCurve: 'continuous' }}
          >
            <View className="flex-1 min-w-0 mr-2">
              <Text className="text-accent-foreground font-bold text-base" numberOfLines={1}>
                智能膳食
              </Text>
              <Text className="text-accent-foreground/90 text-xs mt-1" numberOfLines={1}>
                AI 定制科学配餐
              </Text>
            </View>
            <View className="w-10 h-10 rounded-xl bg-white/20 items-center justify-center shrink-0">
              <Sparkles size={20} color="#fff" />
            </View>
          </Pressable>
        </View>

        {/* AI 饮食与健康创新模块矩阵 */}
        <View className="px-5 mt-6">
          <View className="flex-row items-center justify-between mb-3">
            <View className="flex-row items-center gap-1.5">
              <Sparkles size={16} color="#2D8B57" />
              <Text className="text-base font-bold text-foreground">AI 饮食健康创新工坊</Text>
            </View>
            <Pressable
              onPress={() => router.push('/(app)/(tabs)/workshop')}
              className="active:opacity-70 flex-row items-center"
            >
              <Text className="text-xs text-primary font-semibold">全部功能</Text>
              <ChevronRight size={14} color="#2D8B57" />
            </Pressable>
          </View>

          <View className="flex-row flex-wrap gap-2.5">
            {/* 冰箱盲盒清库 */}
            <Pressable
              onPress={() => router.push('/(app)/fridge-clearance')}
              className="flex-1 min-w-[46%] bg-card border border-border rounded-2xl p-3.5 active:bg-muted shadow-xs"
              style={{ borderCurve: 'continuous' }}
            >
              <View className="flex-row items-center justify-between mb-2">
                <Text className="text-sm font-bold text-foreground">冰箱盲盒清库</Text>
                <View className="bg-[#2D8B57]/15 px-1.5 py-0.5 rounded">
                  <Text className="text-[10px] text-[#2D8B57] font-bold">零浪费</Text>
                </View>
              </View>
              <Text className="text-xs text-muted-foreground leading-4">
                10-15分钟速消临期食材出餐
              </Text>
            </Pressable>

            {/* 外卖避坑军师 */}
            <Pressable
              onPress={() => router.push('/(app)/takeout-advisor')}
              className="flex-1 min-w-[46%] bg-card border border-border rounded-2xl p-3.5 active:bg-muted shadow-xs"
              style={{ borderCurve: 'continuous' }}
            >
              <View className="flex-row items-center justify-between mb-2">
                <Text className="text-sm font-bold text-foreground">外卖避坑军师</Text>
                <View className="bg-[#E87A30]/15 px-1.5 py-0.5 rounded">
                  <Text className="text-[10px] text-[#E87A30] font-bold">红绿灯</Text>
                </View>
              </View>
              <Text className="text-xs text-muted-foreground leading-4">
                黄金搭配方案+一键神备注
              </Text>
            </Pressable>

            {/* 动态GL预警 */}
            <Pressable
              onPress={() => router.push('/(app)/glycemic-advisor')}
              className="flex-1 min-w-[46%] bg-card border border-border rounded-2xl p-3.5 active:bg-muted shadow-xs"
              style={{ borderCurve: 'continuous' }}
            >
              <View className="flex-row items-center justify-between mb-2">
                <Text className="text-sm font-bold text-foreground">动态GL防困</Text>
                <View className="bg-[#0284C7]/15 px-1.5 py-0.5 rounded">
                  <Text className="text-[10px] text-[#0284C7] font-bold">稳血糖</Text>
                </View>
              </View>
              <Text className="text-xs text-muted-foreground leading-4">
                餐后血糖负荷+进食黄金顺序
              </Text>
            </Pressable>

            {/* AI数字分身 */}
            <Pressable
              onPress={() => router.push('/(app)/body-avatar')}
              className="flex-1 min-w-[46%] bg-card border border-border rounded-2xl p-3.5 active:bg-muted shadow-xs"
              style={{ borderCurve: 'continuous' }}
            >
              <View className="flex-row items-center justify-between mb-2">
                <Text className="text-sm font-bold text-foreground">健康数字分身</Text>
                <View className="bg-[#9333EA]/15 px-1.5 py-0.5 rounded">
                  <Text className="text-[10px] text-[#9333EA] font-bold">体态图</Text>
                </View>
              </View>
              <Text className="text-xs text-muted-foreground leading-4">
                未来30/60/90天体态预测对比
              </Text>
            </Pressable>
          </View>
        </View>

        {/* 今日推荐 */}
        <View className="mt-6">
          <View className="flex-row items-center justify-between px-5 mb-3">
            <Text className="text-lg font-bold text-foreground">今日推荐</Text>
            <Pressable onPress={() => router.push('/(app)/meal-generator')} className="flex-row items-center active:opacity-70">
              <Sparkles size={14} color="#38764A" />
              <Text className="text-xs text-primary ml-1">AI定制</Text>
            </Pressable>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}
          >
            {FEATURED_RECIPES.map((r) => (
              <Pressable
                key={r.id}
                onPress={() => router.push('/(app)/meal-generator')}
                className="w-40 bg-card rounded-2xl border border-border overflow-hidden active:opacity-90"
                style={{ borderCurve: 'continuous' }}
              >
                <Image source={r.cover} className="w-40 h-28" contentFit="cover" />
                <View className="p-3">
                  <View className="self-start bg-accent/15 rounded px-1.5 py-0.5 mb-1.5">
                    <Text className="text-[10px] text-accent">{r.tag}</Text>
                  </View>
                  <Text className="text-sm font-semibold text-foreground" numberOfLines={1}>
                    {r.title}
                  </Text>
                  <View className="flex-row items-center gap-1 mt-1">
                    <Flame size={11} color="#D97724" />
                    <Text className="text-xs text-muted-foreground">{r.calories} 千卡</Text>
                  </View>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {/* 今日记录 */}
        <View className="px-5 mt-6">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-lg font-bold text-foreground">今日记录</Text>
            <Text className="text-xs text-muted-foreground">{logs.length} 条</Text>
          </View>
          {logs.length === 0 ? (
            <View className="bg-card rounded-2xl p-8 items-center border border-border" style={{ borderCurve: 'continuous' }}>
              <Text className="text-muted-foreground text-sm">还没有记录，点击上方按钮开始记餐</Text>
            </View>
          ) : (
            <View className="gap-3">
              {(['breakfast', 'lunch', 'dinner', 'snack'] as const).map((mt) =>
                grouped[mt].length === 0 ? null : (
                  <View key={mt}>
                    <Text className="text-xs font-semibold text-muted-foreground mb-2">
                      {MEAL_TYPE_LABELS[mt]}
                    </Text>
                    <View className="gap-2">
                      {grouped[mt].map((log) => (
                        <View
                          key={log.id}
                          className="flex-row items-center bg-card rounded-2xl p-3 border border-border"
                          style={{ borderCurve: 'continuous' }}
                        >
                          <MealThumbnail key={log.image_url || 'no-image'} path={log.image_url} />
                          <View className="flex-1 ml-3">
                            <Text className="text-sm font-medium text-foreground" numberOfLines={1}>
                              {log.food_name}
                            </Text>
                            <Text className="text-xs text-muted-foreground">
                              {log.portion} · {Math.round(log.calories)} 千卡
                            </Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  </View>
                )
              )}
            </View>
          )}
        </View>
      </ScrollView>

      {/* 浮动快速记餐 */}
      <Pressable
        onPress={() => router.push('/(app)/meal-record')}
        className="absolute right-5 bg-primary rounded-full h-[52px] px-6 flex-row items-center active:opacity-90"
        style={{ bottom: insets.bottom + 24, borderCurve: 'continuous' }}
      >
        <Camera size={20} color="#fff" />
        <Text className="text-primary-foreground font-semibold ml-2">快速记餐</Text>
      </Pressable>
    </View>
  );
}

function MealThumbnail({ path }: { path: string | null }) {
  const [failed, setFailed] = useState(false);
  if (path && !failed) return (
    <Image source={{ uri: getPublicUrl(path) }} className="w-12 h-12 rounded-xl" contentFit="cover" onError={() => setFailed(true)} />
  );
  return (
    <View className="w-12 h-12 rounded-xl bg-secondary items-center justify-center" accessibilityLabel={failed ? '原始照片暂不可用' : '未添加照片'}>
      <Beef size={failed ? 16 : 20} color="#38764A" />
      {failed ? <Text className="text-[9px] text-muted-foreground mt-0.5">原图缺失</Text> : null}
    </View>
  );
}
