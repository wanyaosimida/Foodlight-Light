// 精选推荐食谱（用于首页推荐展示）
export interface FeaturedRecipe {
  id: string;
  title: string;
  cover: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  tag: string;
}

export const FEATURED_RECIPES: FeaturedRecipe[] = [
  {
    id: 'f1',
    title: '鸡胸肉牛油果沙拉',
    cover: require('../../assets/featured/f1.png'),
    calories: 320,
    protein: 35,
    carbs: 18,
    fat: 14,
    mealType: 'lunch',
    tag: '高蛋白',
  },
  {
    id: 'f2',
    title: '蓝莓燕麦早餐碗',
    cover: require('../../assets/featured/f2.png'),
    calories: 280,
    protein: 12,
    carbs: 42,
    fat: 8,
    mealType: 'breakfast',
    tag: '低脂',
  },
  {
    id: 'f3',
    title: '香煎三文鱼藜麦碗',
    cover: require('../../assets/featured/f3.png'),
    calories: 450,
    protein: 38,
    carbs: 30,
    fat: 18,
    mealType: 'dinner',
    tag: 'Omega-3',
  },
  {
    id: 'f4',
    title: '坚果酸奶能量碗',
    cover: require('../../assets/featured/f4.png'),
    calories: 220,
    protein: 10,
    carbs: 28,
    fat: 9,
    mealType: 'snack',
    tag: '加餐',
  },
];
