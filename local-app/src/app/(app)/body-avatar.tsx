import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import {
  ArrowLeft,
  Sparkles,
  Award,
  Calendar,
  RefreshCw,
} from 'lucide-react-native';
import { getProfile, listWeightLogs, callAvatarImageGeneration } from '@/db/api';
import { useSession } from '@/ctx';
import type { Profile, WeightLog } from '@/types/types';
import { isLocalBackend } from '@/client/supabase';

export default function BodyAvatarScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useSession();

  // 用户健康档案
  const [profile, setProfile] = useState<Profile | null>(null);
  const [weights, setWeights] = useState<WeightLog[]>([]);
  const [period, setPeriod] = useState<30 | 60 | 90>(30);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [avatarImage, setAvatarImage] = useState<string | null>(null);
  const [loadError, setLoadError] = useState('');
  const [generationError, setGenerationError] = useState('');
  const [retry, setRetry] = useState(0);

  // 加载档案与历史数据
  useEffect(() => {
    let active = true;
    async function loadData() {
      if (!session?.user?.id) { setLoading(false); return; }
      try {
        setLoading(true);
        setLoadError('');
        const [p, w] = await Promise.all([
          getProfile(session.user.id),
          listWeightLogs(session.user.id),
        ]);
        if (!active) return;
        setProfile(p);
        setWeights(w || []);
      } catch (e) {
        if (active) setLoadError(e instanceof Error ? e.message : '健康档案加载失败，请重试。');
      } finally {
        if (active) setLoading(false);
      }
    }
    loadData();
    return () => { active = false; };
  }, [session?.user?.id, retry]);

  // 基础数据
  const sortedWeights = [...weights].sort((a, b) =>
    b.log_date.localeCompare(a.log_date) || b.created_at.localeCompare(a.created_at));
  const latestWeight = sortedWeights[0];
  const currentWeight = latestWeight?.weight_kg ?? profile?.weight_kg ?? null;
  const height = profile?.height_cm ?? null;
  const goalLabels = { lose_fat: '减脂', gain_muscle: '增肌', balance: '均衡饮食', control_sugar: '控糖' };
  const goalLabel = profile?.goal ? goalLabels[profile.goal] : '健康生活';

  // 生成 AI 拟真健康分身海报
  const handleGenerateAvatarPoster = useCallback(async () => {
    if (generating || loading || loadError) return;
    setGenerating(true);
    setGenerationError('');
    try {
      const gender = profile?.gender === 'female' ? 'adult woman' : profile?.gender === 'male' ? 'adult man' : 'adult person';
      const activity = profile?.goal === 'gain_muscle' ? 'gentle strength training' : 'walking outdoors and enjoying a balanced meal';
      const prompt = `Fitness journal illustration of an ${gender}, ${activity}, natural body proportions, green sportswear, warm ivory background, elegant editorial line art, green botanical accents. A personal ${period}-day healthy habits motivation poster. Calm optimistic atmosphere. No text, no numbers, no before-and-after body transformation.`;

      const res = await callAvatarImageGeneration(prompt, '1024x1024');
      if (res?.data?.[0]?.b64_json) {
        setAvatarImage(`data:image/png;base64,${res.data[0].b64_json}`);
      } else throw new Error('图片服务没有返回图片，请重试。');
    } catch (e) {
      setGenerationError(e instanceof Error ? e.message : '分身海报生成失败，请重试。');
    } finally {
      setGenerating(false);
    }
  }, [profile, period, generating, loading, loadError]);

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
          <Text className="text-base font-bold text-[#1A1918]">AI 健康数字分身</Text>
          <Text className="text-xs text-[#706E6B]">健康记录 · 阶段目标 · AI 激励海报</Text>
        </View>
        <View className="w-10" />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 40, paddingTop: 16 }}
        className="px-4"
      >
        {loading ? <ActivityIndicator color="#4F772D" style={{ marginBottom: 16 }} /> : null}
        {loadError ? (
          <View className="bg-white border border-red-200 rounded p-4 mb-4">
            <Text accessibilityRole="alert" className="text-sm text-red-700">{loadError}</Text>
            <Pressable accessibilityRole="button" onPress={() => setRetry(value => value + 1)} className="mt-2 py-2">
              <Text className="text-sm text-[#4F772D]">重新加载档案</Text>
            </Pressable>
          </View>
        ) : null}
        {/* 时间跨度选择切换 */}
        <View className="flex-row bg-white border border-[#E3E1DC] rounded p-1 mb-4 shadow-sm">
          {[30, 60, 90].map((p) => (
            <Pressable
              key={p}
              disabled={generating}
              onPress={() => { setPeriod(p as 30 | 60 | 90); setAvatarImage(null); setGenerationError(''); }}
              className={`flex-1 py-2 rounded items-center justify-center ${
                period === p ? 'bg-[#4F772D]' : 'bg-transparent'
              }`}
            >
              <Text
                className={`text-xs font-bold ${
                  period === p ? 'text-white' : 'text-[#706E6B]'
                }`}
              >
                {p} 天计划
              </Text>
            </Pressable>
          ))}
        </View>

        {/* 核心指标双视窗对比卡片（餐盘刻度风） */}
        <View className="bg-white border border-[#E3E1DC] rounded p-4 mb-4 shadow-sm">
          <View className="flex-row items-center justify-between pb-3 mb-3 border-b border-[#E3E1DC]">
            <View>
              <Text className="text-xs font-bold text-[#1A1918]">当前记录与阶段目标</Text>
              <Text className="text-[11px] text-[#706E6B]">
                依据已保存的健康档案与体重记录
              </Text>
            </View>
            <View className="bg-[#4F772D]/10 px-2 py-0.5 rounded">
              <Text className="text-[10px] text-[#4F772D] font-bold">实际记录</Text>
            </View>
          </View>

          {/* 1:1 双视窗对比：自律坚持 vs 放任暴饮暴食 */}
          <View className="flex-row border border-[#E3E1DC] rounded overflow-hidden mb-3">
            {/* 左视窗：坚持控卡 */}
            <View className="flex-1 bg-[#FBFDF9] p-3 border-r border-[#E3E1DC]">
              <View className="flex-row items-center gap-1 mb-2">
                <View className="w-2 h-2 rounded-full bg-[#4F772D]" />
                <Text className="text-xs font-bold text-[#4F772D]">当前基准</Text>
              </View>

              <Text className="text-[10px] text-[#706E6B]">最新体重</Text>
              <Text className="text-2xl font-extrabold text-[#4F772D] mb-2">
                {loading || loadError ? '—' : currentWeight ?? '未填写'} <Text className="text-xs font-normal">{currentWeight !== null && !loading && !loadError ? 'kg' : ''}</Text>
              </Text>

              <View className="gap-1">
                <Text className="text-[11px] text-[#1A1918]">
                  身高：<Text className="text-[#4F772D] font-bold">{height ? `${height} cm` : '未填写'}</Text>
                </Text>
                <Text className="text-[11px] text-[#1A1918]">
                  来源：{latestWeight ? `体重记录 ${latestWeight.log_date}` : '健康档案'}
                </Text>
                <Text className="text-[11px] text-[#706E6B] mt-1 leading-4">
                  新的体重记录会更新这里的基准。
                </Text>
              </View>
            </View>

            {/* 右视窗：放任无计划 */}
            <View className="flex-1 bg-[#FFFDF9] p-3">
              <View className="flex-row items-center gap-1 mb-2">
                <View className="w-2 h-2 rounded-full bg-[#C85A17]" />
                <Text className="text-xs font-bold text-[#C85A17]">阶段方向</Text>
              </View>

              <Text className="text-[10px] text-[#706E6B]">档案中的健康目标</Text>
              <Text className="text-2xl font-extrabold text-[#C85A17] mb-2">
                {loading || loadError ? '—' : goalLabel}
              </Text>

              <View className="gap-1">
                <Text className="text-[11px] text-[#1A1918]">
                  计划周期：<Text className="text-[#C85A17] font-bold">{period} 天</Text>
                </Text>
                <Text className="text-[11px] text-[#1A1918]">
                  已保存体重记录：{weights.length} 条
                </Text>
                <Text className="text-[11px] text-[#706E6B] mt-1 leading-4">
                  暂无目标体重、体脂或腰围数据，不生成这些指标的预测值。
                </Text>
              </View>
            </View>
          </View>

          {/* 阶段性目标倒计时 */}
          <View className="bg-[#F7F6F2] p-2.5 rounded flex-row items-center justify-between">
            <View className="flex-row items-center gap-1.5">
              <Calendar size={14} color="#4F772D" />
              <Text className="text-xs text-[#1A1918]">
                关注接下来 <Text className="font-bold text-[#4F772D]">{period}</Text> 天的日常习惯
              </Text>
            </View>
            <Text className="text-[11px] text-[#706E6B]">按实际记录观察变化</Text>
          </View>
        </View>

        {/* AI 拟真健康分身海报 */}
        <View className="bg-white border border-[#E3E1DC] rounded p-4 mb-4 shadow-sm">
          <View className="flex-row items-center justify-between mb-3">
            <View className="flex-row items-center gap-1.5">
              <Sparkles size={16} color="#4F772D" />
              <Text className="text-sm font-bold text-[#1A1918]">
                AI 健康分身激励海报
              </Text>
            </View>
            <Text className="text-[11px] text-[#706E6B]">{isLocalBackend ? '本地图片模型' : 'AI 插画'}</Text>
          </View>

          {avatarImage ? (
            <View className="mb-3">
              <Image
                source={{ uri: avatarImage }}
                className="w-full aspect-square rounded border border-[#E3E1DC]"
                contentFit="cover"
              />
              <Pressable
                onPress={handleGenerateAvatarPoster}
                accessibilityRole="button"
                disabled={generating}
                className="mt-2 py-2 bg-[#F7F6F2] rounded border border-[#E3E1DC] items-center flex-row justify-center gap-1.5 active:bg-muted"
              >
                <RefreshCw size={14} color="#4F772D" />
                <Text className="text-xs text-[#4F772D] font-bold">{generating ? '正在重新绘制...' : '重新绘制分身海报'}</Text>
              </Pressable>
            </View>
          ) : (
            <View className="bg-[#F7F6F2] rounded p-6 items-center justify-center border border-dashed border-[#E3E1DC] mb-3">
              <Award size={36} color="#4F772D" />
              <Text className="text-xs font-bold text-[#1A1918] mt-2 mb-1">
                为 {period} 天计划生成专属激励海报
              </Text>
              <Text className="text-[11px] text-[#706E6B] text-center mb-4 leading-4">
                根据档案中的性别和健康目标绘制主题插画。海报用于激励，不代表真实未来体态或医疗预测。
              </Text>
              <Pressable
                onPress={handleGenerateAvatarPoster}
                accessibilityRole="button"
                disabled={generating || loading || !!loadError}
                className="px-6 py-2.5 bg-[#4F772D] rounded flex-row items-center gap-1.5 active:opacity-90 shadow-sm"
              >
                {generating ? (
                  <>
                    <ActivityIndicator size="small" color="#FFFFFF" />
                    <Text className="text-xs text-white font-bold">AI 正在绘制，首次加载请稍候...</Text>
                  </>
                ) : (
                  <>
                    <Sparkles size={14} color="#FFFFFF" />
                    <Text className="text-xs text-white font-bold">
                      生成 AI 分身海报
                    </Text>
                  </>
                )}
              </Pressable>
            </View>
          )}
          {generationError ? (
            <View className="bg-red-50 border border-red-200 rounded p-3 mb-3">
              <Text accessibilityRole="alert" className="text-xs text-red-700">{generationError}</Text>
              <Text className="text-xs text-[#706E6B] mt-1">服务恢复后可再次点击生成。已有健康记录不受影响。</Text>
            </View>
          ) : null}

          {/* 专属激励寄语 */}
          <View className="bg-[#4F772D]/10 border-l-4 border-[#4F772D] p-3 rounded">
            <Text className="text-xs font-bold text-[#4F772D] mb-1">💌 今日鼓励</Text>
            <Text className="text-xs text-[#1A1918] leading-5">
              “把目光放在今天可以做到的一件小事上。记录一餐、散步一会儿、按时休息，让这 {period} 天成为了解自己的过程。”
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
