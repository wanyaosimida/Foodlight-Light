import { useState, useCallback } from 'react';
import { View, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import {
  ChevronLeft,
  Flame,
  Beef,
  Wheat,
  Droplet,
  Play,
  Trash2,
  PlusCircle,
  Sparkles,
} from 'lucide-react-native';
import { getRecipe, deleteRecipe, getPublicUrl, todayStr, createMealLog } from '@/db/api';
import { useSession } from '@/ctx';
import type { Recipe, MealType } from '@/types/types';
import { MEAL_TYPE_LABELS } from '@/types/types';
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

export default function RecipeDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id: string }>();
  const id = params.id;
  const { session } = useSession();
  const userId = session?.user?.id;

  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [added, setAdded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setError('');
    try {
      setRecipe(await getRecipe(id));
    } catch (e) {
      setError((e as Error).message || '食谱加载失败');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleDelete = async () => {
    if (!id) return;
    setError('');
    try {
      await deleteRecipe(id);
      router.back();
    } catch (e) {
      setError((e as Error).message || '食谱删除失败');
    }
  };

  const handleAddToLog = async () => {
    if (!recipe || !userId || saving || added) return;
    setSaving(true);
    setError('');
    try {
      await createMealLog({
        log_date: todayStr(),
        meal_type: (recipe.meal_type || 'lunch') as MealType,
        food_name: recipe.title,
        portion: '1份',
        calories: recipe.nutrition?.calories || 0,
        protein: recipe.nutrition?.protein || 0,
        carbs: recipe.nutrition?.carbs || 0,
        fat: recipe.nutrition?.fat || 0,
        image_url: recipe.cover_url || null,
        recipe_id: recipe.id,
      });
      setAdded(true);
      setTimeout(() => router.back(), 700);
    } catch (e) {
      setError((e as Error).message || '餐食记录保存失败');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" color="#38764A" />
      </View>
    );
  }

  if (!recipe) {
    return (
      <View className="flex-1 items-center justify-center bg-background px-8">
        <Text className="text-muted-foreground">{error || '食谱不存在'}</Text>
        <Pressable onPress={() => router.back()} className="mt-4">
          <Text className="text-primary">返回</Text>
        </Pressable>
      </View>
    );
  }

  const cover = recipe.cover_url ? getPublicUrl(recipe.cover_url) : null;
  const nut = recipe.nutrition || { calories: 0, protein: 0, carbs: 0, fat: 0 };
  const macros = [
    { icon: Flame, label: '热量', value: nut.calories, unit: '千卡', color: '#D97724' },
    { icon: Beef, label: '蛋白质', value: nut.protein, unit: 'g', color: '#D97724' },
    { icon: Wheat, label: '碳水', value: nut.carbs, unit: 'g', color: '#38764A' },
    { icon: Droplet, label: '脂肪', value: nut.fat, unit: 'g', color: '#7c5cbf' },
  ];

  return (
    <View className="flex-1 bg-background">
      {/* 顶部图片 */}
      <View style={{ paddingTop: insets.top }}>
        <View className="flex-row items-center px-4 py-2 absolute top-0 left-0 right-0 z-10" style={{ top: insets.top }}>
          <Pressable
            onPress={() => router.back()}
            className="w-10 h-10 rounded-full bg-black/40 items-center justify-center"
            hitSlop={8}
          >
            <ChevronLeft size={24} color="#fff" />
          </Pressable>
          <View className="flex-1" />
          <Pressable
            onPress={() => setDeleteOpen(true)}
            className="w-10 h-10 rounded-full bg-black/40 items-center justify-center"
            hitSlop={8}
          >
            <Trash2 size={18} color="#fff" />
          </Pressable>
        </View>

        {cover && !imgError ? (
          <Image
            source={{ uri: cover }}
            className="w-full h-64"
            contentFit="cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <View className="w-full h-64 bg-primary/20 items-center justify-center">
            <Sparkles size={48} color="#38764A" />
          </View>
        )}
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}>
        <View className="px-5 -mt-6">
          {error ? <Text className="text-sm text-destructive bg-card p-3 mb-2">{error}</Text> : null}
          {/* 标题卡 */}
          <View className="bg-card rounded-3xl p-5 border border-border" style={{ borderCurve: 'continuous' }}>
            <View className="flex-row items-center gap-2 mb-1">
              {recipe.is_ai_generated ? (
                <View className="flex-row items-center bg-accent/15 rounded px-1.5 py-0.5">
                  <Sparkles size={10} color="#D97724" />
                  <Text className="text-[10px] text-accent ml-0.5">AI生成</Text>
                </View>
              ) : null}
              {recipe.meal_type ? (
                <View className="bg-secondary rounded px-1.5 py-0.5">
                  <Text className="text-[10px] text-secondary-foreground">{MEAL_TYPE_LABELS[recipe.meal_type]}</Text>
                </View>
              ) : null}
            </View>
            <Text className="text-2xl font-bold text-foreground">{recipe.title}</Text>

            {/* 营养 */}
            <View className="flex-row mt-4 gap-3">
              {macros.map((m) => (
                <View key={m.label} className="flex-1 items-center bg-muted rounded-xl py-2.5">
                  <m.icon size={16} color={m.color} />
                  <Text className="text-base font-bold text-foreground mt-1">{m.value}</Text>
                  <Text className="text-[10px] text-muted-foreground">{m.label} {m.unit}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* 营养师点评 */}
          {recipe.nutritionist_comment ? (
            <View className="bg-secondary rounded-2xl p-4 border border-border mt-4" style={{ borderCurve: 'continuous' }}>
              <Text className="text-xs font-semibold text-secondary-foreground mb-1">营养师点评</Text>
              <Text className="text-sm text-secondary-foreground leading-5">{recipe.nutritionist_comment}</Text>
            </View>
          ) : null}

          {/* 食材 */}
          <View className="mt-5">
            <Text className="text-lg font-bold text-foreground mb-3">食材清单</Text>
            <View className="bg-card rounded-2xl p-2 border border-border" style={{ borderCurve: 'continuous' }}>
              {(recipe.ingredients || []).map((ing, idx) => (
                <View
                  key={idx}
                  className={`flex-row items-center px-3 py-3 ${idx !== (recipe.ingredients || []).length - 1 ? 'border-b border-border' : ''}`}
                >
                  <Text className="flex-1 text-sm text-foreground">{ing.name}</Text>
                  <Text className="text-sm text-muted-foreground">{ing.amount}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* 步骤 */}
          <View className="mt-5">
            <Text className="text-lg font-bold text-foreground mb-3">烹饪步骤</Text>
            <View className="gap-3">
              {(recipe.steps || []).map((step, idx) => (
                <View key={idx} className="bg-card rounded-2xl p-4 border border-border" style={{ borderCurve: 'continuous' }}>
                  <View className="flex-row items-start">
                    <View className="w-7 h-7 rounded-full bg-primary items-center justify-center mr-3">
                      <Text className="text-xs text-primary-foreground font-bold">{idx + 1}</Text>
                    </View>
                    <Text className="flex-1 text-sm text-foreground leading-6">{step.text}</Text>
                  </View>
                  {step.image_url ? <Image source={{ uri: getPublicUrl(step.image_url) }} className="w-full h-40 rounded-xl mt-3" contentFit="cover" /> : null}
                </View>
              ))}
            </View>
          </View>
        </View>
      </ScrollView>

      {/* 底部操作 */}
      <View
        className="absolute bottom-0 left-0 right-0 bg-card border-t border-border px-5 pt-3 flex-row gap-3"
        style={{ paddingBottom: insets.bottom + 12 }}
      >
        <Pressable
          onPress={handleAddToLog}
          disabled={added || saving}
          className="flex-1 bg-secondary rounded-2xl h-12 items-center justify-center active:opacity-80"
          style={{ borderCurve: 'continuous' }}
        >
          <View className="flex-row items-center">
            <PlusCircle size={18} color="#38764A" />
            <Text className="text-primary font-semibold ml-1.5">{added ? '已记录' : saving ? '保存中...' : '记入今日'}</Text>
          </View>
        </Pressable>
        <Pressable
          onPress={() => router.push(`/(app)/cooking/${recipe.id}`)}
          className="flex-1 bg-primary rounded-2xl h-12 items-center justify-center active:opacity-90"
          style={{ borderCurve: 'continuous' }}
        >
          <View className="flex-row items-center">
            <Play size={18} color="#fff" />
            <Text className="text-primary-foreground font-semibold ml-1.5">开始烹饪</Text>
          </View>
        </Pressable>
      </View>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除食谱</AlertDialogTitle>
            <AlertDialogDescription>确定删除「{recipe.title}」吗？此操作不可撤销。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              <Text>取消</Text>
            </AlertDialogCancel>
            <AlertDialogAction onPress={handleDelete}>
              <Text>删除</Text>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </View>
  );
}
