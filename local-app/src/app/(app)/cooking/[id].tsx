import { useState, useCallback, useRef, useEffect } from 'react';
import { View, Pressable, ScrollView } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { AudioModule, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { isLocalBackend } from '@/client/supabase';
import {
  ChevronLeft,
  ChevronRight,
  Volume2,
  VolumeX,
  Check,
  Play,
  Sparkles,
  ChefHat,
} from 'lucide-react-native';
import { getRecipe, getPublicUrl, callKlingSound } from '@/db/api';
import type { Recipe } from '@/types/types';
import { Text } from '@/components/ui/text';

export default function CookingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id: string }>();
  const id = params.id;

  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [stepIdx, setStepIdx] = useState(0);
  const [soundUrl, setSoundUrl] = useState<string | null>(null);
  const [generatingSound, setGeneratingSound] = useState(false);
  const [soundOn, setSoundOn] = useState(false);
  const [done, setDone] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const player = useAudioPlayer(soundUrl || undefined);
  const playbackStatus = useAudioPlayerStatus(player);

  useEffect(() => { player.loop = true; }, [player]);

  useEffect(() => {
    if (!playbackStatus.isLoaded) return;
    if (soundOn) player.play();
    else player.pause();
  }, [player, playbackStatus.isLoaded, soundOn]);

  useEffect(() => {
    setSoundOn(false);
    setSoundUrl(null);
  }, [stepIdx]);

  useEffect(() => {
    if (!id) return;
    getRecipe(id).then(setRecipe)
      .catch((e) => setError((e as Error).message || '食谱加载失败'))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { setImgError(false); }, [stepIdx]);

  const steps = recipe?.steps || [];
  const current = steps[stepIdx];
  const isLast = stepIdx >= steps.length - 1;

  const handleGenerateSound = useCallback(async () => {
    if (!current) return;
    setGeneratingSound(true);
    setError('');
    try {
      const prompt = `Cooking sound effect: ${current.text.slice(0, 40)}, realistic kitchen ambient sound`;
      const res = await callKlingSound(prompt);
      const url = res?.data?.[0]?.url;
      if (url) {
        setSoundUrl(url);
        setSoundOn(true);
      }
    } catch (e) {
      setError((e as Error).message || '音效生成失败');
      setSoundOn(false);
    } finally {
      setGeneratingSound(false);
    }
  }, [current]);

  const toggleSound = useCallback(async () => {
    if (!soundUrl) {
      await handleGenerateSound();
      return;
    }
    if (soundOn) {
      player.pause();
      setSoundOn(false);
    } else {
      try {
        await AudioModule.setAudioModeAsync({ playsInSilentMode: true });
        player.play();
        setSoundOn(true);
      } catch {
        setSoundOn(false);
      }
    }
  }, [soundUrl, soundOn, player, handleGenerateSound]);

  const goNext = () => {
    if (isLast) {
      setDone(true);
      player.pause();
    } else {
      setStepIdx((i) => i + 1);
      if (soundOn) player.play();
    }
  };

  const goPrev = () => {
    if (stepIdx > 0) setStepIdx((i) => i - 1);
  };

  if (!recipe || steps.length === 0) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <Text className="text-muted-foreground">{loading ? '加载中...' : error || (recipe ? '此食谱尚未填写烹饪步骤' : '食谱不存在')}</Text>
        {!loading ? <Pressable onPress={() => router.back()} className="mt-4"><Text className="text-primary">返回食谱</Text></Pressable> : null}
      </View>
    );
  }

  if (done) {
    return (
      <View className="flex-1 bg-background items-center justify-center px-8" style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
        <View className="w-20 h-20 rounded-full bg-primary items-center justify-center mb-5">
          <ChefHat size={40} color="#fff" />
        </View>
        <Text className="text-2xl font-bold text-foreground mb-2">烹饪完成！</Text>
        <Text className="text-sm text-muted-foreground text-center mb-8">
          「{recipe.title}」已完成，祝用餐愉快 🍽️
        </Text>
        <Pressable
          onPress={() => router.back()}
          className="bg-primary rounded-2xl px-10 h-12 items-center justify-center active:opacity-90"
          style={{ borderCurve: 'continuous' }}
        >
          <Text className="text-primary-foreground font-semibold">返回食谱</Text>
        </Pressable>
      </View>
    );
  }

  const cover = current?.image_url
    ? getPublicUrl(current.image_url)
    : recipe.cover_url
      ? getPublicUrl(recipe.cover_url)
      : null;

  return (
    <View className="flex-1 bg-background">
      {/* 顶部 */}
      <View className="flex-row items-center px-4 pb-2" style={{ paddingTop: insets.top + 8 }}>
        <Pressable
          onPress={() => router.back()}
          className="w-10 h-10 rounded-full bg-card border border-border items-center justify-center active:bg-muted"
          hitSlop={8}
        >
          <ChevronLeft size={24} color="#242220" />
        </Pressable>
        <View className="flex-1 items-center">
          <Text className="text-sm font-semibold text-foreground">{recipe.title}</Text>
          <Text className="text-xs text-muted-foreground">
            步骤 {stepIdx + 1} / {steps.length}
          </Text>
        </View>
        <View className="w-10" />
      </View>

      {/* 进度条 */}
      <View className="px-5 mb-4">
        <View className="h-1.5 rounded-full bg-muted overflow-hidden">
          <View
            className="h-1.5 rounded-full bg-primary"
            style={{ width: `${((stepIdx + 1) / steps.length) * 100}%` }}
          />
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
        <View className="px-5">
          {/* 步骤图片 */}
          {cover && !imgError ? (
            <Image
              source={{ uri: cover }}
              className="w-full h-56 rounded-3xl"
              contentFit="cover"
              onError={() => setImgError(true)}
            />
          ) : (
            <View className="w-full h-56 rounded-3xl bg-secondary items-center justify-center" style={{ borderCurve: 'continuous' }}>
              <Sparkles size={40} color="#38764A" />
            </View>
          )}

          {/* 大字步骤 */}
          <View className="mt-6">
            <View className="flex-row items-center gap-2 mb-3">
              <View className="w-8 h-8 rounded-full bg-primary items-center justify-center">
                <Text className="text-sm text-primary-foreground font-bold">{stepIdx + 1}</Text>
              </View>
              <Text className="text-sm text-muted-foreground">当前步骤</Text>
            </View>
            <Text className="text-[28px] font-bold text-foreground leading-10">
              {current?.text}
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* 底部操作 */}
      <View
        className="bg-card border-t border-border px-5 pt-3"
        style={{ paddingBottom: insets.bottom + 12 }}
      >
        {error ? <Text className="text-xs text-destructive text-center mb-3">{error}</Text> : null}
        <Pressable
          onPress={toggleSound}
          disabled={generatingSound}
          className="flex-row items-center justify-center mb-3 active:opacity-70"
        >
          {soundOn ? <Volume2 size={16} color="#38764A" /> : <VolumeX size={16} color="#a8a29e" />}
          <Text className="text-xs text-muted-foreground ml-1.5">
            {generatingSound ? '音效生成中...' : soundOn ? '关闭音效' : soundUrl ? '播放音效' : isLocalBackend ? '生成本地合成音效' : '生成烹饪音效'}
          </Text>
        </Pressable>

        <View className="flex-row gap-3">
          <Pressable
            onPress={goPrev}
            disabled={stepIdx === 0}
            className={`w-14 h-14 rounded-2xl items-center justify-center border ${
              stepIdx === 0 ? 'bg-muted border-border' : 'bg-card border-border active:bg-muted'
            }`}
            style={{ borderCurve: 'continuous' }}
          >
            <ChevronLeft size={24} color={stepIdx === 0 ? '#c4bfb8' : '#242220'} />
          </Pressable>
          <Pressable
            onPress={goNext}
            className="flex-1 bg-primary rounded-2xl h-14 items-center justify-center active:opacity-90"
            style={{ borderCurve: 'continuous' }}
          >
            <View className="flex-row items-center">
              {isLast ? <Check size={22} color="#fff" /> : <Play size={20} color="#fff" />}
              <Text className="text-primary-foreground text-lg font-semibold ml-2">
                {isLast ? '完成烹饪' : '下一步'}
              </Text>
            </View>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
