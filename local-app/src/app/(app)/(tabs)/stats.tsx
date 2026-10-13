import { useFocusEffect } from 'expo-router';
import { Flame, Scale, TrendingUp } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  CalorieBarChart,
  MacroRatioDonut,
  WeightTrendChart,
} from '@/components/StatsCharts';
import { Text } from '@/components/ui/text';
import { useSession } from '@/ctx';
import {
  aggregateMealLogs,
  daysAgo,
  listMealLogsRange,
  listWeightLogs,
  saveWeightLog,
  todayStr,
} from '@/db/api';
import { subscribeHealthDataChanged } from '@/lib/health-data-events';
import type { MealLog, WeightLog } from '@/types/types';

type Range = 'week' | 'month';

function latestWeightPerDay(items: WeightLog[]): WeightLog[] {
  const byDate = new Map<string, WeightLog>();
  for (const item of items) {
    const current = byDate.get(item.log_date);
    if (!current || item.created_at >= current.created_at) {
      byDate.set(item.log_date, item);
    }
  }
  return [...byDate.values()].sort((a, b) => a.log_date.localeCompare(b.log_date));
}

export default function StatsScreen() {
  const insets = useSafeAreaInsets();
  const { session } = useSession();
  const userId = session?.user?.id;

  const [range, setRange] = useState<Range>('week');
  const [logs, setLogs] = useState<MealLog[]>([]);
  const [weights, setWeights] = useState<WeightLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');
  const requestId = useRef(0);

  const loadData = useCallback(async () => {
    if (!userId) return;
    const currentRequest = ++requestId.current;
    setLoadError('');
    const days = range === 'week' ? 7 : 30;
    try {
      const [l, w] = await Promise.all([
        listMealLogsRange(userId, daysAgo(days - 1), todayStr()),
        listWeightLogs(userId),
      ]);
      if (currentRequest === requestId.current) {
        setLogs(l);
        setWeights(w);
      }
    } catch (e) {
      if (currentRequest === requestId.current) {
        setLoadError((e as Error).message || '统计数据加载失败');
      }
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [userId, range]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  useEffect(() => subscribeHealthDataChanged(() => { void loadData(); }), [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const days = range === 'week' ? 7 : 30;
  // 按日期聚合
  const dailyMap: Record<string, number> = {};
  for (let i = 0; i < days; i++) {
    dailyMap[daysAgo(days - 1 - i)] = 0;
  }
  for (const l of logs) {
    if (dailyMap[l.log_date] !== undefined) {
      dailyMap[l.log_date] += Number(l.calories) || 0;
    }
  }
  const dailyCalorieItems = Object.entries(dailyMap).map(([dStr, cal]) => {
    const monthDay = dStr.slice(5).replace('-', '/');
    return {
      date: dStr,
      label: monthDay,
      calories: Math.round(cal),
    };
  });
  const dailyCalories = dailyCalorieItems.map((item) => item.calories);

  // 营养素占比
  const agg = aggregateMealLogs(logs);
  const totalMacroCal =
    agg.protein * 4 + agg.carbs * 4 + agg.fat * 9;

  const macroLegend = [
    {
      label: '蛋白质',
      color: '#D97724',
      pct: totalMacroCal > 0 ? Math.round(((agg.protein * 4) / totalMacroCal) * 100) : 0,
      grams: Math.round(agg.protein),
    },
    {
      label: '碳水',
      color: '#38764A',
      pct: totalMacroCal > 0 ? Math.round(((agg.carbs * 4) / totalMacroCal) * 100) : 0,
      grams: Math.round(agg.carbs),
    },
    {
      label: '脂肪',
      color: '#7c5cbf',
      pct: totalMacroCal > 0 ? Math.round(((agg.fat * 9) / totalMacroCal) * 100) : 0,
      grams: Math.round(agg.fat),
    },
  ];

  const endDate = todayStr();
  const startDate = daysAgo(days - 1);
  const normalizedWeights = useMemo(() => latestWeightPerDay(weights), [weights]);
  const displayWeights = normalizedWeights.filter(
    (w) => w.log_date >= startDate && w.log_date <= endDate
  );
  const latestWeightLog = normalizedWeights.filter((w) => w.log_date <= endDate).at(-1);
  const todayWeight = normalizedWeights.find((w) => w.log_date === endDate);
  const latestWeight = latestWeightLog
    ? Number(latestWeightLog.weight_kg).toFixed(1)
    : '--';
  const avgCal = dailyCalories.length > 0 ? Math.round(dailyCalories.reduce((a, b) => a + b, 0) / dailyCalories.length) : 0;

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" color="#38764A" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#38764A" />
        }
      >
        <View className="px-5 pb-3" style={{ paddingTop: insets.top + 12 }}>
          <Text className="text-2xl font-bold text-foreground">数据统计</Text>
          <Text className="text-sm text-muted-foreground">追踪你的营养与健康趋势</Text>
        </View>

        {/* 时间范围切换 */}
        {loadError ? (
          <Pressable onPress={loadData} className="mx-5 mb-3 p-3 bg-card rounded-xl border border-border">
            <Text className="text-sm text-destructive">数据加载失败：{loadError}</Text>
            <Text className="text-xs text-primary mt-1">点击重新加载</Text>
          </Pressable>
        ) : null}
        <View className="px-5 mb-4">
          <View className="flex-row bg-muted rounded-xl p-1">
            {(['week', 'month'] as Range[]).map((r) => (
              <Pressable
                key={r}
                onPress={() => setRange(r)}
                className={`flex-1 h-9 rounded-lg items-center justify-center ${
                  range === r ? 'bg-card' : ''
                }`}
              >
                <Text
                  className={`text-sm font-medium ${
                    range === r ? 'text-primary' : 'text-muted-foreground'
                  }`}
                >
                  {r === 'week' ? '近7天' : '近30天'}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* 概览数字 */}
        <View className="px-5 flex-row gap-3 mb-5">
          <View
            className="flex-1 bg-card rounded-2xl p-4 border border-border"
            style={{ borderCurve: 'continuous' }}
          >
            <View className="flex-row items-center gap-1.5">
              <Flame size={16} color="#D97724" />
              <Text className="text-xs text-muted-foreground">日均热量</Text>
            </View>
            <Text className="text-2xl font-bold text-foreground mt-1">{avgCal}</Text>
            <Text className="text-xs text-muted-foreground">千卡</Text>
          </View>
          <View
            className="flex-1 bg-card rounded-2xl p-4 border border-border"
            style={{ borderCurve: 'continuous' }}
          >
            <View className="flex-row items-center gap-1.5">
              <Scale size={16} color="#38764A" />
              <Text className="text-xs text-muted-foreground">最新体重</Text>
            </View>
            <Text className="text-2xl font-bold text-foreground mt-1">
              {latestWeight}
            </Text>
            <Text className="text-xs text-muted-foreground">kg</Text>
          </View>
        </View>

        {/* 热量趋势 */}
        <View className="px-5 mb-5">
          <View
            className="bg-card rounded-3xl p-5 border border-border"
            style={{ borderCurve: 'continuous' }}
          >
            <View className="flex-row items-center gap-2 mb-4">
              <TrendingUp size={18} color="#38764A" />
              <Text className="text-base font-semibold text-foreground">热量摄入趋势</Text>
            </View>
            <CalorieBarChart
              data={dailyCalorieItems}
              range={range}
              targetCalories={1800}
            />
          </View>
        </View>

        {/* 营养素占比 */}
        <View className="px-5 mb-5">
          <View
            className="bg-card rounded-3xl p-5 border border-border"
            style={{ borderCurve: 'continuous' }}
          >
            <Text className="text-base font-semibold text-foreground mb-4">三大营养素供能占比</Text>
            <View className="flex-row items-center">
              <View style={{ width: 120, height: 120 }}>
                <MacroRatioDonut
                  proteinCal={agg.protein * 4}
                  carbsCal={agg.carbs * 4}
                  fatCal={agg.fat * 9}
                  size={120}
                  strokeWidth={14}
                />
              </View>
              <View className="flex-1 ml-5 gap-3">
                {macroLegend.map((m) => (
                  <View key={m.label} className="flex-row items-center">
                    <View className="w-3 h-3 rounded-full mr-2" style={{ backgroundColor: m.color }} />
                    <Text className="text-sm text-foreground flex-1">{m.label}</Text>
                    <Text className="text-xs text-muted-foreground mr-2">{m.grams}g</Text>
                    <Text className="text-sm font-semibold text-foreground">{m.pct}%</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        </View>

        {/* 体重曲线 */}
        <View className="px-5 mb-5">
          <View
            className="bg-card rounded-3xl p-5 border border-border"
            style={{ borderCurve: 'continuous' }}
          >
            <View className="flex-row items-center gap-2 mb-4">
              <Scale size={18} color="#38764A" />
              <Text className="text-base font-semibold text-foreground">体重变化曲线</Text>
            </View>
            <WeightTrendChart
              weights={displayWeights}
              periodStartDate={startDate}
              periodEndDate={endDate}
              height={160}
            />
          </View>
        </View>

        {/* 记录体重 */}
        <View className="px-5">
          <WeightRecorder
            todayWeight={todayWeight ? Number(todayWeight.weight_kg) : null}
            onSaved={loadData}
          />
        </View>
      </ScrollView>
    </View>
  );
}

function WeightRecorder({
  todayWeight,
  onSaved,
}: {
  todayWeight: number | null;
  onSaved: () => Promise<void>;
}) {
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    setValue(todayWeight === null ? '' : todayWeight.toFixed(1));
  }, [todayWeight]);

  const save = async () => {
    const w = Number(value);
    if (!w || w < 20 || w > 300) {
      setMsg('请输入有效体重(kg)');
      return;
    }
    setSaving(true);
    setMsg('');
    try {
      const action = await saveWeightLog(w, todayStr());
      await onSaved();
      setMsg(action === 'updated' ? '今日体重已修改' : '今日体重已记录');
    } catch (e) {
      setMsg(String((e as Error).message || e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View
      className="bg-card rounded-3xl p-5 border border-border"
      style={{ borderCurve: 'continuous' }}
    >
      <View className="flex-row items-center justify-between mb-3">
        <Text className="text-base font-semibold text-foreground">记录今日体重</Text>
        {todayWeight !== null ? (
          <Text className="text-xs text-muted-foreground">今日已记录，可直接修改</Text>
        ) : null}
      </View>
      <View className="flex-row gap-3">
        <View className="flex-1 flex-row items-center border border-input bg-background rounded-xl px-4 h-12">
          <TextInput
            className="flex-1 text-base text-foreground"
            placeholder="kg"
            placeholderTextColor="#a8a29e"
            keyboardType="decimal-pad"
            value={value}
            onChangeText={setValue}
          />
        </View>
        <Pressable
          onPress={save}
          disabled={saving}
          className="bg-primary rounded-xl px-6 items-center justify-center active:opacity-90"
          style={{ borderCurve: 'continuous' }}
        >
          <Text className="text-primary-foreground font-semibold">
            {saving ? '保存中...' : todayWeight === null ? '记录' : '修改'}
          </Text>
        </Pressable>
      </View>
      {msg ? <Text className="text-sm text-primary mt-2">{msg}</Text> : null}
    </View>
  );
}
