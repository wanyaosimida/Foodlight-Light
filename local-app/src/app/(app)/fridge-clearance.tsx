import { useRouter } from 'expo-router';
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Clock,
  Flame,
  Plus,
  Sparkles,
  Trash2,
  Utensils,
} from 'lucide-react-native';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSession } from '@/ctx';
import { callFridgeClearance, createMealLog, todayStr } from '@/db/api';

// 预设高频临期食材库
const PRESET_EXPIRING = [
  '西红柿',
  '鸡蛋',
  '老豆腐',
  '鸡胸肉',
  '菠菜',
  '剩米饭',
  '半根黄瓜',
  '鲜牛奶',
  '土豆',
  '大虾',
];

// 预设常备库与调味品
const PRESET_SEASONINGS = ['生抽', '食用油', '食盐', '黑胡椒', '蒜末', '香油', '蚝油', '醋'];

interface RecipeItem {
  title: string;
  clearance_rate: string;
  cook_time_minutes: number;
  difficulty: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  ingredients: { name: string; amount: string; is_expiring: boolean }[];
  steps: string[];
  zero_waste_hack: string;
}

export default function FridgeClearanceScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useSession();

  // 状态管理
  const [expiringList, setExpiringList] = useState<string[]>(['鸡蛋', '剩米饭']);
  const [customExpiring, setCustomExpiring] = useState('');
  const [selectedSeasonings, setSelectedSeasonings] = useState<string[]>([
    '生抽',
    '食用油',
    '食盐',
    '黑胡椒',
    '蒜末',
  ]);
  const [cookTime, setCookTime] = useState<number>(10);
  const [servings, setServings] = useState<number>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [tip, setTip] = useState('');
  const [recipes, setRecipes] = useState<RecipeItem[]>([]);
  const [recordedMap, setRecordedMap] = useState<Record<number, boolean>>({});

  // 添加自定义临期食材
  const handleAddExpiring = () => {
    const trimmed = customExpiring.trim();
    if (trimmed && !expiringList.includes(trimmed)) {
      setExpiringList([...expiringList, trimmed]);
      setCustomExpiring('');
    }
  };

  // 切换临期食材
  const toggleExpiring = (item: string) => {
    if (expiringList.includes(item)) {
      setExpiringList(expiringList.filter((i) => i !== item));
    } else {
      setExpiringList([...expiringList, item]);
    }
  };

  // 切换调料
  const toggleSeasoning = (s: string) => {
    if (selectedSeasonings.includes(s)) {
      setSelectedSeasonings(selectedSeasonings.filter((i) => i !== s));
    } else {
      setSelectedSeasonings([...selectedSeasonings, s]);
    }
  };

  // 生成极速零浪费食谱
  const handleGenerate = useCallback(async () => {
    if (expiringList.length === 0) {
      setError('请至少选择或输入 1 项临期食材');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await callFridgeClearance({
        expiring_ingredients: expiringList,
        seasonings: selectedSeasonings,
        cook_minutes_limit: cookTime,
        servings,
      });
      if (res?.recipes && res.recipes.length > 0) {
        setRecipes(res.recipes);
        setTip(res.tip || '优先把临期生鲜一次性消灭，不仅环保节约，更锁住最大营养！');
      } else {
        setError('生成食谱遇到小问题，请稍后重试');
      }
    } catch (e: any) {
      setError(e?.message || '生成失败，请点击重试');
    } finally {
      setLoading(false);
    }
  }, [expiringList, selectedSeasonings, cookTime, servings]);

  // 一键计入今日饮食
  const handleRecordMeal = async (recipe: RecipeItem, index: number) => {
    if (!session?.user?.id) return;
    try {
      await createMealLog({
        food_name: recipe.title,
        portion: `1份（约${recipe.cook_time_minutes}分钟出餐）`,
        calories: recipe.calories,
        protein: recipe.protein,
        carbs: recipe.carbs,
        fat: recipe.fat,
        meal_type: 'lunch',
        log_date: todayStr(),
        gl_value: Math.round((recipe.carbs * 55) / 100),
        image_url: null,
        recipe_id: null,
      });
      setRecordedMap((prev) => ({ ...prev, [index]: true }));
    } catch (e) {
      console.warn('Record meal log error:', e);
    }
  };

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
          <Text className="text-base font-bold text-[#1A1918]">冰箱盲盒清库 · 零浪费极速出餐</Text>
          <Text className="text-xs text-[#706E6B]">10-15分钟极速消耗临期食材</Text>
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
          {/* 核心设定卡片：餐盘刻度风 */}
          <View className="bg-white border border-[#E3E1DC] rounded p-4 mb-4 shadow-sm">
            {/* 临期食材区 */}
            <View className="flex-row items-center justify-between mb-2">
              <View className="flex-row items-center gap-1.5">
                <AlertTriangle size={16} color="#C85A17" />
                <Text className="text-sm font-bold text-[#1A1918]">
                  急需消灭的临期食材（优先 100% 消耗）
                </Text>
              </View>
              <Text className="text-xs text-[#C85A17] font-semibold">
                已选 {expiringList.length} 项
              </Text>
            </View>

            {/* 快捷点击标签 */}
            <View className="flex-row flex-wrap gap-2 mb-3">
              {PRESET_EXPIRING.map((item) => {
                const isSelected = expiringList.includes(item);
                return (
                  <Pressable
                    key={item}
                    onPress={() => toggleExpiring(item)}
                    className={`px-2.5 py-1.5 rounded border text-xs flex-row items-center gap-1 ${
                      isSelected
                        ? 'bg-[#C85A17] border-[#C85A17]'
                        : 'bg-[#F7F6F2] border-[#E3E1DC]'
                    }`}
                  >
                    <Text
                      className={`text-xs ${
                        isSelected ? 'text-white font-bold' : 'text-[#1A1918]'
                      }`}
                    >
                      {item}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* 自定义添加 */}
            <View className="flex-row items-center gap-2 mb-4">
              <TextInput
                value={customExpiring}
                onChangeText={setCustomExpiring}
                placeholder="输入冰箱里剩下的其它食材..."
                placeholderTextColor="#706E6B"
                className="flex-1 h-9 px-3 bg-[#F7F6F2] border border-[#E3E1DC] rounded text-xs text-[#1A1918]"
                onSubmitEditing={handleAddExpiring}
              />
              <Pressable
                onPress={handleAddExpiring}
                className="h-9 px-3 bg-[#1A1918] rounded items-center justify-center active:opacity-80"
              >
                <Plus size={16} color="#FFFFFF" />
              </Pressable>
            </View>

            {/* 调味料储备 */}
            <Text className="text-xs font-bold text-[#706E6B] mb-2">现有调味品储备</Text>
            <View className="flex-row flex-wrap gap-2 mb-4">
              {PRESET_SEASONINGS.map((s) => {
                const has = selectedSeasonings.includes(s);
                return (
                  <Pressable
                    key={s}
                    onPress={() => toggleSeasoning(s)}
                    className={`px-2.5 py-1 rounded border ${
                      has ? 'bg-[#4F772D]/10 border-[#4F772D]' : 'bg-[#F7F6F2] border-[#E3E1DC]'
                    }`}
                  >
                    <Text className={`text-xs ${has ? 'text-[#4F772D] font-bold' : 'text-[#706E6B]'}`}>
                      {has ? `✓ ${s}` : `+ ${s}`}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* 时间限制与人数 */}
            <View className="flex-row items-center justify-between pt-3 border-t border-[#E3E1DC]">
              <View>
                <Text className="text-xs text-[#706E6B] mb-1.5 font-semibold">烹饪出餐时限</Text>
                <View className="flex-row gap-1.5">
                  {[10, 15, 20].map((t) => (
                    <Pressable
                      key={t}
                      onPress={() => setCookTime(t)}
                      className={`px-3 py-1.5 rounded border ${
                        cookTime === t
                          ? 'bg-[#4F772D] border-[#4F772D]'
                          : 'bg-[#F7F6F2] border-[#E3E1DC]'
                      }`}
                    >
                      <Text
                        className={`text-xs font-bold ${
                          cookTime === t ? 'text-white' : 'text-[#1A1918]'
                        }`}
                      >
                        {t}分钟
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View>
                <Text className="text-xs text-[#706E6B] mb-1.5 font-semibold">用餐人数</Text>
                <View className="flex-row gap-1.5">
                  {[1, 2].map((n) => (
                    <Pressable
                      key={n}
                      onPress={() => setServings(n)}
                      className={`px-3 py-1.5 rounded border ${
                        servings === n
                          ? 'bg-[#4F772D] border-[#4F772D]'
                          : 'bg-[#F7F6F2] border-[#E3E1DC]'
                      }`}
                    >
                      <Text
                        className={`text-xs font-bold ${
                          servings === n ? 'text-white' : 'text-[#1A1918]'
                        }`}
                      >
                        {n}人份
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>

            {/* 错误提示 */}
            {error ? (
              <Text className="text-xs text-[#C85A17] mt-3 text-center">{error}</Text>
            ) : null}

            {/* 一键生成按钮 */}
            <Pressable
              onPress={handleGenerate}
              disabled={loading}
              className="mt-4 w-full h-12 bg-[#4F772D] rounded items-center justify-center flex-row gap-2 active:opacity-90 shadow-sm"
            >
              {loading ? (
                <>
                  <ActivityIndicator size="small" color="#FFFFFF" />
                  <Text className="text-white text-sm font-bold">零浪费AI大厨规划中...</Text>
                </>
              ) : (
                <>
                  <Sparkles size={18} color="#FFFFFF" />
                  <Text className="text-white text-sm font-bold">
                    立即开箱 · 生成零浪费极速食谱
                  </Text>
                </>
              )}
            </Pressable>
          </View>

          {/* 生成结果展示区 */}
          {tip ? (
            <View className="bg-[#4F772D]/10 border-l-4 border-[#4F772D] p-3 rounded mb-4">
              <Text className="text-xs font-bold text-[#4F772D] mb-0.5">🌱 零浪费大厨建议</Text>
              <Text className="text-xs text-[#1A1918] leading-5">{tip}</Text>
            </View>
          ) : null}

          {recipes.map((item, idx) => (
            <View
              key={idx}
              className="bg-white border border-[#E3E1DC] rounded p-4 mb-4 shadow-sm"
            >
              {/* 菜名与清库徽章 */}
              <View className="flex-row items-center justify-between pb-2 mb-2 border-b border-[#E3E1DC]">
                <View className="flex-1 mr-2">
                  <Text className="text-base font-bold text-[#1A1918]">{item.title}</Text>
                  <View className="flex-row items-center gap-3 mt-1">
                    <View className="flex-row items-center gap-1">
                      <Clock size={12} color="#706E6B" />
                      <Text className="text-xs text-[#706E6B]">约 {item.cook_time_minutes} 分钟出餐</Text>
                    </View>
                    <View className="flex-row items-center gap-1">
                      <Flame size={12} color="#C85A17" />
                      <Text className="text-xs font-bold text-[#C85A17]">{item.calories} kcal</Text>
                    </View>
                  </View>
                </View>
                <View className="bg-[#C85A17] px-2 py-1 rounded">
                  <Text className="text-[10px] text-white font-bold">
                    清库率 {item.clearance_rate || '100%'}
                  </Text>
                </View>
              </View>

              {/* 营养素矩阵 */}
              <View className="flex-row bg-[#F7F6F2] py-2 px-3 rounded mb-3 justify-between">
                <Text className="text-xs text-[#706E6B]">
                  蛋白质: <Text className="text-[#1A1918] font-bold">{item.protein}g</Text>
                </Text>
                <Text className="text-xs text-[#706E6B]">
                  碳水: <Text className="text-[#1A1918] font-bold">{item.carbs}g</Text>
                </Text>
                <Text className="text-xs text-[#706E6B]">
                  脂肪: <Text className="text-[#1A1918] font-bold">{item.fat}g</Text>
                </Text>
              </View>

              {/* 食材消耗清单 */}
              <Text className="text-xs font-bold text-[#1A1918] mb-1.5">消耗用料配比：</Text>
              <View className="flex-row flex-wrap gap-2 mb-3">
                {item.ingredients.map((ing, iIdx) => (
                  <View
                    key={iIdx}
                    className={`px-2 py-1 rounded border text-xs flex-row items-center gap-1 ${
                      ing.is_expiring
                        ? 'bg-[#C85A17]/10 border-[#C85A17]'
                        : 'bg-[#F7F6F2] border-[#E3E1DC]'
                    }`}
                  >
                    <Text
                      className={`text-xs ${
                        ing.is_expiring ? 'text-[#C85A17] font-bold' : 'text-[#706E6B]'
                      }`}
                    >
                      {ing.name} ({ing.amount})
                    </Text>
                  </View>
                ))}
              </View>

              {/* 极速步骤 */}
              <Text className="text-xs font-bold text-[#1A1918] mb-1.5">极速实操步骤：</Text>
              <View className="gap-2 mb-3">
                {item.steps.map((st, sIdx) => (
                  <View key={sIdx} className="flex-row items-start gap-2">
                    <View className="w-4 h-4 rounded-full bg-[#1A1918] items-center justify-center mt-0.5">
                      <Text className="text-[10px] text-white font-bold">{sIdx + 1}</Text>
                    </View>
                    <Text className="flex-1 text-xs text-[#1A1918] leading-5">{st}</Text>
                  </View>
                ))}
              </View>

              {/* 零浪费绝活 */}
              {item.zero_waste_hack ? (
                <View className="bg-[#F7F6F2] p-2 rounded mb-3 border-l-2 border-[#4F772D]">
                  <Text className="text-[11px] text-[#706E6B] leading-4">
                    💡 零浪费秘诀：{item.zero_waste_hack}
                  </Text>
                </View>
              ) : null}

              {/* 一键计入饮食 */}
              <Pressable
                onPress={() => handleRecordMeal(item, idx)}
                disabled={recordedMap[idx]}
                className={`w-full py-2.5 rounded items-center justify-center flex-row gap-1.5 ${
                  recordedMap[idx] ? 'bg-[#4F772D]/20' : 'bg-[#4F772D] active:opacity-90'
                }`}
              >
                <CheckCircle2
                  size={16}
                  color={recordedMap[idx] ? '#4F772D' : '#FFFFFF'}
                />
                <Text
                  className={`text-xs font-bold ${
                    recordedMap[idx] ? 'text-[#4F772D]' : 'text-white'
                  }`}
                >
                  {recordedMap[idx] ? '已计入今日饮食记录' : '一键计入今日午餐'}
                </Text>
              </Pressable>
            </View>
          ))}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
