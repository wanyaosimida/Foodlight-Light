import { useState, useCallback } from 'react';
import { View, Pressable, FlatList, ActivityIndicator, RefreshControl } from 'react-native';
import { useRouter, useFocusEffect, type RelativePathString } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import {
  Plus,
  Flame,
  UtensilsCrossed,
  Sparkles,
  ChefHat,
  RefreshCw,
  ScanLine,
  Box,
  ShoppingBag,
  Zap,
  UserCheck,
} from 'lucide-react-native';
import { listRecipes, getPublicUrl } from '@/db/api';
import { useSession } from '@/ctx';
import type { Recipe } from '@/types/types';
import { MEAL_TYPE_LABELS } from '@/types/types';
import { Text } from '@/components/ui/text';
import { isLocalBackend } from '@/client/supabase';

const FEATURED_TOOLS = [
  {
    key: 'fridge',
    title: '冰箱盲盒清库',
    desc: '10-15分钟极速清库 · 零浪费出餐',
    tag: '零浪费',
    tagColor: '#2D8B57',
    icon: Box,
    bgClass: 'bg-[#F2F8F4]',
    borderClass: 'border-[#2D8B57]/20',
    color: '#2D8B57',
    path: '/(app)/fridge-clearance',
  },
  {
    key: 'takeout',
    title: '外卖避坑军师',
    desc: '红绿灯科学点单 · 一键神备注',
    tag: '避油糖',
    tagColor: '#E87A30',
    icon: ShoppingBag,
    bgClass: 'bg-[#FDF7F2]',
    borderClass: 'border-[#E87A30]/20',
    color: '#E87A30',
    path: '/(app)/takeout-advisor',
  },
];

const MORE_TOOLS = [
  {
    key: 'glycemic',
    title: '动态GL防困预警',
    desc: '测算升糖负荷与进食顺序',
    icon: Zap,
    color: '#0284C7',
    path: '/(app)/glycemic-advisor',
  },
  {
    key: 'avatar',
    title: 'AI健康数字分身',
      desc: '健康记录与30-90天主题激励海报',
    icon: UserCheck,
    color: '#9333EA',
    path: '/(app)/body-avatar',
  },
  {
    key: 'recipe',
    title: 'AI 食谱生成',
    desc: '现有食材智能营养配餐',
    icon: ChefHat,
    color: '#38764A',
    path: '/(app)/recipe-generate',
  },
  {
    key: 'substitute',
    title: 'AI 食物健康替代',
    desc: '口感相似 · 热量大降方案',
    icon: RefreshCw,
    color: '#D97724',
    path: '/(app)/food-substitute',
  },
  {
    key: 'package',
    title: 'AI 包装成分解读',
    desc: '拍照秒查隐藏糖钠与配料',
    icon: ScanLine,
    color: '#7C3AED',
    path: '/(app)/package-scan',
  },
];

function RecipeCardItem({ item, onPress }: { item: Recipe; onPress: () => void }) {
  const [imgError, setImgError] = useState(false);
  const cover = item.cover_url ? getPublicUrl(item.cover_url) : null;
  const cal = item.nutrition?.calories || 0;

  return (
    <Pressable
      onPress={onPress}
      className="bg-card rounded-2xl p-3 border border-border flex-row active:bg-muted"
      style={{ borderCurve: 'continuous' }}
    >
      <View className="w-20 h-20 rounded-xl bg-secondary overflow-hidden items-center justify-center shrink-0">
        {cover && !imgError ? (
          <Image
            source={{ uri: cover }}
            className="w-full h-full"
            contentFit="cover"
            transition={200}
            onError={() => setImgError(true)}
          />
        ) : (
          <UtensilsCrossed size={26} color="#38764A" />
        )}
      </View>
      <View className="flex-1 ml-3 justify-center">
        <View className="flex-row items-center gap-1.5">
          {item.is_ai_generated ? (
            <View className="flex-row items-center bg-accent/15 rounded px-1.5 py-0.5">
              <Sparkles size={10} color="#D97724" />
              <Text className="text-[10px] text-accent font-medium">AI</Text>
            </View>
          ) : null}
          {item.meal_type ? (
            <View className="bg-secondary rounded px-1.5 py-0.5">
              <Text className="text-[10px] text-secondary-foreground font-medium">
                {MEAL_TYPE_LABELS[item.meal_type]}
              </Text>
            </View>
          ) : null}
        </View>
        <Text className="text-base font-semibold text-foreground mt-1" numberOfLines={1}>
          {item.title}
        </Text>
        <View className="flex-row items-center gap-1 mt-1">
          <Flame size={12} color="#D97724" />
          <Text className="text-xs text-muted-foreground">{cal} 千卡</Text>
          <Text className="text-xs text-muted-foreground">· {(item.ingredients || []).length} 种食材</Text>
        </View>
      </View>
    </Pressable>
  );
}

export default function WorkshopScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useSession();
  const userId = session?.user?.id;

  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');

  const load = useCallback(async () => {
    if (!userId) return;
    setLoadError('');
    try {
      setRecipes(await listRecipes(userId));
    } catch (e) {
      setLoadError((e as Error).message || '食谱加载失败');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const renderItem = ({ item }: { item: Recipe }) => (
    <RecipeCardItem item={item} onPress={() => router.push(`/(app)/recipe/${item.id}`)} />
  );

  const ListHeader = (
    <View className="mb-2">
      {isLocalBackend ? <Text className="text-xs text-muted-foreground px-5 mb-3">记录保存在本机。文字建议与照片识别由本地模型处理；生图和图片编辑需图像服务就绪。</Text> : null}
      {loadError ? (
        <Pressable onPress={load} className="mx-5 mb-3 p-3 bg-card rounded-xl border border-border">
          <Text className="text-sm text-destructive">食谱加载失败：{loadError}</Text>
          <Text className="text-xs text-primary mt-1">点击重新加载</Text>
        </Pressable>
      ) : null}
      {/* 顶部主推助手区（横向大气双卡片） */}
      <View className="px-5 mb-4">
        <View className="flex-row items-center gap-1.5 mb-2.5">
          <Sparkles size={16} color="#2D8B57" />
          <Text className="text-base font-bold text-foreground">日常出餐避坑核心推荐</Text>
        </View>

        <View className="gap-2.5">
          {FEATURED_TOOLS.map((t) => (
            <Pressable
              key={t.key}
              onPress={() => router.push(t.path as RelativePathString)}
              className={`${t.bgClass} border ${t.borderClass} rounded-2xl p-3.5 flex-row items-center justify-between active:opacity-85 shadow-sm`}
              style={{ borderCurve: 'continuous' }}
            >
              <View className="flex-row items-center gap-3 flex-1 mr-2">
                <View
                  className="w-11 h-11 rounded-xl items-center justify-center shadow-xs"
                  style={{ backgroundColor: `${t.color}20` }}
                >
                  <t.icon size={22} color={t.color} />
                </View>
                <View className="flex-1">
                  <View className="flex-row items-center gap-2 mb-0.5">
                    <Text className="text-sm font-bold text-foreground">{t.title}</Text>
                    <View
                      className="px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: `${t.tagColor}18` }}
                    >
                      <Text
                        className="text-[10px] font-bold"
                        style={{ color: t.tagColor }}
                      >
                        {t.tag}
                      </Text>
                    </View>
                  </View>
                  <Text className="text-xs text-muted-foreground">{t.desc}</Text>
                </View>
              </View>

              <Text className="text-xs font-bold" style={{ color: t.color }}>
                立即体验 &gt;
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* 营养与健康工具箱（规整宽敞卡片列表） */}
      <View className="px-5">
        <Text className="text-sm font-bold text-foreground mb-2.5">AI 智能工具箱</Text>
        <View className="gap-2">
          {MORE_TOOLS.map((t) => (
            <Pressable
              key={t.key}
              onPress={() => router.push(t.path as RelativePathString)}
              className="bg-card rounded-xl p-3 border border-border flex-row items-center justify-between active:bg-muted"
              style={{ borderCurve: 'continuous' }}
            >
              <View className="flex-row items-center gap-3 flex-1">
                <View
                  className="w-9 h-9 rounded-lg items-center justify-center shrink-0"
                  style={{ backgroundColor: `${t.color}15` }}
                >
                  <t.icon size={18} color={t.color} />
                </View>
                <View className="flex-1 mr-2">
                  <Text className="text-sm font-semibold text-foreground">{t.title}</Text>
                  <Text className="text-xs text-muted-foreground mt-0.5">{t.desc}</Text>
                </View>
              </View>
              <Text className="text-xs text-muted-foreground">&gt;</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* 我的食谱标题与新建按钮 */}
      <View className="flex-row items-center justify-between px-5 mt-6 mb-2">
        <View>
          <Text className="text-base font-bold text-foreground">我的个性化食谱</Text>
          <Text className="text-xs text-muted-foreground">记录与沉淀每一餐美味</Text>
        </View>
        <Pressable
          onPress={() => router.push('/(app)/recipe/create')}
          className="bg-primary rounded-xl px-4 py-2 flex-row items-center gap-1.5 active:opacity-90 shadow-sm"
        >
          <Plus size={15} color="#FFFFFF" />
          <Text className="text-xs font-bold text-primary-foreground">新建食谱</Text>
        </Pressable>
      </View>
    </View>
  );

  return (
    <View className="flex-1 bg-background">
      <View className="px-5 pb-2" style={{ paddingTop: insets.top + 12 }}>
        <Text className="text-2xl font-bold text-foreground">食谱工坊</Text>
        <Text className="text-sm text-muted-foreground">AI 配餐 · 健康替代 · 包装解读</Text>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#38764A" />
        </View>
      ) : (
        <FlatList
          data={recipes}
          keyExtractor={(i) => i.id}
          renderItem={renderItem}
          ListHeaderComponent={ListHeader}
          contentContainerStyle={{ paddingBottom: 40, gap: 12 }}
          contentInsetAdjustmentBehavior="automatic"
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#38764A" />
          }
          ListEmptyComponent={
            <View className="items-center py-16 px-5">
              <View className="w-16 h-16 rounded-2xl bg-secondary items-center justify-center mb-4">
                <UtensilsCrossed size={30} color="#38764A" />
              </View>
              <Text className="text-base font-semibold text-foreground">还没有食谱</Text>
              <Text className="text-sm text-muted-foreground mt-1 text-center">试试上方的 AI 食谱生成，或点击新建创建食谱</Text>
            </View>
          }
        />
      )}
    </View>
  );
}
