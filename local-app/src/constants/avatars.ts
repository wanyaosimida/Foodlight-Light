/* eslint-disable no-undef */

export interface AvatarOption {
  id: string;
  name: string;
  gender: 'male' | 'female';
  source: number;
}

export const AVATARS: AvatarOption[] = [
  { id: 'male_runner', name: '跑步男孩', gender: 'male', source: require('../../assets/avatars/avatar_male_runner.png') },
  { id: 'male_basketball', name: '篮球男孩', gender: 'male', source: require('../../assets/avatars/avatar_male_basketball.png') },
  { id: 'male_yoga', name: '瑜伽男孩', gender: 'male', source: require('../../assets/avatars/avatar_male_yoga.png') },
  { id: 'male_cycling', name: '骑行男孩', gender: 'male', source: require('../../assets/avatars/avatar_male_cycling.png') },
  { id: 'male_swimming', name: '游泳男孩', gender: 'male', source: require('../../assets/avatars/avatar_male_swimming.png') },
  { id: 'male_fitness', name: '健身男孩', gender: 'male', source: require('../../assets/avatars/avatar_male_fitness.png') },

  { id: 'female_runner', name: '跑步女孩', gender: 'female', source: require('../../assets/avatars/avatar_female_runner.png') },
  { id: 'female_tennis', name: '网球女孩', gender: 'female', source: require('../../assets/avatars/avatar_female_tennis.png') },
  { id: 'female_yoga', name: '瑜伽女孩', gender: 'female', source: require('../../assets/avatars/avatar_female_yoga.png') },
  { id: 'female_cycling', name: '骑行女孩', gender: 'female', source: require('../../assets/avatars/avatar_female_cycling.png') },
  { id: 'female_swimming', name: '游泳女孩', gender: 'female', source: require('../../assets/avatars/avatar_female_swimming.png') },
  { id: 'female_fitness', name: '健身女孩', gender: 'female', source: require('../../assets/avatars/avatar_female_fitness.png') },
];

export function getAvatarById(id: string | null | undefined): AvatarOption | undefined {
  return AVATARS.find((a) => a.id === id);
}