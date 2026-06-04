import React, { useState } from 'react';
import { View, TextInput, TouchableOpacity, Image } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Plus, ArrowUp, X } from 'lucide-react-native';
import { useColorScheme } from 'react-native';

interface MessageInputProps {
  onSend: (text: string, imageBase64?: string) => void;
  disabled?: boolean;
}

export default function MessageInput({ onSend, disabled }: MessageInputProps) {
  const [text, setText] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [base64, setBase64] = useState<string | undefined>(undefined);
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.7,
      base64: true,
    });

    if (!result.canceled && result.assets[0]) {
      setImage(result.assets[0].uri);
      setBase64(result.assets[0].base64 ?? undefined);
    }
  };

  const handleSend = () => {
    if (!text.trim() && !image) return;
    onSend(text, base64);
    setText('');
    setImage(null);
    setBase64(undefined);
  };

  const canSend = (text.trim().length > 0 || !!image) && !disabled;

  return (
    <View className="px-4 pb-4 pt-2 bg-white dark:bg-[#0D0D0D]">
      {/* Capsule input container */}
      <View className="border border-neutral-200 dark:border-neutral-800 rounded-3xl bg-neutral-50 dark:bg-[#171717] p-2">
        {/* Image preview */}
        {image && (
          <View className="flex-row m-2 relative w-16 h-16">
            <Image source={{ uri: image }} className="w-16 h-16 rounded-xl" />
            <TouchableOpacity
              onPress={() => {
                setImage(null);
                setBase64(undefined);
              }}
              className="absolute -top-1 -right-1 bg-neutral-900 rounded-full p-1"
            >
              <X color="white" size={12} />
            </TouchableOpacity>
          </View>
        )}

        <View className="flex-row items-center">
          {/* Upload image button */}
          <TouchableOpacity onPress={pickImage} className="p-2 rounded-full">
            <Plus color="#737373" size={22} />
          </TouchableOpacity>

          {/* Text input */}
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Message..."
            placeholderTextColor="#737373"
            multiline
            editable={!disabled}
            className="flex-1 max-h-24 px-2 py-1 text-neutral-900 dark:text-neutral-100 text-base"
          />

          {/* Send button */}
          <TouchableOpacity
            onPress={handleSend}
            disabled={!canSend}
            className={`p-2 rounded-full ${
              canSend
                ? 'bg-black dark:bg-white'
                : 'bg-neutral-200 dark:bg-neutral-800'
            }`}
          >
            <ArrowUp
              color={canSend ? (isDark ? '#000' : '#FFF') : '#737373'}
              size={18}
            />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}
