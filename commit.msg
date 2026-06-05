fix: resolve image display, keyboard, safe area and voice transcription issues

- Add imagesUri field to Message type for reliable image display (fallback to base64)
- Fix KeyboardAvoidingView conflicting with Android adjustResize soft input mode
- Add tab bar height offset to MessageInput bottom padding on Android
- Update tab bar height to account for bottom safe area insets on Android
- Fix stopRecording early returns not resetting isTranscribing state
- Add empty transcription result alert for better user feedback
