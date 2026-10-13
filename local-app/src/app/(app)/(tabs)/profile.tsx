import { useState, useCallback } from 'react';
import { View, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import {
  Settings,
  LogOut,
  ChevronRight,
  Target,
  Ruler,
  Scale,
  AlertTriangle,
  Camera,
} from 'lucide-react-native';
import { getProfile, updateProfile } from '@/db/api';
import { supabase, isLocalBackend } from '@/client/supabase';
import { useSession } from '@/ctx';
import type { Profile } from '@/types/types';
import { GOAL_LABELS, ACTIVITY_LABELS } from '@/types/types';
import { getAvatarById } from '@/constants/avatars';
import { AvatarPicker } from '@/components/AvatarPicker';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { Text } from '@/components/ui/text';

export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useSession();
  const userId = session?.user?.id;
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState('');
  const [loggingOut, setLoggingOut] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      setError('');
      setProfile(await getProfile(userId));
    } catch (e) {
      setError((e as Error).message || '个人信息加载失败');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const currentAvatar = getAvatarById(profile?.avatar_url);

  const handleSelectAvatar = useCallback(async (avatar: { id: string }) => {
    if (!userId) return;
    try {
      setError('');
      await updateProfile(userId, { avatar_url: avatar.id });
      setProfile((prev) => (prev ? { ...prev, avatar_url: avatar.id } : prev));
    } catch (e) {
      setError((e as Error).message || '头像保存失败');
    }
  }, [userId]);

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    setError('');
    try {
      const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' });
      if (signOutError) throw signOutError;
      router.replace('/sign-in');
    } catch (e) {
      setError((e as Error).message || '退出登录失败，请重试');
    } finally {
      setLoggingOut(false);
    }
  };

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" color="#38764A" />
      </View>
    );
  }

  const username = session?.user?.email?.replace('@miaoda.com', '') || '用户';

  const infoRows = [
    { icon: Target, label: '健康目标', value: profile?.goal ? GOAL_LABELS[profile.goal] : '未设置' },
    { icon: Scale, label: '当前体重', value: profile?.weight_kg ? `${profile.weight_kg} kg` : '未设置' },
    { icon: Ruler, label: '身高', value: profile?.height_cm ? `${profile.height_cm} cm` : '未设置' },
    {
      icon: ChevronRight,
      label: '活动量',
      value: profile?.activity_level ? ACTIVITY_LABELS[profile.activity_level] : '未设置',
    },
    { icon: AlertTriangle, label: '忌口/过敏', value: profile?.allergies || '无' },
  ];

  return (
    <View className="flex-1 bg-background">
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} contentInsetAdjustmentBehavior="automatic">
        {/* 头部 */}
        <View
          className="px-5 pb-6 bg-primary"
          style={{ paddingTop: insets.top + 20 }}
        >
          <View className="flex-row items-center">
            <Pressable
              onPress={() => setPickerOpen(true)}
              className="w-16 h-16 rounded-full bg-white/20 items-center justify-center border-2 border-white/30 active:opacity-80"
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
                <Camera size={26} color="#fff" />
              )}
            </Pressable>
            <View className="ml-4 flex-1">
              <Text className="text-xl font-bold text-primary-foreground">{username}</Text>
              <Text className="text-sm text-primary-foreground/80">
                {profile?.goal ? `${GOAL_LABELS[profile.goal]}模式` : '完善信息以获得推荐'}
              </Text>
            </View>
            <Pressable
              onPress={() => setPickerOpen(true)}
              className="px-3 py-1.5 rounded-full bg-white/20 active:opacity-70"
            >
              <Text className="text-xs font-medium text-primary-foreground">换头像</Text>
            </Pressable>
          </View>
        </View>

        {/* 健康信息 */}
        <View className="px-5 -mt-4">
          <View
            className="bg-card rounded-3xl p-2 border border-border"
            style={{ borderCurve: 'continuous' }}
          >
            {infoRows.map((row, idx) => (
              <Pressable
                key={row.label}
                onPress={() => router.push('/(app)/onboarding')}
                className={`flex-row items-center px-4 py-3.5 active:bg-muted ${
                  idx !== infoRows.length - 1 ? 'border-b border-border' : ''
                }`}
              >
                <row.icon size={18} color="#38764A" />
                <Text className="flex-1 text-sm text-foreground ml-3">{row.label}</Text>
                <Text className="text-sm text-muted-foreground mr-1">{row.value}</Text>
                <ChevronRight size={16} color="#c4bfb8" />
              </Pressable>
            ))}
          </View>
        </View>

        {/* 操作 */}
        <View className="px-5 mt-5 gap-3">
          {error ? <Text className="text-sm text-destructive">{error}</Text> : null}
          {isLocalBackend ? <Text className="text-xs text-muted-foreground">记录保存在本机。文字建议与照片识别由本地模型处理；生图和图片编辑需图像服务就绪。</Text> : null}
          <Pressable
            onPress={() => router.push('/(app)/onboarding')}
            className="bg-card rounded-2xl p-4 flex-row items-center border border-border active:bg-muted"
            style={{ borderCurve: 'continuous' }}
          >
            <Settings size={20} color="#38764A" />
            <Text className="flex-1 text-base text-foreground ml-3">编辑健康信息</Text>
            <ChevronRight size={18} color="#c4bfb8" />
          </Pressable>

          <Pressable
            onPress={() => setLogoutOpen(true)}
            className="bg-card rounded-2xl p-4 flex-row items-center border border-border active:bg-muted"
            style={{ borderCurve: 'continuous' }}
          >
            <LogOut size={20} color="#D97724" />
            <Text className="flex-1 text-base text-foreground ml-3">退出登录</Text>
          </Pressable>
        </View>

        <Text className="text-center text-xs text-muted-foreground mt-8">食光 · 让每一餐都营养有光</Text>
      </ScrollView>

      <AvatarPicker
        visible={pickerOpen}
        selectedId={profile?.avatar_url}
        onSelect={handleSelectAvatar}
        onClose={() => setPickerOpen(false)}
      />

      <AlertDialog open={logoutOpen} onOpenChange={setLogoutOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>退出登录</AlertDialogTitle>
            <AlertDialogDescription>确定要退出当前账号吗？</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              <Text>取消</Text>
            </AlertDialogCancel>
            <AlertDialogAction onPress={handleLogout} disabled={loggingOut}>
              <Text>{loggingOut ? '退出中...' : '退出'}</Text>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </View>
  );
}
