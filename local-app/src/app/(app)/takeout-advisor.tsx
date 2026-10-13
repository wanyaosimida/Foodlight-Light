import React, { useState, useCallback } from 'react';
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
  ShieldAlert,
  CheckCircle,
  Copy,
  Flame,
  Lightbulb,
  ShoppingBag,
  Users,
  UtensilsCrossed,
  Check,
} from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import { callTakeoutAdvisor } from '@/db/api';

const SCENES = [
  { key: 'takeout', label: '外卖点单', icon: ShoppingBag },
  { key: 'dining_out', label: '餐厅聚餐', icon: UtensilsCrossed },
  { key: 'banquet', label: '宴席应酬', icon: Users },
] as const;

const CUISINES = [
  '川湘重油小炒',
  '粤式茶餐厅烧腊',
  '轻食沙拉/波奇碗',
  '日料定食/寿司',
  '自选麻辣烫/冒菜',
  '黄焖鸡/快餐便当',
  '韩式拌饭/烤肉',
  '火锅串串香',
];

const GOALS = [
  { key: 'lose_fat', label: '减脂控卡' },
  { key: 'gain_muscle', label: '高蛋白增肌' },
  { key: 'low_carb', label: '低碳控糖防困' },
  { key: 'low_sodium', label: '清淡控水肿' },
] as const;

interface ComboItem {
  name: string;
  estimated_calories: number;
  protein: number;
  carbs: number;
  fat: number;
  items: string[];
  reason: string;
}

interface RedDishItem {
  name: string;
  risk: string;
}

export default function TakeoutAdvisorScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // 状态
  const [scene, setScene] = useState<'takeout' | 'dining_out' | 'banquet'>('takeout');
  const [cuisine, setCuisine] = useState<string>('川湘重油小炒');
  const [customCuisine, setCustomCuisine] = useState<string>('');
  const [menuText, setMenuText] = useState<string>('');
  const [goal, setGoal] = useState<'lose_fat' | 'gain_muscle' | 'low_carb' | 'low_sodium' | 'balance'>('lose_fat');
  const [calorieBudget, setCalorieBudget] = useState<number>(500);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  // 结果数据
  const [analysis, setAnalysis] = useState<string>('');
  const [combos, setCombos] = useState<ComboItem[]>([]);
  const [redDishes, setRedDishes] = useState<RedDishItem[]>([]);
  const [takeoutNote, setTakeoutNote] = useState<string>('');
  const [hacks, setHacks] = useState<string[]>([]);

  // 复制外卖备注
  const handleCopyNote = async () => {
    if (!takeoutNote) return;
    await Clipboard.setStringAsync(takeoutNote);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // 发起避坑军师分析
  const handleAnalyze = useCallback(async () => {
    const finalCuisine = customCuisine.trim() || cuisine;
    if (!finalCuisine) {
      setError('请选择或输入餐厅菜系或店铺名称');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await callTakeoutAdvisor({
        scene,
        target_cuisine: finalCuisine,
        menu_text: menuText.trim() || undefined,
        calorie_budget: calorieBudget,
        dietary_goal: goal,
      });

      if (res) {
        setAnalysis(res.analysis || '');
        setCombos(res.recommended_combos || []);
        setRedDishes(res.red_dishes || []);
        setTakeoutNote(res.takeout_note || '');
        setHacks(res.dining_hacks || res.dining_hints || []);
      } else {
        setError('生成分析遇到小问题，请稍后重试');
      }
    } catch (e: any) {
      setError(e?.message || '生成失败，请点击重试');
    } finally {
      setLoading(false);
    }
  }, [scene, cuisine, customCuisine, menuText, calorieBudget, goal]);

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
          <Text className="text-base font-bold text-[#1A1918]">外卖与聚餐避坑军师</Text>
          <Text className="text-xs text-[#706E6B]">红绿灯推荐 · 避开隐形油糖 · 专属备注</Text>
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
          {/* 输入配置卡片 */}
          <View className="bg-white border border-[#E3E1DC] rounded p-4 mb-4 shadow-sm">
            {/* 场景选择 */}
            <Text className="text-xs font-bold text-[#706E6B] mb-2">当前就餐场景</Text>
            <View className="flex-row gap-2 mb-4">
              {SCENES.map((s) => {
                const Icon = s.icon;
                const active = scene === s.key;
                return (
                  <Pressable
                    key={s.key}
                    onPress={() => setScene(s.key)}
                    className={`flex-1 py-2.5 rounded border items-center justify-center flex-row gap-1.5 ${
                      active
                        ? 'bg-[#4F772D] border-[#4F772D]'
                        : 'bg-[#F7F6F2] border-[#E3E1DC]'
                    }`}
                  >
                    <Icon size={14} color={active ? '#FFFFFF' : '#1A1918'} />
                    <Text
                      className={`text-xs font-bold ${
                        active ? 'text-white' : 'text-[#1A1918]'
                      }`}
                    >
                      {s.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* 菜系预设与输入 */}
            <Text className="text-xs font-bold text-[#706E6B] mb-2">
              选择或输入店铺 / 菜系
            </Text>
            <View className="flex-row flex-wrap gap-2 mb-3">
              {CUISINES.map((c) => {
                const active = cuisine === c && !customCuisine;
                return (
                  <Pressable
                    key={c}
                    onPress={() => {
                      setCuisine(c);
                      setCustomCuisine('');
                    }}
                    className={`px-2.5 py-1.5 rounded border ${
                      active
                        ? 'bg-[#1A1918] border-[#1A1918]'
                        : 'bg-[#F7F6F2] border-[#E3E1DC]'
                    }`}
                  >
                    <Text
                      className={`text-xs ${
                        active ? 'text-white font-bold' : 'text-[#1A1918]'
                      }`}
                    >
                      {c}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* 自定义输入框 */}
            <TextInput
              value={customCuisine}
              onChangeText={setCustomCuisine}
              placeholder="输入其他具体餐厅或外卖店名（如：老乡鸡、太二酸菜鱼）..."
              placeholderTextColor="#706E6B"
              className="w-full h-9 px-3 bg-[#F7F6F2] border border-[#E3E1DC] rounded text-xs text-[#1A1918] mb-4"
            />

            {/* 目标与预算 */}
            <View className="flex-row items-center justify-between mb-4 pt-3 border-t border-[#E3E1DC]">
              <View className="flex-1 mr-2">
                <Text className="text-xs font-bold text-[#706E6B] mb-1.5">个人当前目标</Text>
                <View className="flex-row flex-wrap gap-1.5">
                  {GOALS.map((g) => (
                    <Pressable
                      key={g.key}
                      onPress={() => setGoal(g.key)}
                      className={`px-2 py-1 rounded border ${
                        goal === g.key
                          ? 'bg-[#4F772D] border-[#4F772D]'
                          : 'bg-[#F7F6F2] border-[#E3E1DC]'
                      }`}
                    >
                      <Text
                        className={`text-[11px] font-bold ${
                          goal === g.key ? 'text-white' : 'text-[#1A1918]'
                        }`}
                      >
                        {g.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View>
                <Text className="text-xs font-bold text-[#706E6B] mb-1.5">卡路里预算</Text>
                <View className="flex-row gap-1">
                  {[450, 550, 650].map((b) => (
                    <Pressable
                      key={b}
                      onPress={() => setCalorieBudget(b)}
                      className={`px-2 py-1 rounded border ${
                        calorieBudget === b
                          ? 'bg-[#4F772D] border-[#4F772D]'
                          : 'bg-[#F7F6F2] border-[#E3E1DC]'
                      }`}
                    >
                      <Text
                        className={`text-[11px] font-bold ${
                          calorieBudget === b ? 'text-white' : 'text-[#1A1918]'
                        }`}
                      >
                        {b}k
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>

            {/* 可选菜单粘贴 */}
            <Text className="text-xs font-bold text-[#706E6B] mb-1.5">
              可选：粘贴外卖菜单或几个想点的菜
            </Text>
            <TextInput
              value={menuText}
              onChangeText={setMenuText}
              placeholder="例如：小炒黄牛肉、干锅花菜、酸辣土豆丝、米饭..."
              placeholderTextColor="#706E6B"
              multiline
              numberOfLines={2}
              className="w-full p-2.5 bg-[#F7F6F2] border border-[#E3E1DC] rounded text-xs text-[#1A1918] mb-3"
            />

            {error ? (
              <Text className="text-xs text-[#C85A17] mb-2 text-center">{error}</Text>
            ) : null}

            {/* 分析按钮 */}
            <Pressable
              onPress={handleAnalyze}
              disabled={loading}
              className="w-full h-12 bg-[#4F772D] rounded items-center justify-center flex-row gap-2 active:opacity-90 shadow-sm"
            >
              {loading ? (
                <>
                  <ActivityIndicator size="small" color="#FFFFFF" />
                  <Text className="text-white text-sm font-bold">军师深度排雷与搭配中...</Text>
                </>
              ) : (
                <>
                  <Sparkles size={18} color="#FFFFFF" />
                  <Text className="text-white text-sm font-bold">
                    呼叫避坑军师 · 生成最优解与神备注
                  </Text>
                </>
              )}
            </Pressable>
          </View>

          {/* 分析总览 */}
          {analysis ? (
            <View className="bg-white border-l-4 border-[#4F772D] p-3 rounded mb-4 shadow-sm border border-[#E3E1DC]">
              <Text className="text-xs font-bold text-[#4F772D] mb-1">🔍 餐厅烹饪特性排雷</Text>
              <Text className="text-xs text-[#1A1918] leading-5">{analysis}</Text>
            </View>
          ) : null}

          {/* 外卖神备注一键复制（高亮卡片） */}
          {takeoutNote ? (
            <View className="bg-[#FFFDF9] border border-[#C85A17]/40 rounded p-4 mb-4 shadow-sm">
              <View className="flex-row items-center justify-between mb-2">
                <View className="flex-row items-center gap-1.5">
                  <Lightbulb size={16} color="#C85A17" />
                  <Text className="text-sm font-bold text-[#C85A17]">
                    外卖神备注（一键复制直贴）
                  </Text>
                </View>
                <Pressable
                  onPress={handleCopyNote}
                  className={`px-3 py-1 rounded flex-row items-center gap-1 ${
                    copied ? 'bg-[#4F772D]' : 'bg-[#C85A17]'
                  }`}
                >
                  {copied ? (
                    <>
                      <Check size={12} color="#FFFFFF" />
                      <Text className="text-xs text-white font-bold">已复制</Text>
                    </>
                  ) : (
                    <>
                      <Copy size={12} color="#FFFFFF" />
                      <Text className="text-xs text-white font-bold">复制备注</Text>
                    </>
                  )}
                </Pressable>
              </View>
              <View className="bg-[#F7F6F2] p-2.5 rounded border border-[#E3E1DC]">
                <Text className="text-xs text-[#1A1918] leading-5 select-all">{takeoutNote}</Text>
              </View>
            </View>
          ) : null}

          {/* 绿灯推荐组合方案 */}
          {combos.length > 0 ? (
            <View className="mb-4">
              <View className="flex-row items-center gap-1.5 mb-2.5">
                <CheckCircle size={16} color="#4F772D" />
                <Text className="text-sm font-bold text-[#1A1918]">
                  放心点 · 绿灯推荐黄金搭配方案
                </Text>
              </View>

              {combos.map((combo, cIdx) => (
                <View
                  key={cIdx}
                  className="bg-white border border-[#E3E1DC] rounded p-4 mb-3 shadow-sm"
                >
                  <View className="flex-row items-center justify-between pb-2 mb-2 border-b border-[#E3E1DC]">
                    <Text className="text-sm font-bold text-[#1A1918] flex-1 mr-2">
                      {combo.name}
                    </Text>
                    <View className="flex-row items-center gap-1 bg-[#4F772D]/10 px-2 py-0.5 rounded">
                      <Flame size={12} color="#4F772D" />
                      <Text className="text-xs font-bold text-[#4F772D]">
                        约 {combo.estimated_calories} kcal
                      </Text>
                    </View>
                  </View>

                  {/* 营养配比 */}
                  <View className="flex-row bg-[#F7F6F2] py-1.5 px-3 rounded mb-2.5 justify-between">
                    <Text className="text-[11px] text-[#706E6B]">
                      蛋白质: <Text className="text-[#1A1918] font-bold">{combo.protein}g</Text>
                    </Text>
                    <Text className="text-[11px] text-[#706E6B]">
                      碳水: <Text className="text-[#1A1918] font-bold">{combo.carbs}g</Text>
                    </Text>
                    <Text className="text-[11px] text-[#706E6B]">
                      脂肪: <Text className="text-[#1A1918] font-bold">{combo.fat}g</Text>
                    </Text>
                  </View>

                  {/* 包含菜品 */}
                  <View className="gap-1 mb-2">
                    {combo.items.map((it, iIdx) => (
                      <Text key={iIdx} className="text-xs text-[#1A1918] leading-4">
                        • {it}
                      </Text>
                    ))}
                  </View>

                  <Text className="text-[11px] text-[#706E6B] leading-4 border-t border-[#E3E1DC] pt-2">
                    💡 营养理由：{combo.reason}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          {/* 红榜避坑雷区 */}
          {redDishes.length > 0 ? (
            <View className="bg-white border border-[#E3E1DC] rounded p-4 mb-4 shadow-sm">
              <View className="flex-row items-center gap-1.5 mb-2.5">
                <ShieldAlert size={16} color="#C85A17" />
                <Text className="text-sm font-bold text-[#C85A17]">高危避坑红榜（千万别踩）</Text>
              </View>

              <View className="gap-2.5">
                {redDishes.map((red, rIdx) => (
                  <View
                    key={rIdx}
                    className="p-2.5 bg-[#F7F6F2] rounded border-l-2 border-[#C85A17]"
                  >
                    <Text className="text-xs font-bold text-[#1A1918] mb-1">{red.name}</Text>
                    <Text className="text-[11px] text-[#706E6B] leading-4">{red.risk}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {/* 现场实操避坑妙招 */}
          {hacks.length > 0 ? (
            <View className="bg-white border border-[#E3E1DC] rounded p-4 mb-4 shadow-sm">
              <Text className="text-sm font-bold text-[#1A1918] mb-2">
                🍽️ 就餐现场实操急救绝活
              </Text>
              <View className="gap-2">
                {hacks.map((h, hIdx) => (
                  <View key={hIdx} className="flex-row items-start gap-2">
                    <View className="w-4 h-4 rounded-full bg-[#4F772D] items-center justify-center mt-0.5">
                      <Text className="text-[10px] text-white font-bold">{hIdx + 1}</Text>
                    </View>
                    <Text className="flex-1 text-xs text-[#1A1918] leading-5">{h}</Text>
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