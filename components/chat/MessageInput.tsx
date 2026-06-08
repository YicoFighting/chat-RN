import { useSettingStore } from "@/store/useSettingStore";
import { transcribeAudio } from "@/utils/audioClient";
import { AudioModule, RecordingPresets, useAudioRecorder } from "expo-audio";
import * as DocumentPicker from "expo-document-picker";
import { File as ExpoFile, Paths } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import { ArrowUp, Mic, Plus, Square, X } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Keyboard,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  useColorScheme,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";



interface MessageInputProps {
  onSend: (
    text: string,
    imagesBase64?: string[],
    documents?: { name: string; content: string }[],
    imagesUri?: string[],
  ) => void;
  disabled?: boolean;
  isStreaming?: boolean;
  onStop?: () => void;
}

export default function MessageInput({
  onSend,
  disabled,
  isStreaming,
  onStop,
}: MessageInputProps) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const [images, setImages] = useState<{ uri: string; cachedUri: string; base64: string }[]>([]);
  const [documents, setDocuments] = useState<
    { name: string; content: string; uri: string }[]
  >([]);
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const insets = useSafeAreaInsets();

  // Voice Recording states & refs
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recordingTimerRef = useRef<any>(null);

  // Full-screen image preview (before sending)
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Camera permissions hook
  const [cameraPermission, requestCameraPermission] =
    ImagePicker.useCameraPermissions();

  // Keyboard visibility tracking
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      () => setIsKeyboardVisible(true),
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      () => setIsKeyboardVisible(false),
    );
    return () => {
      showSub.remove();
      hideSub.remove();
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
    };
  }, []);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60)
      .toString()
      .padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const startRecording = async () => {
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          t('messageInput.microphonePermission'),
          t('messageInput.microphonePermissionMessage'),
        );
        return;
      }

      await AudioModule.setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });

      audioRecorder.record();
      setIsRecording(true);
      setRecordingSeconds(0);

      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err: any) {
      console.error("Failed to start recording", err);
      Alert.alert(t('common.error'), t('common.error') + ": " + err.message);
    }
  };

  const stopRecording = async (shouldTranscribe = true) => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }

    try {
      await audioRecorder.stop();
      const uri = audioRecorder.uri;
      setIsRecording(false);

      if (shouldTranscribe && uri) {
        setIsTranscribing(true);
        const { baseUrl, apiKey, provider } = useSettingStore.getState();
        if (!apiKey.trim()) {
          Alert.alert(
            t('messageInput.apiNotConfigured'),
            t('messageInput.apiNotConfiguredMessage'),
          );
          setIsTranscribing(false);
          return;
        }

        if (provider === "deepseek") {
          Alert.alert(
            t('messageInput.providerNotSupported'),
            t('messageInput.providerNotSupportedMessage'),
          );
          setIsTranscribing(false);
          return;
        }

        const transcribed = await transcribeAudio({ baseUrl, apiKey, uri });
        if (transcribed.trim()) {
          setText((prev) =>
            prev ? prev + " " + transcribed.trim() : transcribed.trim(),
          );
        } else {
          Alert.alert(
            t('messageInput.speechToTextEmpty'),
            t('messageInput.speechToTextFailedMessage'),
          );
        }
      }
    } catch (err: any) {
      console.error("Transcription error", err);
      Alert.alert(
        t('messageInput.speechToTextFailed'),
        err.message || t('messageInput.speechToTextNetworkError'),
      );
    } finally {
      setIsTranscribing(false);
    }
  };

  const cancelRecording = async () => {
    await stopRecording(false);
  };

  const handleAddAttachment = () => {
    if (images.length + documents.length >= 4) {
      Alert.alert(t('common.attachmentLimit'), t('messageInput.attachmentLimit'));
      return;
    }

    Alert.alert(
      t('messageInput.addAttachment'),
      t('messageInput.chooseType'),
      [
        { text: t('common.cancel'), style: "cancel" },
        { text: t('messageInput.takePhoto'), onPress: takePhoto },
        { text: t('messageInput.chooseFromGallery'), onPress: pickImage },
        { text: t('messageInput.importDocument'), onPress: pickDocument },
      ],
      { cancelable: true },
    );
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      quality: 0.7,
      base64: true,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      // Write base64 to cache for a stable file:// URI that expo-image can load
      let cachedUri = asset.uri;
      if (asset.base64) {
        try {
          const dest = new ExpoFile(Paths.cache, `img_${Date.now()}.jpg`);
          dest.write(asset.base64, { encoding: "base64" });
          cachedUri = dest.uri;
        } catch (e) {
          console.warn("Image cache write failed, using original uri", e);
        }
      }
      setImages((prev) => [
        ...prev,
        { uri: asset.uri, cachedUri, base64: asset.base64 || "" },
      ]);
    }
  };

  const takePhoto = async () => {
    if (!cameraPermission?.granted) {
      const permission = await requestCameraPermission();
      if (!permission.granted) {
        Alert.alert(t('messageInput.cameraPermission'), t('messageInput.cameraPermissionMessage'));
        return;
      }
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      quality: 0.7,
      base64: true,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      let cachedUri = asset.uri;
      if (asset.base64) {
        try {
          const dest = new ExpoFile(Paths.cache, `img_${Date.now()}.jpg`);
          dest.write(asset.base64, { encoding: "base64" });
          cachedUri = dest.uri;
        } catch (e) {
          console.warn("Image cache write failed, using original uri", e);
        }
      }
      setImages((prev) => [
        ...prev,
        { uri: asset.uri, cachedUri, base64: asset.base64 || "" },
      ]);
    }
  };

  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          "text/plain",
          "text/markdown",
          "application/json",
          "text/javascript",
          "text/typescript",
          "text/css",
          "text/html",
          "text/csv",
        ],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];

        if (asset.size && asset.size > 1 * 1024 * 1024) {
          Alert.alert(
            t('messageInput.fileTooLarge'),
            t('messageInput.fileTooLargeMessage'),
          );
          return;
        }

        const file = new ExpoFile(asset.uri);
        const content = await file.text();
        setDocuments((prev) => [
          ...prev,
          { name: asset.name, content: content || "", uri: asset.uri },
        ]);
      }
    } catch (err: any) {
      console.error("Failed to pick document", err);
      Alert.alert(t('common.error'), t('common.error') + ": " + err.message);
    }
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const removeDocument = (index: number) => {
    setDocuments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSend = () => {
    if (!text.trim() && images.length === 0 && documents.length === 0) return;
    const base64s = images.map((img) => img.base64).filter(Boolean);
    // Use cachedUri (stable file:// in app cache) for reliable display
    const uris = images.map((img) => img.cachedUri).filter(Boolean);

    // Pass text, images (base64 + uri) and the parsed document structures
    onSend(
      text,
      base64s.length > 0 ? base64s : undefined,
      documents.length > 0 ? documents : undefined,
      uris.length > 0 ? uris : undefined,
    );

    setText("");
    setImages([]);
    setDocuments([]);
  };

  const canSend =
    (text.trim().length > 0 || images.length > 0 || documents.length > 0) &&
    !disabled &&
    !isTranscribing;

  return (
    <View
      style={{
        paddingBottom: isKeyboardVisible
          ? Platform.OS === "android"
            ? 8
            : Math.max(insets.bottom, 8)
          : Platform.OS === "android"
            ? 4
            : Math.max(insets.bottom, 4),
      }}
      className="px-4 pt-2 bg-white dark:bg-[#0D0D0D]"
    >
      {/* Capsule input container */}
      <View className="border border-neutral-200 dark:border-neutral-800 rounded-3xl bg-neutral-50 dark:bg-[#171717] p-2">
        {/* Horizontal Attachment (Image & Document) Preview List */}
        {(images.length > 0 || documents.length > 0) && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="flex-row m-2 pb-2 border-b border-neutral-200 dark:border-neutral-800"
          >
            {images.map((img, index) => (
              <View key={`img-${index}`} className="relative w-16 h-16 mr-3">
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setPreviewImage(img.cachedUri)}
                >
                  <Image
                    source={{ uri: img.uri }}
                    className="w-16 h-16 rounded-xl"
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => removeImage(index)}
                  className="absolute -top-1 -right-1 bg-neutral-900 rounded-full p-1"
                >
                  <X color="white" size={12} />
                </TouchableOpacity>
              </View>
            ))}

            {documents.map((doc, index) => (
              <View
                key={`doc-${index}`}
                className="relative bg-neutral-200 dark:bg-neutral-800 px-3 py-2 rounded-xl mr-3 h-16 justify-center max-w-[140px] border border-neutral-300 dark:border-neutral-700"
              >
                <Text
                  numberOfLines={1}
                  className="text-xs font-bold text-neutral-800 dark:text-neutral-200 mb-0.5"
                >
                  📄 {doc.name}
                </Text>
                <Text className="text-[10px] text-neutral-500 dark:text-neutral-400">
                  {(doc.content.length / 1024).toFixed(1)} KB
                </Text>
                <TouchableOpacity
                  onPress={() => removeDocument(index)}
                  className="absolute -top-1 -right-1 bg-neutral-900 rounded-full p-1"
                >
                  <X color="white" size={10} />
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        )}

        <View className="flex-row items-center">
          {isRecording ? (
            <View className="flex-1 flex-row items-center justify-between px-2 py-1">
              <TouchableOpacity
                onPress={cancelRecording}
                className="px-3.5 py-2 rounded-2xl bg-neutral-200 dark:bg-neutral-800 active:opacity-60"
              >
                <Text className="text-xs text-red-500 font-bold">{t('common.cancel')}</Text>
              </TouchableOpacity>

              <View className="flex-row items-center">
                <View className="w-2.5 h-2.5 bg-red-500 rounded-full mr-2 animate-pulse" />
                <Text className="text-sm font-bold text-neutral-800 dark:text-neutral-200">
                  {t('messageInput.recording', { time: formatTime(recordingSeconds) })}
                </Text>
              </View>

              <TouchableOpacity
                onPress={() => stopRecording(true)}
                className="px-4 py-2 rounded-2xl bg-green-500 active:opacity-60"
              >
                <Text className="text-xs text-white font-bold">{t('common.finish')}</Text>
              </TouchableOpacity>
            </View>
          ) : isTranscribing ? (
            <View className="flex-1 flex-row items-center px-4 py-2">
              <ActivityIndicator
                size="small"
                color={isDark ? "#FFF" : "#000"}
              />
              <Text className="ml-3 text-sm text-neutral-500 dark:text-neutral-400 font-bold">
                {t('messageInput.transcribing')}
              </Text>
            </View>
          ) : (
            <>
              {/* Add attachment menu */}
              <TouchableOpacity
                onPress={handleAddAttachment}
                className="p-2 rounded-full active:opacity-60"
              >
                <Plus color="#737373" size={22} />
              </TouchableOpacity>

              {/* Voice input button */}
              <TouchableOpacity
                onPress={startRecording}
                className="p-2 rounded-full active:opacity-60 mr-1"
              >
                <Mic color="#737373" size={22} />
              </TouchableOpacity>

              {/* Text input */}
              <TextInput
                value={text}
                onChangeText={setText}
                placeholder={t('common.message')}
                placeholderTextColor="#737373"
                multiline
                editable={!disabled}
                className="flex-1 max-h-24 px-1 py-1 text-neutral-900 dark:text-neutral-100 text-base"
              />

              {/* Send or Stop button */}
              {isStreaming ? (
                <TouchableOpacity
                  onPress={onStop}
                  className="p-2 rounded-full bg-red-500 active:bg-red-600"
                >
                  <Square color="white" size={16} fill="white" />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  onPress={handleSend}
                  disabled={!canSend}
                  className={`p-2 rounded-full ${
                    canSend
                      ? "bg-black dark:bg-white"
                      : "bg-neutral-200 dark:bg-neutral-800"
                  }`}
                >
                  <ArrowUp
                    color={canSend ? (isDark ? "#000" : "#FFF") : "#737373"}
                    size={18}
                  />
                </TouchableOpacity>
              )}
            </>
          )}
        </View>
      </View>

      {/* Full-screen Image Preview Modal (before sending) */}
      <Modal
        visible={!!previewImage}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewImage(null)}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setPreviewImage(null)}
          className="flex-1 bg-black/90 items-center justify-center"
        >
          {previewImage && (
            <Image
              source={{ uri: previewImage }}
              style={{
                width: Dimensions.get("window").width - 32,
                height: Dimensions.get("window").height * 0.7,
              }}
              resizeMode="contain"
            />
          )}
          <Text className="text-white/60 text-sm mt-6 font-medium">
            {t('common.clickToClose')}
          </Text>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}
