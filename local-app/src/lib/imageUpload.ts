import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';
import { supabase } from '@/client/supabase';

const BUCKET = 'app-ejgfa726qvi9_foodlight_images';

export async function compressImage(
  uri: string,
  mimeType?: string,
  width?: number
): Promise<{ uri: string; format: SaveFormat }> {
  const isPng = mimeType === 'image/png';
  const format = isPng ? SaveFormat.PNG : SaveFormat.JPEG;
  const actions = width && width > 1080 ? [{ resize: { width: 1080 } }] : [];
  const result = await manipulateAsync(uri, actions, {
    compress: isPng ? 1 : 0.8,
    format,
  });
  return { uri: result.uri, format };
}

export async function uploadImage(
  uri: string,
  mimeType: string = 'image/jpeg'
): Promise<string> {
  // Expo File is a native API; browser picks are blob: or data: URLs.
  let arrayBuffer: ArrayBuffer;
  if (Platform.OS === 'web') {
    const response = await fetch(uri);
    if (!response.ok) throw new Error('无法读取所选图片，请重新选择');
    arrayBuffer = await response.arrayBuffer();
  } else {
    arrayBuffer = await new File(uri).arrayBuffer();
  }
  const ext = mimeType === 'image/png' ? 'png' : 'jpg';
  const path = `images/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .upload(path, arrayBuffer, { contentType: mimeType, upsert: false });
  if (error) throw new Error(error.message);
  return data.path;
}

export async function pickImageFromGallery(): Promise<ImagePicker.ImagePickerAsset | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error('PERMISSION_DENIED');
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 1,
  });
  return res.canceled ? null : res.assets[0];
}

export async function takePhoto(): Promise<ImagePicker.ImagePickerAsset | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) throw new Error('PERMISSION_DENIED');
  const res = await ImagePicker.launchCameraAsync({ quality: 1 });
  return res.canceled ? null : res.assets[0];
}

// 读取图片为裸 base64（用于图生图/识别）
export async function assetToBase64(uri: string, width = 1024): Promise<string> {
  const result = await manipulateAsync(uri, [{ resize: { width } }], {
    compress: 0.8,
    format: SaveFormat.JPEG,
    base64: true,
  });
  return result.base64 || '';
}
