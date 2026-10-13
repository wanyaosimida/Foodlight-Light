import { useState, useCallback, useRef } from 'react';
import { View, Pressable, FlatList, ActivityIndicator, RefreshControl } from 'react-native';
import { useRouter, useFocusEffect, type RelativePathString } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PenSquare, Users, Sparkles } from 'lucide-react-native';
import { listCommunityPosts, isLiked, isFavorited, toggleLike, toggleFavorite } from '@/db/api';
import type { CommunityPost, PostType } from '@/types/types';
import { POST_TYPE_LABELS } from '@/types/types';
import { useSession } from '@/ctx';
import { PostCard } from '@/components/community/PostCard';
import { Text } from '@/components/ui/text';

const CATEGORIES: { key: string; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'meal', label: '美食打卡' },
  { key: 'progress', label: '减肥进度' },
  { key: 'recipe', label: '减脂餐教程' },
  { key: 'workout', label: '运动打卡' },
  { key: 'talk', label: '健康心得' },
];

const PAGE_SIZE = 15;

export default function CommunityScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useSession();
  const userId = session?.user?.id || '';

  const [tab, setTab] = useState('recommend');
  const [category, setCategory] = useState('all');
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [likedSet, setLikedSet] = useState<Set<string>>(new Set());
  const [favSet, setFavSet] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState('');
  const pendingActions = useRef(new Set<string>());
  const requestId = useRef(0);
  const pageRef = useRef(0);

  const loadPosts = useCallback(
    async (reset: boolean) => {
      if (!userId) return;
      const request = ++requestId.current;
      const targetTab = tab === 'follow' ? 'follow' : 'recommend';
      const nextPage = reset ? 0 : pageRef.current;
      if (reset) {
        setLoading(true);
        setHasMore(true);
      } else {
        setLoadingMore(true);
      }
      setError('');
      try {
        const data = await listCommunityPosts(targetTab, userId, nextPage, PAGE_SIZE, category);
        if (request !== requestId.current) return;
        const filtered = data;
        setPosts((prev) => (reset ? filtered : [...prev, ...filtered]));
        setHasMore(data.length === PAGE_SIZE);
        pageRef.current = nextPage + 1;
        // 加载当前用户点赞/收藏状态
        if (filtered.length > 0) {
          const ids = filtered.map((p) => p.id);
          const liked: string[] = [];
          const fav: string[] = [];
          await Promise.all(
            ids.map(async (id) => {
              const [l, f] = await Promise.all([isLiked(id, userId), isFavorited(id, userId)]);
              if (l) liked.push(id);
              if (f) fav.push(id);
            })
          );
          if (request !== requestId.current) return;
          setLikedSet((prev) => (reset ? new Set(liked) : new Set([...prev, ...liked])));
          setFavSet((prev) => (reset ? new Set(fav) : new Set([...prev, ...fav])));
        }
      } catch (e) {
        if (request === requestId.current) setError((e as Error).message || '动态加载失败，请下拉重试');
      } finally {
        if (request === requestId.current) {
          setLoading(false);
          setLoadingMore(false);
          setRefreshing(false);
        }
      }
    },
    [tab, category, userId]
  );

  useFocusEffect(
    useCallback(() => {
      loadPosts(true);
      return () => { requestId.current++; };
    }, [loadPosts])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadPosts(true);
  };

  const onEndReached = () => {
    if (!loadingMore && hasMore && !loading) loadPosts(false);
  };

  const handleLike = async (postId: string) => {
    const key = `like:${postId}`;
    if (pendingActions.current.has(key)) return;
    pendingActions.current.add(key);
    setError('');
    try {
      const nowLiked = await toggleLike(postId, userId);
      setLikedSet((prev) => {
        const next = new Set(prev);
        if (nowLiked) next.add(postId);
        else next.delete(postId);
        return next;
      });
      setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, like_count: Math.max(0, p.like_count + (nowLiked ? 1 : -1)) } : p)));
    } catch (e) {
      setError((e as Error).message || '点赞保存失败，请重试');
    } finally {
      pendingActions.current.delete(key);
    }
  };

  const handleFav = async (postId: string) => {
    const key = `favorite:${postId}`;
    if (pendingActions.current.has(key)) return;
    pendingActions.current.add(key);
    setError('');
    try {
      const nowFav = await toggleFavorite(postId, userId);
      setFavSet((prev) => {
        const next = new Set(prev);
        if (nowFav) next.add(postId);
        else next.delete(postId);
        return next;
      });
      setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, favorite_count: Math.max(0, p.favorite_count + (nowFav ? 1 : -1)) } : p)));
    } catch (e) {
      setError((e as Error).message || '收藏保存失败，请重试');
    } finally {
      pendingActions.current.delete(key);
    }
  };

  return (
    <View className="flex-1 bg-background">
      {/* 顶部标题 */}
      <View className="bg-background px-4 pt-2 pb-2" style={{ paddingTop: insets.top + 8 }}>
        <View className="flex-row items-center justify-between">
          <View>
            <Text className="text-xl font-bold text-foreground">食光广场</Text>
            <Text className="text-xs text-muted-foreground">和健康达人一起记录生活</Text>
          </View>
          <Pressable onPress={() => router.push('/(app)/community-publish' as RelativePathString)} className="bg-primary rounded-full px-4 py-2 flex-row items-center gap-1.5 active:opacity-90">
            <PenSquare size={16} color="#FFFCF7" />
            <Text className="text-sm font-semibold text-primary-foreground">发布</Text>
          </Pressable>
        </View>
        {/* 推荐 / 关注 */}
        <View className="flex-row gap-5 mt-3">
          <Pressable onPress={() => setTab('recommend')} className="flex-row items-center gap-1">
            <Sparkles size={15} color={tab === 'recommend' ? '#38764A' : '#8a8278'} />
            <Text className={`text-sm ${tab === 'recommend' ? 'text-primary font-bold' : 'text-muted-foreground'}`}>推荐</Text>
          </Pressable>
          <Pressable onPress={() => setTab('follow')} className="flex-row items-center gap-1">
            <Users size={15} color={tab === 'follow' ? '#38764A' : '#8a8278'} />
            <Text className={`text-sm ${tab === 'follow' ? 'text-primary font-bold' : 'text-muted-foreground'}`}>关注</Text>
          </Pressable>
        </View>
      </View>

      {/* 分类筛选 */}
      <View>
        <FlatList
          data={CATEGORIES}
          keyExtractor={(c) => c.key}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingVertical: 8 }}
          renderItem={({ item }) => {
            const active = category === item.key;
            return (
              <Pressable onPress={() => setCategory(item.key)} className={`rounded-full px-3.5 py-1.5 ${active ? 'bg-primary' : 'bg-secondary'}`}>
                <Text className={`text-xs ${active ? 'text-primary-foreground font-semibold' : 'text-secondary-foreground'}`}>{item.label}</Text>
              </Pressable>
            );
          }}
        />
      </View>

      {/* 信息流 */}
      {error ? <Text className="text-sm text-destructive px-4 py-2">{error}</Text> : null}
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#38764A" />
        </View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ paddingTop: 4, paddingBottom: insets.bottom + 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#38764A" />}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.3}
          ListEmptyComponent={
            <View className="items-center justify-center py-20">
              <Text className="text-sm text-muted-foreground">{tab === 'follow' ? '还没有关注的人，去推荐看看吧' : '暂无内容，快来发布第一条动态'}</Text>
            </View>
          }
          ListFooterComponent={loadingMore ? <ActivityIndicator color="#38764A" style={{ paddingVertical: 16 }} /> : null}
          renderItem={({ item }) => (
            <PostCard
              post={item}
              liked={likedSet.has(item.id)}
              favorited={favSet.has(item.id)}
              onLike={() => handleLike(item.id)}
              onFavorite={() => handleFav(item.id)}
              onPress={() => router.push(`/(app)/community/${item.id}` as RelativePathString)}
            />
          )}
        />
      )}
    </View>
  );
}
