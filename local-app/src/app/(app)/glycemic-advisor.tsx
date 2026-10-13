import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  Sparkles,
  Zap,
  Coffee,
  AlertCircle,
  Footprints,
  Clock,
  RotateCcw,
  ListOrdered,
  Smile,
  Frown,
} from 'lucide-react-native';
import { callGlycemicAdvisor, listMealLogs, todayStr } from '@/db/api';
import { useSession } from '@/ctx';

// 常用食物碳水与GI预设
const QUICK_MEALS = [
  { name: '牛肉拉面大碗', carbs: 75, protein: 22, fat: 12 },
  { name: '煎饺8个 + 豆浆', carbs: 55, protein: 18, fat: 16 },
  { name: '香煎鸡胸肉便当(半碗杂粮饭)', carbs: 32, protein: 35, fat: 8 },
  { name: '轻食金枪鱼全麦三明治', carbs: 28, protein: 26, fat: 7 },
  { name: '麻辣香锅配大碗白米饭', carbs: 80, protein: 25, fat: 35 },
  { name: '白灼虾 + 蔬菜沙拉 (无主食)', carbs: 8, protein: 32, fat: 5 },
];

export default function GlycemicAdvisorScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useSession();

  // 输入状态
  const [mealName, setMealName] = useState('牛肉拉面大碗');
  const [carbs, setCarbs] = useState('75');
  const [protein, setProtein] = useState('22');
  const [fat, setFat] = useState('12');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 评估结果
  const [glValue, setGlValue] = useState<number | null>(null);
  const [glLevel, setGlLevel] = useState<'low' | 'medium' | 'high'>('high');
  const [glLabel, setGlLabel] = useState('高GL负荷 (血糖骤升)');
  const [comaRisk, setComaRisk] = useState<number>(85);
  const [comaTime, setComaTime] = useState<string>('餐后35~55分钟');
  const [comaSymptom, setComaSymptom] = useState<string>(
    '大脑供血被消化道大量占用，胰岛素分泌导致血糖骤降，易产生严重眼皮沉重、大脑昏沉感'
  );
  const [optimalOrder, setOptimalOrder] = useState<
    { step: number; type: string; label: string; reason: string; duration: string }[]
  >([]);
  const [rescueActions, setRescueActions] = useState<string[]>([]);

  useEffect(() => {
    setGlValue(null);
    setOptimalOrder([]);
    setRescueActions([]);
  }, [mealName, carbs, protein, fat]);

  // 从今日饮食记录快捷导入最新一餐
  const handleLoadLatestMeal = async () => {
    if (!session?.user?.id) return;
    try {
      const logs = await listMealLogs(session.user.id, todayStr());
      if (logs && logs.length > 0) {
        const latest = logs[0];
        setMealName(latest.food_name || '今日餐食');
        setCarbs(String(latest.carbs ?? 0));
        setProtein(String(latest.protein ?? 0));
        setFat(String(latest.fat ?? 0));
        setGlValue(null);
        setOptimalOrder([]);
        setRescueActions([]);
        setError('');
      } else {
        setError('今日尚未记录餐食，可手动输入或选择预设');
      }
    } catch (e) {
      setError((e as Error).message || '今日餐食加载失败，请重试');
    }
  };

  // 评估推演
  const handleEvaluate = useCallback(async () => {
    const numCarbs = Number(carbs);
    const numProtein = Number(protein);
    const numFat = Number(fat);
    if ([carbs, protein, fat].some(value => !value.trim()) || [numCarbs, numProtein, numFat].some(value => !Number.isFinite(value) || value < 0)) {
      setError('请输入有效的碳水、蛋白质和脂肪克数（可为0）');
      return;
    }
    setLoading(true);
    setError('');
    setGlValue(null);
    setOptimalOrder([]);
    setRescueActions([]);
    try {
      const res = await callGlycemicAdvisor({
        meal_name: mealName.trim() || '本餐组合',
        total_carbs: numCarbs,
        total_protein: numProtein,
        total_fat: numFat,
        items: [{ name: mealName.trim() || '主餐', carbs: numCarbs }],
      });
      if (res) {
        setGlValue(res.gl_value);
        setGlLevel(res.gl_level || (res.gl_value >= 20 ? 'high' : res.gl_value >= 11 ? 'medium' : 'low'));
        setGlLabel(res.gl_label || (res.gl_value >= 20 ? '高GL负荷' : '低GL平稳'));
        setComaRisk(res.coma_risk_percent ?? 50);
        setComaTime(res.coma_peak_time || '餐后40分钟');
        setComaSymptom(res.coma_symptom || '');
        if (res.optimal_order?.length) setOptimalOrder(res.optimal_order);
        if (res.rescue_actions?.length) setRescueActions(res.rescue_actions);
      }
    } catch (e: any) {
      setError(e?.message || '评估失败，请点击重试');
    } finally {
      setLoading(false);
    }
  }, [mealName, carbs, protein, fat]);

  return (
    <View className="flex-1 bg-[#F7F6F2]">
      {/* 顶部导航 */}
      <View
        className="flex-row items-center justify-between px-4 pb-3 border-b border-[#E3E1DC] bg-white"
        style={{ paddingTop: insets.top + 8 }}
      >
        <Pressable
          onPress={() => router.back()}
          className="w-10 h-10 items-center justify-center rounded-lg active:bg-muted"
        >
          <ArrowLeft size={22} color="#1A1918" />
        </Pressable>
        <View className="items-center">
          <Text className="text-base font-bold text-[#1A1918]">动态GL与餐后困倦预警</Text>
          <Text className="text-xs text-[#706E6B]">血糖负荷 · 防困进食顺序 · 餐后急救</Text>
        </View>
        <View className="w-10" />
      </View>

      <KeyboardAvoidingView
        behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
        <ScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom + 40, paddingTop: 16 }}
          keyboardShouldPersistTaps="handled"
          className="px-4"
        >
          {/* 输入及快捷选取卡片 */}
          <View className="bg-white border border-[#E3E1DC] rounded p-4 mb-4 shadow-sm">
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-xs font-bold text-[#706E6B]">餐食输入与碳水评估</Text>
              <Pressable
                onPress={handleLoadLatestMeal}
                className="flex-row items-center gap-1 bg-[#F7F6F2] px-2 py-1 rounded border border-[#E3E1DC]"
              >
                <RotateCcw size={12} color="#4F772D" />
                <Text className="text-[11px] text-[#4F772D] font-bold">载入今日最新餐食</Text>
              </Pressable>
            </View>

            {/* 快捷示例 */}
            <View className="flex-row flex-wrap gap-1.5 mb-3">
              {QUICK_MEALS.map((q) => (
                <Pressable
                  key={q.name}
                  onPress={() => {
                    setMealName(q.name);
                    setCarbs(String(q.carbs));
                    setProtein(String(q.protein));
                    setFat(String(q.fat));
                  }}
                  className="px-2 py-1 bg-[#F7F6F2] border border-[#E3E1DC] rounded"
                >
                  <Text className="text-[11px] text-[#1A1918]">{q.name}</Text>
                </Pressable>
              ))}
            </View>

            {/* 表单输入 */}
            <View className="gap-2.5 mb-3">
              <TextInput
                value={mealName}
                onChangeText={setMealName}
                placeholder="餐食名称（如：红烧牛肉面、杂粮轻食碗）"
                placeholderTextColor="#706E6B"
                className="w-full h-9 px-3 bg-[#F7F6F2] border border-[#E3E1DC] rounded text-xs text-[#1A1918]"
              />

              <View className="flex-row gap-2">
                <View className="flex-1">
                  <Text className="text-[10px] text-[#706E6B] mb-1">总碳水化合物 (g)</Text>
                  <TextInput
                    value={carbs}
                    onChangeText={setCarbs}
                    keyboardType="numeric"
                    placeholder="如 75"
                    className="h-9 px-3 bg-[#F7F6F2] border border-[#E3E1DC] rounded text-xs text-[#1A1918] font-bold"
                  />
                </View>
                <View className="flex-1">
                  <Text className="text-[10px] text-[#706E6B] mb-1">蛋白质 (g)</Text>
                  <TextInput
                    value={protein}
                    onChangeText={setProtein}
                    keyboardType="numeric"
                    placeholder="如 22"
                    className="h-9 px-3 bg-[#F7F6F2] border border-[#E3E1DC] rounded text-xs text-[#1A1918]"
                  />
                </View>
                <View className="flex-1">
                  <Text className="text-[10px] text-[#706E6B] mb-1">脂肪 (g)</Text>
                  <TextInput
                    value={fat}
                    onChangeText={setFat}
                    keyboardType="numeric"
                    placeholder="如 12"
                    className="h-9 px-3 bg-[#F7F6F2] border border-[#E3E1DC] rounded text-xs text-[#1A1918]"
                  />
                </View>
              </View>
            </View>

            {error ? (
              <Text className="text-xs text-[#C85A17] mb-2 text-center">{error}</Text>
            ) : null}

            {/* 评估按钮 */}
            <Pressable
              onPress={handleEvaluate}
              disabled={loading}
              className="w-full h-11 bg-[#4F772D] rounded items-center justify-center flex-row gap-2 active:opacity-90 shadow-sm"
            >
              {loading ? (
                <>
                  <ActivityIndicator size="small" color="#FFFFFF" />
                  <Text className="text-white text-xs font-bold">推演胰岛素与困倦曲线中...</Text>
                </>
              ) : (
                <>
                  <Zap size={16} color="#FFFFFF" />
                  <Text className="text-white text-xs font-bold">
                    立即推演 · 评估GL负荷与困倦风险
                  </Text>
                </>
              )}
            </Pressable>
          </View>

          {/* GL 刻度与困倦预警双格看板 */}
          {glValue !== null ? (
            <View className="bg-white border border-[#E3E1DC] rounded p-4 mb-4 shadow-sm">
              <View className="flex-row items-center justify-between pb-3 mb-3 border-b border-[#E3E1DC]">
                {/* 左侧：GL 刻度 */}
                <View className="flex-1 border-r border-[#E3E1DC] pr-3">
                  <Text className="text-[11px] text-[#706E6B] font-semibold mb-1">
                    单餐升糖负荷 (GL)
                  </Text>
                  <View className="flex-row items-baseline gap-1.5 mb-1">
                    <Text
                      className={`text-3xl font-extrabold ${
                        glLevel === 'high'
                          ? 'text-[#C85A17]'
                          : glLevel === 'medium'
                          ? 'text-[#1A1918]'
                          : 'text-[#4F772D]'
                      }`}
                    >
                      {glValue}
                    </Text>
                    <View
                      className={`px-1.5 py-0.5 rounded ${
                        glLevel === 'high'
                          ? 'bg-[#C85A17]'
                          : glLevel === 'medium'
                          ? 'bg-[#1A1918]'
                          : 'bg-[#4F772D]'
                      }`}
                    >
                      <Text className="text-[10px] text-white font-bold">
                        {glLevel === 'high' ? '高GL' : glLevel === 'medium' ? '中度' : '低GL'}
                      </Text>
                    </View>
                  </View>
                  <Text className="text-[10px] text-[#706E6B]">
                    参考标尺：≤10低 · 11-19中 · ≥20高
                  </Text>
                </View>

                {/* 右侧：餐后困倦概率 */}
                <View className="flex-1 pl-3">
                  <Text className="text-[11px] text-[#706E6B] font-semibold mb-1">
                    餐后困倦 (Food Coma) 风险
                  </Text>
                  <View className="flex-row items-baseline gap-1.5 mb-1">
                    <Text
                      className={`text-3xl font-extrabold ${
                        comaRisk >= 70
                          ? 'text-[#C85A17]'
                          : comaRisk >= 40
                          ? 'text-[#1A1918]'
                          : 'text-[#4F772D]'
                      }`}
                    >
                      {comaRisk}%
                    </Text>
                    {comaRisk >= 60 ? (
                      <Frown size={18} color="#C85A17" />
                    ) : (
                      <Smile size={18} color="#4F772D" />
                    )}
                  </View>
                  <Text className="text-[10px] text-[#C85A17] font-semibold">
                    高发期：{comaTime}
                  </Text>
                </View>
              </View>

              {/* 生理反应机理 */}
              {comaSymptom ? (
                <View className="bg-[#F7F6F2] p-2.5 rounded border border-[#E3E1DC]">
                  <Text className="text-xs text-[#1A1918] leading-5">
                    🧠 身体动力学机制：{comaSymptom}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}

          {/* 黄金进食顺序卡片 */}
          {glValue === null && !loading ? <Text className="text-xs text-[#706E6B] mb-4">点击评估后显示本次 AI 估计结果，仅作饮食参考。</Text> : null}
          {optimalOrder.length > 0 ? (
          <View className="bg-white border border-[#E3E1DC] rounded p-4 mb-4 shadow-sm">
            <View className="flex-row items-center gap-1.5 mb-2.5">
              <ListOrdered size={16} color="#4F772D" />
              <Text className="text-sm font-bold text-[#1A1918]">
                AI 进食顺序参考
              </Text>
            </View>

            <View className="gap-2.5">
              {optimalOrder.map((step) => (
                <View
                  key={step.step}
                  className="p-3 bg-[#F7F6F2] rounded border-l-4 border-[#4F772D]"
                >
                  <View className="flex-row items-center justify-between mb-1">
                    <Text className="text-xs font-bold text-[#1A1918]">{step.label}</Text>
                    <Text className="text-[10px] text-[#4F772D] font-semibold">
                      {step.duration}
                    </Text>
                  </View>
                  <Text className="text-[11px] text-[#706E6B] leading-4">
                    原理：{step.reason}
                  </Text>
                </View>
              ))}
            </View>
          </View>
          ) : null}

          {/* 餐后急救补救指南 */}
          {rescueActions.length > 0 ? (
          <View className="bg-white border border-[#E3E1DC] rounded p-4 mb-4 shadow-sm">
            <View className="flex-row items-center gap-1.5 mb-2.5">
              <Coffee size={16} color="#C85A17" />
              <Text className="text-sm font-bold text-[#C85A17]">
                餐后活动建议
              </Text>
            </View>

            <View className="gap-2">
              {rescueActions.map((act, aIdx) => (
                <View key={aIdx} className="flex-row items-start gap-2">
                  <View className="w-4 h-4 rounded-full bg-[#C85A17] items-center justify-center mt-0.5">
                    <Text className="text-[10px] text-white font-bold">{aIdx + 1}</Text>
                  </View>
                  <Text className="flex-1 text-xs text-[#1A1918] leading-5">{act}</Text>
                </View>
              ))}
            </View>
          </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
