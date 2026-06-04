import React from 'react';
import { View, TouchableOpacity, Image } from 'react-native';
import { X } from 'lucide-react-native';

interface ImagePreviewProps {
  uri: string;
  onRemove: () => void;
}

export default function ImagePreview({ uri, onRemove }: ImagePreviewProps) {
  return (
    <View className="relative w-16 h-16 m-1">
      <Image source={{ uri }} className="w-16 h-16 rounded-xl" />
      <TouchableOpacity
        onPress={onRemove}
        className="absolute -top-1 -right-1 bg-neutral-900 rounded-full p-1"
      >
        <X color="white" size={12} />
      </TouchableOpacity>
    </View>
  );
}
