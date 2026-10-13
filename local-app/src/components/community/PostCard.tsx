import { View, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { Heart, MessageCircle, Bookmark, Utensils, TrendingUp, BookOpen, Dumbbell, MessageSquare } from 'lucide-react-native';
import { getPublicUrl } from '@/db/api';
import type { CommunityPost, PostType } from '@/types/types';
import { POST_TYPE_LABELS } from '@/types/types';
import { Text } from '@/components/ui/text';
import { getAvatarById } from '@/constants/avatars';

const TYPE_ICON: Record<PostType, typeof Utensils> = {
  meal: Utensils,
  progress: TrendingUp,
  recipe: BookOpen,
  workout: Dumbbell,
  talk: MessageSquare,
};

const TYPE_COLOR: Record<PostType, string> = {
  meal: '#D97724',
  progress: '#38764A',
  recipe: '#7C3AED',
  workout: '#0EA5E9',
  talk: '#EC4899',
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min}分钟前`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}小时前`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}天前`;
  return new Date(iso).toLocaleDateString('zh-CN');
}

export function PostCard({
  post,
  liked,
  favorited,
  onLike,
  onFavorite,
  onPress,
}: {
  post: CommunityPost;
  liked: boolean;
  favorited: boolean;
  onLike: () => void;
  onFavorite: () => void;
  onPress: () => void;
}) {
  const Icon = TYPE_ICON[post.type] || MessageSquare;
  const color = TYPE_COLOR[post.type] || '#EC4899';
  const images = Array.isArray(post.images) ? post.images : [];
  const data = post.data || {};

  return (
    <Pressable onPress={onPress} className="bg-card rounded-2xl mx-4 mb-3 p-4 border border-border active:opacity-90" style={{ borderCurve: 'continuous' }}>
      {/* 作者 */}
      <View className="flex-row items-center">
        <View className="w-9 h-9 rounded-full bg-primary/15 items-center justify-center overflow-hidden">
          {post.author_avatar ? (
            <Image source={getAvatarById(post.author_avatar)?.source || { uri: getPublicUrl(post.author_avatar) }} style={{ width: 36, height: 36 }} contentFit="cover" />
          ) : (
            <Text className="text-sm font-bold text-primary">{(post.author_name || '匿')[0]}</Text>
          )}
        </View>
        <View className="flex-1 ml-2">
          <Text className="text-sm font-semibold text-foreground">{post.author_name || '健康达人'}</Text>
          <Text className="text-[10px] text-muted-foreground">{timeAgo(post.created_at)}</Text>
        </View>
        <View className="flex-row items-center gap-1 rounded-full px-2 py-1" style={{ backgroundColor: `${color}20` }}>
          <Icon size={12} color={color} />
          <Text className="text-[10px] font-medium" style={{ color }}>{POST_TYPE_LABELS[post.type]}</Text>
        </View>
      </View>

      {/* 内容 */}
      {post.content ? <Text className="text-sm text-foreground leading-5 mt-3">{post.content}</Text> : null}

      {/* 类型数据 */}
      {post.type === 'progress' && data.weight ? (
        <View className="flex-row gap-3 mt-3">
          <DataChip label="当前体重" value={`${data.weight}kg`} />
          {data.change !== undefined ? <DataChip label="累计变化" value={`${Number(data.change) > 0 ? '+' : ''}${data.change}kg`} /> : null}
        </View>
      ) : null}
      {post.type === 'workout' && data.calories ? (
        <View className="flex-row gap-3 mt-3">
          <DataChip label="运动消耗" value={`${data.calories}kcal`} />
          {data.duration ? <DataChip label="时长" value={`${data.duration}分钟`} /> : null}
        </View>
      ) : null}
      {post.type === 'meal' && data.calories ? (
        <View className="flex-row gap-3 mt-3">
          <DataChip label="热量" value={`${data.calories}kcal`} />
          {data.protein ? <DataChip label="蛋白" value={`${data.protein}g`} /> : null}
        </View>
      ) : null}

      {/* 图片 */}
      {images.length > 0 ? (
        <View className="flex-row flex-wrap gap-2 mt-3">
          {images.slice(0, 3).map((uri, i) => (
            <Image key={i} source={{ uri: getPublicUrl(uri) }} style={{ width: images.length === 1 ? '100%' : '31%', height: images.length === 1 ? 200 : 90, borderRadius: 12 }} contentFit="cover" />
          ))}
        </View>
      ) : null}

      {/* 标签 */}
      {post.tags?.length > 0 ? (
        <View className="flex-row flex-wrap gap-1.5 mt-3">
          {post.tags.map((t) => (
            <Text key={t} className="text-[11px] text-primary">#{t}</Text>
          ))}
        </View>
      ) : null}

      {/* 互动 */}
      <View className="flex-row items-center mt-3 pt-3 border-t border-border">
        <Pressable onPress={(event) => { event.stopPropagation(); onLike(); }} className="flex-row items-center gap-1 mr-5 active:opacity-60">
          <Heart size={16} color={liked ? '#DC2626' : '#8a8278'} fill={liked ? '#DC2626' : 'transparent'} />
          <Text className={`text-xs ${liked ? 'text-destructive' : 'text-muted-foreground'}`}>{post.like_count}</Text>
        </Pressable>
        <View className="flex-row items-center gap-1 mr-5">
          <MessageCircle size={16} color="#8a8278" />
          <Text className="text-xs text-muted-foreground">{post.comment_count}</Text>
        </View>
        <Pressable onPress={(event) => { event.stopPropagation(); onFavorite(); }} className="flex-row items-center gap-1 active:opacity-60">
          <Bookmark size={16} color={favorited ? '#D97724' : '#8a8278'} fill={favorited ? '#D97724' : 'transparent'} />
          <Text className={`text-xs ${favorited ? 'text-accent' : 'text-muted-foreground'}`}>{post.favorite_count}</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

function DataChip({ label, value }: { label: string; value: string }) {
  return (
    <View className="bg-secondary/70 rounded-lg px-3 py-1.5">
      <Text className="text-[10px] text-muted-foreground">{label}</Text>
      <Text className="text-sm font-bold text-foreground">{value}</Text>
    </View>
  );
}
