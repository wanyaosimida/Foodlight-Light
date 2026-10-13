import { useState, useEffect } from 'react';
import {
  View,
  TextInput,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { ChevronLeft, Camera } from 'lucide-react-native';
import { updateProfile, getProfile } from '@/db/api';
import { useSession } from '@/ctx';
import type { Gender, ActivityLevel, Goal } from '@/types/types';
import { GOAL_LABELS, ACTIVITY_LABELS } from '@/types/types';
import { AVATARS, getAvatarById } from '@/constants/avatars';
import { AvatarPicker } from '@/components/AvatarPicker';
import { Text } from '@/components/ui/text';

const GOALS: Goal[] = ['lose_fat', 'gain_muscle', 'balance', 'control_sugar'];
const ACTIVITIES: ActivityLevel[] = ['low', 'medium', 'high'];

export default function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useSession();
  const userId = session?.user?.id;

  const [gender, setGender] = useState<Gender>('male');
  const [age, setAge] = useState('');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [activity, setActivity] = useState<ActivityLevel>('medium');
  const [goal, setGoal] = useState<Goal>('balance');
  const [allergies, setAllergies] = useState('');
  const [avatarId, setAvatarId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!userId) return;
    getProfile(userId).then((p) => {
      if (!p) return;
      if (p.gender) setGender(p.gender);
      if (p.age != null) setAge(String(p.age));
      if (p.height_cm != null) setHeight(String(p.height_cm));
      if (p.weight_kg != null) setWeight(String(p.weight_kg));
      if (p.activity_level) setActivity(p.activity_level);
      if (p.goal) setGoal(p.goal);
      setAllergies(p.allergies || '');
      if (p?.avatar_url) setAvatarId(p.avatar_url);
    }).catch((e) => setError((e as Error).message || '健康信息加载失败，请重试'));
  }, [userId]);

  useEffect(() => {
    if (avatarId) return;
    const defaultAvatar = AVATARS.find((a) => a.gender === gender);
    if (defaultAvatar) setAvatarId(defaultAvatar.id);
  }, [gender, avatarId]);

  const currentAvatar = getAvatarById(avatarId);

  const handleSave = async () => {
    setError('');
    const ageN = Number(age);
    const hN = Number(height);
    const wN = Number(weight);
    if (!ageN || ageN < 5 || ageN > 100) {
      setError('请输入有效年龄');
      return;
    }
    if (!hN || hN < 80 || hN > 250) {
      setError('请输入有效身高(cm)');
      return;
    }
    if (!wN || wN < 20 || wN > 300) {
      setError('请输入有效体重(kg)');
      return;
    }
    if (!userId) {
      setError('登录状态异常，请重新登录');
      return;
    }
    setLoading(true);
    try {
      await updateProfile(userId, {
        gender,
        age: ageN,
        height_cm: hN,
        weight_kg: wN,
        activity_level: activity,
        goal,
        allergies: allergies.trim() || null,
        avatar_url: avatarId,
      });
      router.back();
    } catch (e) {
      setError(String((e as Error).message || e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className="flex-1 bg-background">
      <View style={{ paddingTop: insets.top + 8 }} className="flex-row items-center px-4 pb-2">
        <Pressable
          onPress={() => router.back()}
          className="w-10 h-10 items-center justify-center rounded-full active:bg-muted"
          hitSlop={8}
        >
          <ChevronLeft size={26} color="#242220" />
        </Pressable>
        <Text className="text-xl font-bold text-foreground ml-1">完善健康信息</Text>
      </View>

      <KeyboardAvoidingView
        behavior={process.env.EXPO_OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <ScrollView
          contentContainerClassName="px-6 pb-10 gap-6 pt-2"
          keyboardShouldPersistTaps="handled"
        >
          {/* 头像选择 */}
          <View className="items-center">
            <Text className="text-sm font-semibold text-foreground mb-3">选择你的运动头像</Text>
            <Pressable
              onPress={() => setPickerOpen(true)}
              className="w-24 h-24 rounded-full bg-card border-2 border-border items-center justify-center active:opacity-80 shadow-sm"
              style={{ borderCurve: 'continuous' }}
            >
              {currentAvatar ? (
                <Image
                  source={currentAvatar.source}
                  className="w-full h-full rounded-full"
                  contentFit="cover"
                  transition={200}
                />
              ) : (
                <Camera size={30} color="#38764A" />
              )}
            </Pressable>
            <Pressable onPress={() => setPickerOpen(true)} className="mt-2 active:opacity-70">
              <Text className="text-xs text-primary font-medium">点击更换头像</Text>
            </Pressable>
          </View>

          {/* 目标 */}
          <View>
            <Text className="text-sm font-semibold text-foreground mb-3">你的健康目标</Text>
            <View className="flex-row flex-wrap gap-2">
              {GOALS.map((g) => (
                <Pressable
                  key={g}
                  onPress={() => setGoal(g)}
                  className={`px-4 py-2.5 rounded-xl border ${
                    goal === g ? 'bg-primary border-primary' : 'bg-card border-border'
                  }`}
                  style={{ borderCurve: 'continuous' }}
                >
                  <Text
                    className={`text-sm font-medium ${
                      goal === g ? 'text-primary-foreground' : 'text-foreground'
                    }`}
                  >
                    {GOAL_LABELS[g]}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* 性别 */}
          <View>
            <Text className="text-sm font-semibold text-foreground mb-3">性别</Text>
            <View className="flex-row gap-3">
              {(['male', 'female'] as Gender[]).map((g) => (
                <Pressable
                  key={g}
                  onPress={() => setGender(g)}
                  className={`flex-1 h-12 rounded-xl border items-center justify-center ${
                    gender === g ? 'bg-primary border-primary' : 'bg-card border-border'
                  }`}
                  style={{ borderCurve: 'continuous' }}
                >
                  <Text
                    className={`text-base font-medium ${
                      gender === g ? 'text-primary-foreground' : 'text-foreground'
                    }`}
                  >
                    {g === 'male' ? '男' : '女'}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* 基础数据 */}
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Text className="text-sm font-semibold text-foreground mb-2">年龄</Text>
              <TextInput
                className="border border-input bg-card rounded-xl px-4 h-12 text-base text-foreground"
                placeholder="岁"
                placeholderTextColor="#a8a29e"
                keyboardType="number-pad"
                value={age}
                onChangeText={setAge}
              />
            </View>
            <View className="flex-1">
              <Text className="text-sm font-semibold text-foreground mb-2">身高</Text>
              <TextInput
                className="border border-input bg-card rounded-xl px-4 h-12 text-base text-foreground"
                placeholder="cm"
                placeholderTextColor="#a8a29e"
                keyboardType="number-pad"
                value={height}
                onChangeText={setHeight}
              />
            </View>
            <View className="flex-1">
              <Text className="text-sm font-semibold text-foreground mb-2">体重</Text>
              <TextInput
                className="border border-input bg-card rounded-xl px-4 h-12 text-base text-foreground"
                placeholder="kg"
                placeholderTextColor="#a8a29e"
                keyboardType="number-pad"
                value={weight}
                onChangeText={setWeight}
              />
            </View>
          </View>

          {/* 活动量 */}
          <View>
            <Text className="text-sm font-semibold text-foreground mb-3">日常活动量</Text>
            <View className="flex-row gap-3">
              {ACTIVITIES.map((a) => (
                <Pressable
                  key={a}
                  onPress={() => setActivity(a)}
                  className={`flex-1 h-12 rounded-xl border items-center justify-center ${
                    activity === a ? 'bg-primary border-primary' : 'bg-card border-border'
                  }`}
                  style={{ borderCurve: 'continuous' }}
                >
                  <Text
                    className={`text-sm font-medium ${
                      activity === a ? 'text-primary-foreground' : 'text-foreground'
                    }`}
                  >
                    {ACTIVITY_LABELS[a]}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* 忌口过敏 */}
          <View>
            <Text className="text-sm font-semibold text-foreground mb-2">忌口 / 过敏（选填）</Text>
            <TextInput
              className="border border-input bg-card rounded-xl px-4 h-12 text-base text-foreground"
              placeholder="如：花生、海鲜、乳糖不耐受"
              placeholderTextColor="#a8a29e"
              value={allergies}
              onChangeText={setAllergies}
            />
          </View>

          {error ? <Text className="text-destructive text-sm">{error}</Text> : null}

          <AvatarPicker
            visible={pickerOpen}
            selectedId={avatarId}
            onSelect={(avatar) => setAvatarId(avatar.id)}
            onClose={() => setPickerOpen(false)}
          />

          <Pressable
            onPress={handleSave}
            disabled={loading}
            className="bg-primary rounded-2xl h-14 items-center justify-center active:opacity-90"
            style={{ borderCurve: 'continuous' }}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="text-primary-foreground text-lg font-semibold">保存</Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
