import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Camera,
  type CameraRef,
  useCameraDevice,
  useCameraPermission,
  usePhotoOutput,
} from 'react-native-vision-camera';
import TextRecognition from '@react-native-ml-kit/text-recognition';
import {
  getLiveScoreRowsFromRecognition,
  getScanWarning,
  summarizePlayerRows,
} from './src/scorecardParser';

type ScanStatus = 'idle' | 'capturing' | 'ready' | 'warning' | 'error';

type EditablePlayerRow = {
  id: string;
  name: string;
  scores: string[];
};

type ScanState = {
  ocrHint: string;
  rows: EditablePlayerRow[];
  status: ScanStatus;
  warning: string | null;
};

const IS_TEST_ENV =
  (globalThis as { __GOLF_LENS_TEST__?: boolean }).__GOLF_LENS_TEST__ === true;
const DISPLAY_HOLE_COUNT = 9;

const INITIAL_SCAN_STATE: ScanState = {
  ocrHint: '',
  rows: [],
  status: 'idle',
  warning: null,
};

function App() {
  const isDarkMode = useColorScheme() === 'dark';
  const device = useCameraDevice('back');
  const photoOutput = usePhotoOutput();
  const cameraRef = useRef<CameraRef>(null);
  const scanBusyRef = useRef(false);
  const { canRequestPermission, hasPermission, requestPermission } =
    useCameraPermission();
  const [scanState, setScanState] = useState<ScanState>(INITIAL_SCAN_STATE);

  useEffect(() => {
    if (!hasPermission && canRequestPermission) {
      requestPermission();
    }
  }, [canRequestPermission, hasPermission, requestPermission]);

  const captureScorecard = useCallback(async () => {
    if (
      IS_TEST_ENV ||
      scanBusyRef.current ||
      !cameraRef.current ||
      !hasPermission ||
      !device
    ) {
      return;
    }

    scanBusyRef.current = true;
    setScanState(prev => ({
      ...prev,
      status: 'capturing',
      warning: null,
    }));

    try {
      let uri = '';
      if (Platform.OS === 'ios') {
        const photo = await photoOutput.capturePhoto(
          {
            enableShutterSound: false,
            flashMode: 'off',
          },
          {},
        );
        const fullPhotoPath = await photo.saveToTemporaryFileAsync();
        uri = toFileUri(fullPhotoPath);
        photo.dispose();
      } else {
        const snapshot = await cameraRef.current.takeSnapshot();
        const tempPath = await snapshot.saveToTemporaryFileAsync('jpg', 85);
        uri = toFileUri(tempPath);
      }

      const result = await TextRecognition.recognize(uri);
      const parsedRowsFull = getLiveScoreRowsFromRecognition(result);
      const parsedRows = parsedRowsFull.map(row => ({
        id: row.id,
        name: row.name,
        scores: toEditableScores(row.scores),
      }));
      const warning = getScanWarning(parsedRowsFull);
      const noRowsWarning =
        parsedRows.length === 0
          ? 'No player rows detected. Reframe and capture again.'
          : null;

      setScanState({
        ocrHint: summarizePlayerRows(parsedRowsFull).slice(0, 160),
        rows: parsedRows,
        status: warning || noRowsWarning ? 'warning' : 'ready',
        warning: warning ?? noRowsWarning,
      });
    } catch (error) {
      setScanState(prev => ({
        ...prev,
        status: 'error',
        warning:
          error instanceof Error
            ? error.message
            : 'OCR failed. Try another capture.',
      }));
    } finally {
      scanBusyRef.current = false;
    }
  }, [device, hasPermission, photoOutput]);

  const resetScore = useCallback(() => {
    setScanState(INITIAL_SCAN_STATE);
  }, []);

  const updateHoleScore = useCallback(
    (rowId: string, holeIndex: number, value: string) => {
      const normalized = value.replace(/[^\d]/g, '').slice(0, 2);
      setScanState(prev => ({
        ...prev,
        rows: prev.rows.map(row =>
          row.id === rowId
            ? {
                ...row,
                scores: row.scores.map((score, index) =>
                  index === holeIndex ? normalized : score,
                ),
              }
            : row,
        ),
      }));
    },
    [],
  );

  const cameraStatusCopy =
    scanState.status === 'error'
      ? 'OCR error'
      : scanState.status === 'warning'
      ? 'Needs review'
      : scanState.status === 'capturing'
      ? 'Capturing...'
      : scanState.rows.length > 0
      ? 'Score captured'
      : 'Point camera at scorecard';

  return (
    <View style={styles.container}>
      <StatusBar
        barStyle={isDarkMode ? 'light-content' : 'dark-content'}
        hidden
      />
      {hasPermission && device ? (
        <>
          <Camera
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            device={device}
            isActive
            orientationSource="device"
            outputs={[photoOutput]}
            resizeMode="cover"
          />

          <SafeAreaView style={styles.content}>
            <View style={styles.headerBadge}>
              <Text style={styles.headerText}>{cameraStatusCopy}</Text>
            </View>

            {scanState.warning ? (
              <View style={styles.warningBanner}>
                <Text style={styles.warningText}>{scanState.warning}</Text>
              </View>
            ) : null}

            <View style={styles.mainScorePanel}>
              <Text style={styles.mainScoreLabel}>Score</Text>

              <View style={styles.scoreHeaderRow}>
                <Text style={styles.nameHeader}>Name</Text>
                <View style={styles.holeHeaderRow}>
                  {Array.from({ length: DISPLAY_HOLE_COUNT }, (_, index) => (
                    <Text key={`hole-${index}`} style={styles.holeHeaderCell}>
                      {index + 1}
                    </Text>
                  ))}
                  <Text style={styles.totalHeaderCell}>T</Text>
                </View>
              </View>

              {scanState.rows.length === 0 ? (
                <Text style={styles.mainScorePlaceholder}>
                  Capture to scan the scorecard.
                </Text>
              ) : (
                <ScrollView
                  contentContainerStyle={styles.rowsScrollContent}
                  style={styles.rowsScrollView}>
                  {scanState.rows.map(row => (
                    <View key={row.id} style={styles.scoreRow}>
                      <Text numberOfLines={1} style={styles.scoreName}>
                        {row.name}
                      </Text>
                      <View style={styles.holeInputsRow}>
                        {row.scores.map((score, holeIndex) => (
                          <TextInput
                            key={`${row.id}-${holeIndex}`}
                            keyboardType="number-pad"
                            maxLength={2}
                            onChangeText={nextValue =>
                              updateHoleScore(row.id, holeIndex, nextValue)
                            }
                            style={styles.scoreInput}
                            value={score}
                          />
                        ))}
                        <Text style={styles.scoreTotal}>
                          {getEditableScoreTotal(row.scores)}
                        </Text>
                      </View>
                    </View>
                  ))}
                </ScrollView>
              )}
            </View>

            {scanState.ocrHint ? (
              <Text numberOfLines={1} style={styles.sawText}>
                Saw: {scanState.ocrHint}
              </Text>
            ) : null}

            <View style={styles.bottomControls}>
              <Pressable
                accessibilityRole="button"
                disabled={scanState.status === 'capturing'}
                onPress={captureScorecard}
                style={({ pressed }) => [
                  styles.captureButton,
                  pressed && styles.captureButtonPressed,
                  scanState.status === 'capturing' && styles.captureButtonDisabled,
                ]}>
                {scanState.status === 'capturing' ? (
                  <ActivityIndicator color="#0f172a" />
                ) : (
                  <Text style={styles.captureButtonText}>Capture</Text>
                )}
              </Pressable>

              <Pressable
                accessibilityRole="button"
                onPress={resetScore}
                style={({ pressed }) => [
                  styles.resetButton,
                  pressed && styles.resetButtonPressed,
                ]}>
                <Text style={styles.resetButtonText}>Reset</Text>
              </Pressable>
            </View>
          </SafeAreaView>
        </>
      ) : (
        <View style={styles.permissionContainer}>
          <Text style={styles.permissionTitle}>
            {hasPermission
              ? 'No camera found'
              : 'Camera permission is required'}
          </Text>
          <Text style={styles.permissionText}>
            {hasPermission
              ? 'Connect a camera-capable device to scan a scorecard.'
              : 'Allow camera access so Golf Lens can read your card.'}
          </Text>
        </View>
      )}
    </View>
  );
}

function toEditableScores(scores: number[]) {
  return Array.from({ length: DISPLAY_HOLE_COUNT }, (_, index) => {
    const score = scores[index];
    return Number.isInteger(score) ? String(score) : '';
  });
}

function getEditableScoreTotal(scores: string[]) {
  return scores.reduce((sum, scoreText) => {
    const value = Number(scoreText);
    if (Number.isFinite(value) && value > 0) {
      return sum + value;
    }
    return sum;
  }, 0);
}

function toFileUri(pathOrUri: string) {
  if (/^(file|content|https?):\/\//.test(pathOrUri)) {
    return pathOrUri;
  }
  return `file://${pathOrUri}`;
}

const styles = StyleSheet.create({
  bottomControls: {
    bottom: 16,
    flexDirection: 'row',
    gap: 8,
    left: 14,
    position: 'absolute',
    right: 14,
  },
  captureButton: {
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    flex: 1,
    justifyContent: 'center',
    minHeight: 46,
  },
  captureButtonDisabled: {
    opacity: 0.65,
  },
  captureButtonPressed: {
    opacity: 0.8,
  },
  captureButtonText: {
    color: '#0f172a',
    fontSize: 15,
    fontWeight: '800',
  },
  container: {
    backgroundColor: '#000000',
    flex: 1,
  },
  content: {
    flex: 1,
  },
  headerBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(2, 6, 23, 0.7)',
    borderColor: 'rgba(148, 163, 184, 0.5)',
    borderRadius: 8,
    borderWidth: 1,
    marginLeft: 14,
    marginTop: 12,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  headerText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  holeHeaderCell: {
    color: '#93c5fd',
    fontSize: 10,
    textAlign: 'center',
    width: 20,
  },
  holeHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 2,
  },
  holeInputsRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 2,
  },
  mainScoreLabel: {
    color: '#bae6fd',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  mainScorePanel: {
    alignSelf: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.66)',
    borderColor: 'rgba(148, 163, 184, 0.55)',
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 16,
    maxWidth: 420,
    minHeight: 110,
    paddingHorizontal: 10,
    paddingVertical: 10,
    width: '96%',
  },
  mainScorePlaceholder: {
    color: '#e2e8f0',
    fontSize: 13,
    marginTop: 6,
  },
  nameHeader: {
    color: '#93c5fd',
    flexShrink: 0,
    fontSize: 10,
    fontWeight: '700',
    width: 66,
  },
  permissionContainer: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  permissionText: {
    color: '#cbd5e1',
    fontSize: 16,
    lineHeight: 23,
    marginBottom: 22,
    textAlign: 'center',
  },
  permissionTitle: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  resetButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.86)',
    borderColor: 'rgba(148, 163, 184, 0.6)',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 46,
  },
  resetButtonPressed: {
    opacity: 0.78,
  },
  resetButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  rowsScrollContent: {
    gap: 5,
    paddingBottom: 4,
  },
  rowsScrollView: {
    marginTop: 6,
    maxHeight: 200,
  },
  sawText: {
    bottom: 72,
    color: '#bae6fd',
    fontSize: 11,
    left: 14,
    position: 'absolute',
    right: 14,
  },
  scoreHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  scoreInput: {
    backgroundColor: 'rgba(2, 6, 23, 0.68)',
    borderColor: 'rgba(148, 163, 184, 0.44)',
    borderRadius: 4,
    borderWidth: 1,
    color: '#ffffff',
    fontSize: 12,
    height: 26,
    paddingVertical: 0,
    textAlign: 'center',
    width: 20,
  },
  scoreName: {
    color: '#ffffff',
    flexShrink: 0,
    fontSize: 13,
    fontWeight: '600',
    width: 66,
  },
  scoreRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  scoreTotal: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'right',
    width: 24,
  },
  totalHeaderCell: {
    color: '#93c5fd',
    fontSize: 10,
    textAlign: 'right',
    width: 24,
  },
  warningBanner: {
    alignSelf: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.84)',
    borderColor: 'rgba(148, 163, 184, 0.65)',
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 10,
    maxWidth: '92%',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  warningText: {
    color: '#f8fafc',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
});

export default App;
