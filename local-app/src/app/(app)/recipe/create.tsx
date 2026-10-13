import { useState } from 'react';
import {
  View,
  Pressable,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import {
  Plus,
  Trash2,
  Sparkles,
  ImagePlus,
  Check,
  Wand2,
  Film,
  Camera,
} from 'lucide-react-native';
import { pickImageFromGallery, takePhoto, compressImage, uploadImage, assetToBase64 } from '@/lib/imageUpload';
import { callImageGeneration, callImageEdit, createRecipe } from '@/db/api';
import { useSession } from '@/ctx';
import type { Ingredient, MealType, RecipeStep } from '@/types/types';
import { MEAL_TYPE_LABELS } from '@/types/types';
import { PageHeader } from '@/components/PageHeader';
import { Text } from '@/components/ui/text';

const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

interface StepItem {
  text: string;
  image: string | null; // local uri or data uri
}

export default function CreateRecipeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useSession();
  const userId = session?.user?.id;

  const [title, setTitle] = useState('');
  const [mealType, setMealType] = useState<MealType>('lunch');
  const [ingredients, setIngredients] = useState<Ingredient[]>([{ name: '', amount: '' }]);
  const [steps, setSteps] = useState<StepItem[]>([{ text: '', image: null }]);
  const [coverUri, setCoverUri] = useState<string | null>(null);
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [comment, setComment] = useState('');

  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const updateIngredient = (idx: number, field: keyof Ingredient, value: string) => {
    setIngredients((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  };

  const updateStep = (idx: number, field: keyof StepItem, value: string) => {
    setSteps((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  };

  // AI 生成配图
  const handleGenerateCover = async () => {
    if (!title.trim()) {
      setError('请先填写食谱名称');
      return;
    }
    setGenerating(true);
    setError('');
    try {
      const prompt = `Professional food photography of ${title}, beautifully plated, natural lighting, top-down view, appetizing, high quality, detailed, on a clean wooden table`;
      const res = await callImageGeneration(prompt, '1024x1024');
      const b64 = res?.data?.[0]?.b64_json;
      if (b64) {
        setCoverUri(`data:image/png;base64,${b64}`);
      } else {
        setError('配图生成失败');
      }
    } catch (e) {
      setError(String((e as Error).message || e));
    } finally {
      setGenerating(false);
    }
  };

  // 为步骤添加图片（拍照/相册）
  const handlePickCover = async () => {
    setError('');
    try {
      const asset = await pickImageFromGallery();
      if (asset) setCoverUri(asset.uri);
    } catch (e) {
      setError((e as Error).message || '封面选择失败');
    }
  };

  const handleStepImage = async (idx: number, fromCamera: boolean) => {
    try {
      const asset = fromCamera ? await takePhoto() : await pickImageFromGallery();
      if (!asset) return;
      updateStep(idx, 'image', asset.uri);
    } catch (e) {
      const msg = String((e as Error).message || e);
      setError(msg.includes('PERMISSION_DENIED') ? '需要相机/相册权限' : msg);
    }
  };

  // AI 编辑配图（风格转换）
  const handleEditCover = async () => {
    if (!coverUri) return;
    setGenerating(true);
    setError('');
    try {
      const b64 = await assetToBase64(coverUri, 1024);
      const res = await callImageEdit(
        'Enhance this food photo, make it more appetizing with warm lighting and shallow depth of field, professional food magazine style',
        [{ b64_json: b64 }],
        '1024x1024'
      );
      const out = res?.data?.[0]?.b64_json;
      if (out) setCoverUri(`data:image/png;base64,${out}`);
    } catch (e) {
      setError(String((e as Error).message || e));
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!userId) return;
    if (!title.trim()) {
      setError('请填写食谱名称');
      return;
    }
    setSaving(true);
    setError('');
    try {
      let coverPath: string | null = null;
      if (coverUri) {
        if (coverUri.startsWith('data:')) {
          // data uri -> 需要先写入临时文件再上传
          const { uri: tmpUri } = await compressImage(coverUri, 'image/jpeg', 1080);
          coverPath = await uploadImage(tmpUri, 'image/jpeg');
        } else {
          const { uri: compressedUri } = await compressImage(coverUri, 'image/jpeg', 1080);
          coverPath = await uploadImage(compressedUri, 'image/jpeg');
        }
      }

      const validIngredients = ingredients.filter((i) => i.name.trim());
      const validSteps = steps.filter((s) => s.text.trim());
      const savedSteps: RecipeStep[] = [];
      for (const step of validSteps) {
        const savedStep: RecipeStep = { text: step.text.trim() };
        if (step.image) {
          const compressed = await compressImage(step.image, 'image/jpeg', 1080);
          savedStep.image_url = await uploadImage(compressed.uri, 'image/jpeg');
        }
        savedSteps.push(savedStep);
      }

      await createRecipe({
        title: title.trim(),
        description: null,
        cover_url: coverPath,
        meal_type: mealType,
        ingredients: validIngredients,
        steps: savedSteps,
        nutrition: {
          calories: Number(calories) || 0,
          protein: Number(protein) || 0,
          carbs: Number(carbs) || 0,
          fat: Number(fat) || 0,
        },
        nutritionist_comment: comment.trim() || null,
        is_ai_generated: false,
        source: 'custom',
      });
      router.back();
    } catch (e) {
      setError(String((e as Error).message || e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View className="flex-1 bg-background">
      <PageHeader title="创建食谱" subtitle="编辑食谱、AI配图与动图" />
      <KeyboardAvoidingView
        behavior={process.env.EXPO_OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
          <View className="px-5 gap-5">
            {/* 名称 */}
            <View>
              <Text className="text-sm font-semibold text-foreground mb-2">食谱名称</Text>
              <TextInput
                className="border border-input bg-card rounded-xl px-4 h-12 text-base text-foreground"
                placeholder="如：番茄炒蛋"
                placeholderTextColor="#a8a29e"
                value={title}
                onChangeText={setTitle}
              />
            </View>

            {/* 餐次 */}
            <View>
              <Text className="text-sm font-semibold text-foreground mb-2">餐次</Text>
              <View className="flex-row flex-wrap gap-2">
                {MEAL_TYPES.map((mt) => (
                  <Pressable
                    key={mt}
                    onPress={() => setMealType(mt)}
                    className={`px-4 py-2 rounded-xl border ${
                      mealType === mt ? 'bg-primary border-primary' : 'bg-card border-border'
                    }`}
                    style={{ borderCurve: 'continuous' }}
                  >
                    <Text className={`text-sm font-medium ${mealType === mt ? 'text-primary-foreground' : 'text-foreground'}`}>
                      {MEAL_TYPE_LABELS[mt]}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* 封面配图 */}
            <View>
              <Text className="text-sm font-semibold text-foreground mb-2">封面配图</Text>
              {coverUri ? (
                <View className="relative">
                  <Image source={{ uri: coverUri }} className="w-full h-48 rounded-2xl" contentFit="cover" />
                  <Pressable
                    onPress={() => setCoverUri(null)}
                    className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/50 items-center justify-center"
                  >
                    <Trash2 size={16} color="#fff" />
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  onPress={handleGenerateCover}
                  disabled={generating}
                  className="bg-card rounded-2xl p-6 items-center border border-dashed border-primary active:bg-muted"
                  style={{ borderCurve: 'continuous' }}
                >
                  {generating ? (
                    <ActivityIndicator color="#38764A" />
                  ) : (
                    <Sparkles size={28} color="#38764A" />
                  )}
                  <Text className="text-sm text-foreground font-medium mt-2">
                    {generating ? 'AI 生成中...' : 'AI 生成食物配图'}
                  </Text>
                </Pressable>
              )}
              <Pressable onPress={handlePickCover} disabled={generating || saving} className="flex-row items-center justify-center mt-3 active:opacity-70">
                <ImagePlus size={16} color="#38764A" />
                <Text className="text-sm text-primary ml-1.5">从相册选择封面</Text>
              </Pressable>
              {coverUri && (
                <Pressable
                  onPress={handleEditCover}
                  disabled={generating}
                  className="flex-row items-center justify-center mt-2 active:opacity-70"
                >
                  <Wand2 size={14} color="#38764A" />
                  <Text className="text-xs text-primary ml-1">{generating ? '优化中...' : 'AI 优化配图'}</Text>
                </Pressable>
              )}
            </View>

            {/* 食材 */}
            <View>
              <View className="flex-row items-center justify-between mb-2">
                <Text className="text-sm font-semibold text-foreground">食材清单</Text>
                <Pressable onPress={() => setIngredients((p) => [...p, { name: '', amount: '' }])} className="flex-row items-center active:opacity-70">
                  <Plus size={16} color="#38764A" />
                  <Text className="text-sm text-primary ml-1">添加</Text>
                </Pressable>
              </View>
              <View className="gap-2">
                {ingredients.map((ing, idx) => (
                  <View key={idx} className="flex-row items-center gap-2">
                    <TextInput
                      className="flex-1 border border-input bg-card rounded-lg px-3 h-10 text-sm text-foreground"
                      placeholder="食材名称"
                      placeholderTextColor="#a8a29e"
                      value={ing.name}
                      onChangeText={(v) => updateIngredient(idx, 'name', v)}
                    />
                    <TextInput
                      className="w-24 border border-input bg-card rounded-lg px-3 h-10 text-sm text-foreground"
                      placeholder="分量"
                      placeholderTextColor="#a8a29e"
                      value={ing.amount}
                      onChangeText={(v) => updateIngredient(idx, 'amount', v)}
                    />
                    <Pressable onPress={() => setIngredients((p) => p.filter((_, i) => i !== idx))} className="w-9 h-9 items-center justify-center rounded-lg active:bg-muted">
                      <Trash2 size={15} color="#D97724" />
                    </Pressable>
                  </View>
                ))}
              </View>
            </View>

            {/* 步骤（含图片，用于GIF） */}
            <View>
              <View className="flex-row items-center justify-between mb-2">
                <View className="flex-row items-center">
                  <Text className="text-sm font-semibold text-foreground">烹饪步骤</Text>
                  <View className="flex-row items-center bg-accent/15 rounded px-1.5 py-0.5 ml-2">
                    <Film size={10} color="#D97724" />
                    <Text className="text-[10px] text-accent ml-0.5">可生成动图</Text>
                  </View>
                </View>
                <Pressable onPress={() => setSteps((p) => [...p, { text: '', image: null }])} className="flex-row items-center active:opacity-70">
                  <Plus size={16} color="#38764A" />
                  <Text className="text-sm text-primary ml-1">添加</Text>
                </Pressable>
              </View>
              <View className="gap-3">
                {steps.map((step, idx) => (
                  <View key={idx} className="bg-card rounded-2xl p-3 border border-border" style={{ borderCurve: 'continuous' }}>
                    <View className="flex-row items-center gap-2 mb-2">
                      <View className="w-6 h-6 rounded-full bg-primary items-center justify-center">
                        <Text className="text-xs text-primary-foreground font-bold">{idx + 1}</Text>
                      </View>
                      <TextInput
                        className="flex-1 border border-input bg-background rounded-lg px-3 h-10 text-sm text-foreground"
                        placeholder="步骤描述"
                        placeholderTextColor="#a8a29e"
                        value={step.text}
                        onChangeText={(v) => updateStep(idx, 'text', v)}
                      />
                      <Pressable onPress={() => setSteps((p) => p.filter((_, i) => i !== idx))} className="w-9 h-9 items-center justify-center rounded-lg active:bg-muted">
                        <Trash2 size={15} color="#D97724" />
                      </Pressable>
                    </View>
                    {step.image ? (
                      <View className="relative">
                        <Image source={{ uri: step.image }} className="w-full h-32 rounded-xl" contentFit="cover" />
                        <Pressable onPress={() => updateStep(idx, 'image', '')} className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/50 items-center justify-center">
                          <Trash2 size={14} color="#fff" />
                        </Pressable>
                      </View>
                    ) : (
                      <View className="flex-row gap-2">
                        <Pressable onPress={() => handleStepImage(idx, true)} className="flex-1 flex-row items-center justify-center bg-secondary rounded-lg h-10 active:opacity-80">
                          <Camera size={15} color="#38764A" />
                          <Text className="text-xs text-secondary-foreground ml-1.5">拍照</Text>
                        </Pressable>
                        <Pressable onPress={() => handleStepImage(idx, false)} className="flex-1 flex-row items-center justify-center bg-secondary rounded-lg h-10 active:opacity-80">
                          <ImagePlus size={15} color="#38764A" />
                          <Text className="text-xs text-secondary-foreground ml-1.5">相册</Text>
                        </Pressable>
                      </View>
                    )}
                  </View>
                ))}
              </View>
            </View>

            {/* 营养 */}
            <View>
              <Text className="text-sm font-semibold text-foreground mb-2">营养估算</Text>
              <View className="flex-row gap-2">
                <NutField label="热量(千卡)" value={calories} onChange={setCalories} />
                <NutField label="蛋白(g)" value={protein} onChange={setProtein} />
                <NutField label="碳水(g)" value={carbs} onChange={setCarbs} />
                <NutField label="脂肪(g)" value={fat} onChange={setFat} />
              </View>
            </View>

            {/* 点评 */}
            <View>
              <Text className="text-sm font-semibold text-foreground mb-2">心得 / 点评（选填）</Text>
              <TextInput
                className="border border-input bg-card rounded-xl px-4 h-20 text-sm text-foreground"
                placeholder="记录你的烹饪心得..."
                placeholderTextColor="#a8a29e"
                value={comment}
                onChangeText={setComment}
                multiline
                textAlignVertical="top"
              />
            </View>

            {error ? <Text className="text-destructive text-sm">{error}</Text> : null}

            <Pressable
              onPress={handleSave}
              disabled={saving}
              className="bg-primary rounded-2xl h-14 items-center justify-center active:opacity-90"
              style={{ borderCurve: 'continuous' }}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <View className="flex-row items-center">
                  <Check size={20} color="#fff" />
                  <Text className="text-primary-foreground text-lg font-semibold ml-2">保存食谱</Text>
                </View>
              )}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function NutField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <View className="flex-1">
      <Text className="text-[10px] text-muted-foreground mb-0.5">{label}</Text>
      <TextInput
        className="border border-input bg-card rounded-lg px-2 h-10 text-sm text-foreground"
        keyboardType="number-pad"
        value={value}
        onChangeText={onChange}
      />
    </View>
  );
}
