import { useState, useCallback, useEffect } from 'react';
import { View, Pressable, ScrollView, TextInput, KeyboardAvoidingView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Sparkles, X, ImagePlus, Send, ShieldCheck } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { callCommunityAI, createCommunityPost, getProfile, getPublicUrl } from '@/db/api';
import { uploadImage, compressImage } from '@/lib/imageUpload';
import { isLocalBackend } from '@/client/supabase';
import type { PostType, Profile } from '@/types/types';
import { POST_TYPE_LABELS } from '@/types/types';
import { useSession } from '@/ctx';
import { Text } from '@/components/ui/text';

const TYPES: PostType[] = ['meal', 'progress', 'recipe', 'workout', 'talk'];

export default function CommunityPublishScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useSession();
  const userId = session?.user?.id || '';

  const [type, setType] = useState<PostType>('meal');
  const [content, setContent] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [calories, setCalories] = useState('');
  const [weight, setWeight] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    if (userId) getProfile(userId).then(setProfile).catch(() => {});
  }, [userId]);

  const authorName = profile?.nickname || '健康达人';
  const authorAvatar = profile?.avatar_url || null;

  const pickImages = useCallback(async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        setError('需要相册权限才能选择图片');
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({ quality: 0.7, allowsMultipleSelection: true, selectionLimit: 3, mediaTypes: ['images'] });
      if (!res.canceled) {
        const uris = res.assets.map((a) => a.uri);
        setImages((prev) => [...prev, ...uris].slice(0, 3));
      }
    } catch (e) {
      setError(String((e as Error)?.message || e));
    }
  }, []);

  const generateCaption = useCallback(async () => {
    setAiLoading(true);
    setError('');
    try {
      const ctx: Record<string, unknown> = { type };
      if (calories) ctx.calories = Number(calories);
      if (weight) ctx.weight = Number(weight);
      if (content) ctx.note = content;
      const res = await callCommunityAI({ action: 'caption', context: ctx });
      if (res.caption) setContent(res.caption);
    } catch (e) {
      setError(String((e as Error)?.message || e));
    } finally {
      setAiLoading(false);
    }
  }, [type, calories, weight, content]);

  const publish = useCallback(async () => {
    if (!content.trim() && images.length === 0) {
      setError('请输入内容或添加图片');
      return;
    }
    setPublishing(true);
    setError('');
    setInfo('');
    try {
      // Publishing to the local database does not require an external model.
      if (!isLocalBackend) {
        const moderate = await callCommunityAI({ action: 'moderate', text: content });
        if (moderate.passed !== true) {
          setError(`内容未通过审核：${moderate.reason || '审核未完成，请重试'}`);
          return;
        }
      }
      // 上传图片
      const uploaded: string[] = [];
      for (const uri of images) {
        const compressed = await compressImage(uri, 'image/jpeg', 1080);
        const path = await uploadImage(compressed.uri, 'image/jpeg');
        uploaded.push(path);
      }
      const data: Record<string, unknown> = {};
      if (type === 'meal' && calories) data.calories = Number(calories);
      if (type === 'progress' && weight) data.weight = Number(weight);
      if (type === 'workout' && calories) data.calories = Number(calories);

      await createCommunityPost({
        type,
        content: content.trim(),
        images: uploaded,
        data,
        tags: [POST_TYPE_LABELS[type]],
        status: 'approved',
        author_name: authorName,
        author_avatar: authorAvatar,
      });
      setInfo('发布成功');
      setTimeout(() => router.back(), 600);
    } catch (e) {
      setError(String((e as Error)?.message || e));
    } finally {
      setPublishing(false);
    }
  }, [content, images, type, calories, weight, authorName, authorAvatar, router]);

  return (
    <View className="flex-1 bg-background">
      <KeyboardAvoidingView behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <View className="flex-row items-center px-4 pt-4 pb-2" style={{ paddingTop: insets.top + 8 }}>
          <Pressable onPress={() => router.back()} className="w-10 h-10 items-center justify-center rounded-full active:bg-muted">
            <ArrowLeft size={22} color="#3F3A33" />
          </Pressable>
          <View className="flex-1 items-center">
            <Text className="text-lg font-bold text-foreground">发布动态</Text>
          </View>
          <View className="w-10" />
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }} keyboardShouldPersistTaps="handled">
          {/* 类型选择 */}
          <View className="px-4 mt-2">
            <Text className="text-sm font-semibold text-foreground mb-2">选择动态类型</Text>
            <View className="flex-row flex-wrap gap-2">
              {TYPES.map((t) => {
                const active = type === t;
                return (
                  <Pressable key={t} onPress={() => setType(t)} className={`rounded-full px-3.5 py-2 ${active ? 'bg-primary' : 'bg-secondary'}`}>
                    <Text className={`text-xs ${active ? 'text-primary-foreground font-semibold' : 'text-secondary-foreground'}`}>{POST_TYPE_LABELS[t]}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* 内容输入 */}
          <View className="mx-4 mt-3 bg-card rounded-2xl p-4 border border-border" style={{ borderCurve: 'continuous' }}>
            <TextInput
              value={content}
              onChangeText={setContent}
              placeholder="分享你的健康生活..."
              placeholderTextColor="#a8a29e"
              multiline
              className="text-base text-foreground"
              style={{ minHeight: 100, textAlignVertical: 'top' }}
            />
            <Pressable onPress={generateCaption} disabled={aiLoading} className="flex-row items-center gap-1.5 mt-2 active:opacity-60">
              {aiLoading ? <ActivityIndicator size="small" color="#D97724" /> : <Sparkles size={15} color="#D97724" />}
              <Text className="text-sm text-accent font-medium">{aiLoading ? 'AI 配文生成中...' : 'AI 帮我写文案'}</Text>
            </Pressable>
          </View>

          {/* 类型附加数据 */}
          {(type === 'meal' || type === 'workout') ? (
            <View className="mx-4 mt-3 bg-card rounded-2xl p-4 border border-border" style={{ borderCurve: 'continuous' }}>
              <Text className="text-sm font-semibold text-foreground mb-2">{type === 'meal' ? '本餐热量（千卡）' : '运动消耗（千卡）'}</Text>
              <TextInput
                value={calories}
                onChangeText={(t) => setCalories(t.replace(/[^0-9]/g, ''))}
                placeholder="如 420"
                placeholderTextColor="#a8a29e"
                keyboardType="numeric"
                className="bg-secondary rounded-xl px-4 py-3 text-base text-foreground"
              />
            </View>
          ) : null}
          {type === 'progress' ? (
            <View className="mx-4 mt-3 bg-card rounded-2xl p-4 border border-border" style={{ borderCurve: 'continuous' }}>
              <Text className="text-sm font-semibold text-foreground mb-2">当前体重（kg）</Text>
              <TextInput
                value={weight}
                onChangeText={(t) => setWeight(t.replace(/[^0-9.]/g, ''))}
                placeholder="如 65.5"
                placeholderTextColor="#a8a29e"
                keyboardType="numeric"
                className="bg-secondary rounded-xl px-4 py-3 text-base text-foreground"
              />
            </View>
          ) : null}

          {/* 图片 */}
          <View className="px-4 mt-3">
            <Text className="text-sm font-semibold text-foreground mb-2">添加图片（最多 3 张）</Text>
            <View className="flex-row flex-wrap gap-2">
              {images.map((uri, i) => (
                <View key={i} className="relative">
                  <Image source={{ uri }} style={{ width: 96, height: 96, borderRadius: 12 }} contentFit="cover" />
                  <Pressable onPress={() => setImages((p) => p.filter((_, idx) => idx !== i))} className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-destructive items-center justify-center">
                    <X size={14} color="#FFFCF7" />
                  </Pressable>
                </View>
              ))}
              {images.length < 3 ? (
                <Pressable onPress={pickImages} className="w-24 h-24 bg-secondary rounded-xl items-center justify-center active:bg-muted">
                  <ImagePlus size={24} color="#8a8278" />
                </Pressable>
              ) : null}
            </View>
          </View>

          {error ? <Text className="text-destructive text-sm mt-3 text-center px-4">{error}</Text> : null}
          {info ? <Text className="text-primary text-sm mt-3 text-center px-4">{info}</Text> : null}

          <View className="px-4 mt-4">
            <Pressable onPress={publish} disabled={publishing} className="bg-primary rounded-xl py-4 items-center flex-row justify-center gap-2 active:opacity-90">
              {publishing ? <ActivityIndicator color="#FFFCF7" /> : <Send size={18} color="#FFFCF7" />}
              <Text className="text-base font-semibold text-primary-foreground">{publishing ? '发布中...' : '发布动态'}</Text>
            </Pressable>
            <View className="flex-row items-center justify-center gap-1.5 mt-3">
              <ShieldCheck size={13} color="#8a8278" />
              <Text className="text-xs text-muted-foreground">{isLocalBackend ? '仅发布到本机社区，未启用 AI 审核' : '发布前将由 AI 自动审核内容合规性'}</Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
