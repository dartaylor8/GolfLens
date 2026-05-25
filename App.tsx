import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Dimensions,
  Image as RNImage,
  PanResponder,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native';
import type { Image as NitroImage } from 'react-native-nitro-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  usePhotoOutput,
} from 'react-native-vision-camera';
import TextRecognition, {
  type TextRecognitionResult,
} from '@react-native-ml-kit/text-recognition';

type ScoreHole = {
  confidence: 'high' | 'review';
  hole: number;
  par: number;
  strokes: number;
};

type OcrState = {
  error: string | null;
  recognizedText: string;
  status: 'idle' | 'reading' | 'complete' | 'fallback' | 'error';
};

type ScanFrame = {
  height: number;
  offsetX: number;
  offsetY: number;
  width: number;
};

type Size = {
  height: number;
  width: number;
};

const SCAN_BOX_HEIGHT = 96;
const SCAN_BOX_WIDTH = 240;
const OVERLAY_BOTTOM_OFFSET = 212;
const DEFAULT_SCAN_FRAME: ScanFrame = {
  height: SCAN_BOX_HEIGHT,
  offsetX: 0,
  offsetY: 0,
  width: SCAN_BOX_WIDTH,
};
const FRAME_HANDLE_SIZE = 44;
const FRONT_NINE_PAR = [4, 3, 5, 4, 4, 3, 4, 5, 4];

const PREVIEW_SCORECARD: ScoreHole[] = [
  { confidence: 'high', hole: 1, par: 4, strokes: 5 },
  { confidence: 'high', hole: 2, par: 3, strokes: 3 },
  { confidence: 'review', hole: 3, par: 5, strokes: 6 },
  { confidence: 'high', hole: 4, par: 4, strokes: 4 },
  { confidence: 'high', hole: 5, par: 4, strokes: 5 },
  { confidence: 'review', hole: 6, par: 3, strokes: 4 },
  { confidence: 'high', hole: 7, par: 4, strokes: 4 },
  { confidence: 'high', hole: 8, par: 5, strokes: 6 },
  { confidence: 'high', hole: 9, par: 4, strokes: 5 },
];
const DEFAULT_OCR_STATE: OcrState = {
  error: null,
  recognizedText: '',
  status: 'idle',
};

function App() {
  const isDarkMode = useColorScheme() === 'dark';
  const device = useCameraDevice('back');
  const photoOutput = usePhotoOutput();
  const { canRequestPermission, hasPermission, requestPermission } =
    useCameraPermission();
  const [scanStatus, setScanStatus] = useState<
    'ready' | 'scanning' | 'review' | 'confirmed'
  >('ready');
  const [capturedPhotoUri, setCapturedPhotoUri] = useState<string | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [ocrState, setOcrState] = useState<OcrState>(DEFAULT_OCR_STATE);
  const [scanFrame, setScanFrame] = useState(DEFAULT_SCAN_FRAME);
  const [overlaySize, setOverlaySize] = useState(getDefaultOverlaySize);
  const [scorecard, setScorecard] = useState(PREVIEW_SCORECARD);
  const [selectedHole, setSelectedHole] = useState(3);
  const gestureStartFrame = useRef(DEFAULT_SCAN_FRAME);
  const gestureMode = useRef<'move' | 'resize'>('move');

  const cameraOutputs = useMemo(() => [photoOutput], [photoOutput]);
  const scanFrameRect = useMemo(
    () => getScanFrameRect(scanFrame, overlaySize),
    [overlaySize, scanFrame],
  );

  const totals = useMemo(
    () =>
      scorecard.reduce(
        (summary, row) => ({
          par: summary.par + row.par,
          strokes: summary.strokes + row.strokes,
        }),
        { par: 0, strokes: 0 },
      ),
    [scorecard],
  );

  const reviewCount = useMemo(
    () => scorecard.filter(row => row.confidence === 'review').length,
    [scorecard],
  );

  const scoreRelativeToPar = totals.strokes - totals.par;
  const scoreLabel =
    scoreRelativeToPar === 0
      ? 'E'
      : scoreRelativeToPar > 0
        ? `+${scoreRelativeToPar}`
        : `${scoreRelativeToPar}`;
  const isCaptured = Boolean(capturedPhotoUri) && !captureError;
  const scanPrompt =
    scanStatus === 'confirmed'
      ? 'Scorecard saved'
      : captureError
        ? 'Capture needs another try'
        : isCaptured
          ? 'Scorecard area recognized'
          : scanStatus === 'scanning'
            ? 'Capturing scorecard area'
            : 'Hover over the scorecard';

  useEffect(() => {
    if (!hasPermission && canRequestPermission) {
      requestPermission();
    }
  }, [canRequestPermission, hasPermission, requestPermission]);

  const handleScan = async () => {
    setScorecard(PREVIEW_SCORECARD);
    setSelectedHole(3);
    setCapturedPhotoUri(null);
    setCaptureError(null);
    setOcrState({ ...DEFAULT_OCR_STATE, status: 'reading' });
    setScanStatus('scanning');

    try {
      const photo = await photoOutput.capturePhoto(
        {
          enableDistortionCorrection: true,
          enableShutterSound: true,
          flashMode: 'off',
        },
        {},
      );
      const capturedImage = await photo.toImageAsync();
      const croppedImage = await cropToScanBox(
        capturedImage,
        scanFrame,
        overlaySize,
      );
      const croppedPath = await croppedImage.saveToTemporaryFileAsync(
        'jpg',
        88,
      );

      const croppedPhotoUri = `file://${croppedPath}`;
      setCapturedPhotoUri(croppedPhotoUri);

      try {
        const ocrResult = await TextRecognition.recognize(croppedPhotoUri);
        const parsedScorecard = buildScorecardFromOcr(ocrResult);

        if (parsedScorecard) {
          setScorecard(parsedScorecard);
          setSelectedHole(
            parsedScorecard.find(row => row.confidence === 'review')?.hole ??
              parsedScorecard[0].hole,
          );
          setOcrState({
            error: null,
            recognizedText: ocrResult.text.trim(),
            status: 'complete',
          });
        } else {
          setScorecard(markScorecardForReview(PREVIEW_SCORECARD));
          setSelectedHole(1);
          setOcrState({
            error:
              'Golf Lens could not confidently find nine score numbers in the crop.',
            recognizedText: ocrResult.text.trim(),
            status: 'fallback',
          });
        }
      } catch (error) {
        setScorecard(markScorecardForReview(PREVIEW_SCORECARD));
        setSelectedHole(1);
        setOcrState({
          error:
            error instanceof Error
              ? error.message
              : 'Text recognition could not read this scorecard.',
          recognizedText: '',
          status: 'error',
        });
      }

      croppedImage.dispose();
      capturedImage.dispose();
      photo.dispose();
    } catch (error) {
      setCaptureError(
        error instanceof Error
          ? error.message
          : 'The camera could not capture this scorecard.',
      );
      setScorecard(markScorecardForReview(PREVIEW_SCORECARD));
      setSelectedHole(1);
      setOcrState({
        error:
          error instanceof Error
            ? error.message
            : 'Text recognition could not read this scorecard.',
        recognizedText: '',
        status: 'error',
      });
    } finally {
      setScanStatus('review');
    }
  };

  const handleRescan = () => {
    setCapturedPhotoUri(null);
    setCaptureError(null);
    setOcrState(DEFAULT_OCR_STATE);
    setScanStatus('ready');
  };

  const handleConfirm = () => {
    setScanStatus('confirmed');
  };

  const adjustScanFrame = useCallback((updates: Partial<ScanFrame>) => {
    setScanFrame(current =>
      normalizeScanFrame(
        {
          height: updates.height ?? current.height,
          offsetX: updates.offsetX ?? current.offsetX,
          offsetY: updates.offsetY ?? current.offsetY,
          width: updates.width ?? current.width,
        },
        overlaySize,
      ),
    );
  }, [overlaySize]);

  const scanFrameResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: event =>
          scanStatus === 'ready' &&
          isPointInFrame(
            event.nativeEvent.locationX,
            event.nativeEvent.locationY,
            scanFrameRect,
          ),
        onStartShouldSetPanResponder: event =>
          scanStatus === 'ready' &&
          isPointInFrame(
            event.nativeEvent.locationX,
            event.nativeEvent.locationY,
            scanFrameRect,
          ),
        onPanResponderGrant: event => {
          const { locationX, locationY } = event.nativeEvent;
          const isResizeHandle =
            locationX >= scanFrameRect.left + scanFrameRect.width - FRAME_HANDLE_SIZE &&
            locationY >= scanFrameRect.top + scanFrameRect.height - FRAME_HANDLE_SIZE;

          gestureMode.current = isResizeHandle ? 'resize' : 'move';
          gestureStartFrame.current = scanFrame;
        },
        onPanResponderMove: (_, gesture) => {
          const startFrame = gestureStartFrame.current;

          if (gestureMode.current === 'resize') {
            adjustScanFrame({
              height: startFrame.height + gesture.dy,
              width: startFrame.width + gesture.dx,
            });
            return;
          }

          adjustScanFrame({
            offsetX: startFrame.offsetX + gesture.dx,
            offsetY: startFrame.offsetY + gesture.dy,
          });
        },
      }),
    [adjustScanFrame, scanFrame, scanFrameRect, scanStatus],
  );

  const updateSelectedScore = (change: number) => {
    setScorecard(current =>
      current.map(row =>
        row.hole === selectedHole
          ? {
              ...row,
              confidence: 'high',
              strokes: Math.max(1, row.strokes + change),
            }
          : row,
      ),
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar
        barStyle={isDarkMode ? 'light-content' : 'dark-content'}
        hidden
      />
      {hasPermission && device ? (
        <>
          <Camera
            style={StyleSheet.absoluteFill}
            device={device}
            isActive={scanStatus !== 'confirmed'}
            outputs={cameraOutputs}
          />
          <SafeAreaView style={styles.content}>
            <View
              {...scanFrameResponder.panHandlers}
              onLayout={event => {
                setOverlaySize({
                  height: event.nativeEvent.layout.height,
                  width: event.nativeEvent.layout.width,
                });
              }}
              style={styles.overlay}>
              <Text pointerEvents="none" style={styles.scanPrompt}>
                {scanPrompt}
              </Text>
              <View
                pointerEvents="none"
                style={[
                  styles.scanBox,
                  {
                    height: scanFrame.height,
                    left: scanFrameRect.left,
                    top: scanFrameRect.top,
                    width: scanFrame.width,
                  },
                  scanStatus === 'scanning' && styles.scanBoxCapturing,
                  isCaptured && styles.scanBoxRecognized,
                  captureError && styles.scanBoxError,
                ]}>
                <View pointerEvents="none" style={styles.scanBoxHandle} />
              </View>
            </View>

            <View style={styles.bottomSheet}>
              {scanStatus === 'review' || scanStatus === 'confirmed' ? (
                <ReviewPanel
                  onConfirm={handleConfirm}
                  onDecrease={() => updateSelectedScore(-1)}
                  onIncrease={() => updateSelectedScore(1)}
                  onRescan={handleRescan}
                  onSelectHole={setSelectedHole}
                  captureError={captureError}
                  capturedPhotoUri={capturedPhotoUri}
                  ocrState={ocrState}
                  reviewCount={reviewCount}
                  scoreLabel={scoreLabel}
                  scorecard={scorecard}
                  selectedHole={selectedHole}
                  status={scanStatus}
                  totals={totals}
                />
              ) : (
                <ScanPanel
                  onScan={handleScan}
                  status={scanStatus}
                />
              )}
            </View>
          </SafeAreaView>
        </>
      ) : (
        <View style={styles.permissionContainer}>
          <Text style={styles.permissionTitle}>
            {hasPermission ? 'No camera found' : 'Camera permission is required'}
          </Text>
          <Text style={styles.permissionText}>
            {hasPermission
              ? 'Connect a camera-capable device to scan a scorecard.'
              : 'Allow camera access so Golf Lens can read your card.'}
          </Text>
          {!hasPermission && canRequestPermission ? (
            <Pressable
              accessibilityRole="button"
              onPress={requestPermission}
              style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>Allow camera</Text>
            </Pressable>
          ) : null}
        </View>
      )}
    </View>
  );
}

function ScanPanel({
  onScan,
  status,
}: {
  onScan: () => void;
  status: 'ready' | 'scanning';
}) {
  const isScanning = status === 'scanning';

  return (
    <>
      <Text style={styles.panelEyebrow}>Golf Lens</Text>
      <Text style={styles.panelTitle}>
        {isScanning ? 'Capturing scorecard...' : 'Ready to capture'}
      </Text>
      <Text style={styles.panelCopy}>
        Drag the frame over the score row. Pull the lower-right corner to resize
        it before capture.
      </Text>
      <Pressable
        accessibilityLabel="Capture scorecard"
        accessibilityRole="button"
        disabled={isScanning}
        onPress={onScan}
        style={[styles.primaryButton, isScanning && styles.disabledButton]}>
        <Text style={styles.primaryButtonText}>
          {isScanning ? 'Capturing...' : 'Capture scorecard'}
        </Text>
      </Pressable>
    </>
  );
}

function ReviewPanel({
  captureError,
  capturedPhotoUri,
  onConfirm,
  onDecrease,
  onIncrease,
  onRescan,
  onSelectHole,
  ocrState,
  reviewCount,
  scoreLabel,
  scorecard,
  selectedHole,
  status,
  totals,
}: {
  captureError: string | null;
  capturedPhotoUri: string | null;
  onConfirm: () => void;
  onDecrease: () => void;
  onIncrease: () => void;
  onRescan: () => void;
  onSelectHole: (hole: number) => void;
  ocrState: OcrState;
  reviewCount: number;
  scoreLabel: string;
  scorecard: ScoreHole[];
  selectedHole: number;
  status: 'review' | 'confirmed';
  totals: {
    par: number;
    strokes: number;
  };
}) {
  return (
    <>
      <View style={styles.reviewHeader}>
        <View>
          <Text style={styles.panelEyebrow}>
            {status === 'confirmed' ? 'Saved scan' : 'Review scan'}
          </Text>
          <Text style={styles.panelTitle}>Captured scorecard</Text>
        </View>
        <View style={styles.scoreBadge}>
          <Text style={styles.scoreBadgeLabel}>Score</Text>
          <Text style={styles.scoreBadgeValue}>{totals.strokes}</Text>
        </View>
      </View>
      <View style={styles.capturePreview}>
        {capturedPhotoUri ? (
          <RNImage
            accessibilityLabel="Captured scorecard preview"
            resizeMode="cover"
            source={{ uri: capturedPhotoUri }}
            style={styles.capturePreviewImage}
          />
        ) : (
          <View style={styles.capturePreviewFallback}>
            <Text style={styles.capturePreviewText}>
              {captureError
                ? 'Using sample score data because capture failed.'
                : 'Captured scorecard preview will appear here.'}
            </Text>
          </View>
        )}
      </View>
      {captureError ? (
        <Text style={styles.captureError}>{captureError}</Text>
      ) : null}
      <OcrStatusPanel ocrState={ocrState} />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.scoreTable}>
        {scorecard.map(row => (
          <Pressable
            accessibilityLabel={`Hole ${row.hole} score ${row.strokes}, ${
              row.confidence === 'review' ? 'review recommended' : 'confirmed'
            }`}
            accessibilityRole="button"
            disabled={status === 'confirmed'}
            key={row.hole}
            onPress={() => onSelectHole(row.hole)}
            style={[
              styles.scoreCell,
              row.hole === selectedHole && styles.scoreCellSelected,
              row.confidence === 'review' && styles.scoreCellReview,
            ]}>
            <Text style={styles.scoreCellLabel}>H{row.hole}</Text>
            <Text style={styles.scoreCellValue}>{row.strokes}</Text>
            <Text style={styles.scoreCellSubtext}>Par {row.par}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <View style={styles.summaryRow}>
        <Text style={styles.summaryText}>Par {totals.par}</Text>
        <Text style={styles.summaryText}>{scoreLabel}</Text>
      </View>
      <View style={styles.validationPanel}>
        <Text style={styles.validationText}>
          {reviewCount === 0
            ? 'All holes checked. Ready to confirm.'
            : `${reviewCount} holes need a quick golfer review.`}
        </Text>
        <Text style={styles.validationSubtext}>
          Tap any score to correct it before confirming. Low-confidence OCR
          results stay highlighted for review.
        </Text>
      </View>
      <View style={styles.stepperRow}>
        <Pressable
          accessibilityLabel="Decrease selected score"
          accessibilityRole="button"
          disabled={status === 'confirmed'}
          onPress={onDecrease}
          style={[
            styles.stepperButton,
            status === 'confirmed' && styles.disabledButton,
          ]}>
          <Text style={styles.stepperText}>-</Text>
        </Pressable>
        <Text style={styles.selectedHoleText}>Hole {selectedHole}</Text>
        <Pressable
          accessibilityLabel="Increase selected score"
          accessibilityRole="button"
          disabled={status === 'confirmed'}
          onPress={onIncrease}
          style={[
            styles.stepperButton,
            status === 'confirmed' && styles.disabledButton,
          ]}>
          <Text style={styles.stepperText}>+</Text>
        </Pressable>
      </View>
      <View style={styles.actionRow}>
        <Pressable
          accessibilityRole="button"
          onPress={onRescan}
          style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>Rescan</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={status === 'confirmed'}
          onPress={onConfirm}
          style={[
            styles.primaryButton,
            styles.actionButton,
            status === 'confirmed' && styles.disabledButton,
          ]}>
          <Text style={styles.primaryButtonText}>
            {status === 'confirmed' ? 'Confirmed' : 'Confirm score'}
          </Text>
        </Pressable>
      </View>
    </>
  );
}

function OcrStatusPanel({ ocrState }: { ocrState: OcrState }) {
  const statusCopy = {
    complete: 'OCR filled the score row from the cropped image.',
    error: 'OCR needs another try. Sample scores are loaded for review.',
    fallback: 'OCR ran, but the score row needs manual review.',
    idle: 'OCR will run after capture.',
    reading: 'Reading the score row...',
  }[ocrState.status];

  return (
    <View
      accessibilityLabel={`OCR status: ${statusCopy}`}
      style={[
        styles.ocrPanel,
        ocrState.status === 'complete' && styles.ocrPanelComplete,
        (ocrState.status === 'fallback' || ocrState.status === 'error') &&
          styles.ocrPanelReview,
      ]}>
      <Text style={styles.ocrPanelTitle}>Text recognition</Text>
      <Text style={styles.ocrPanelText}>{statusCopy}</Text>
      {ocrState.recognizedText ? (
        <Text numberOfLines={2} style={styles.ocrPanelRawText}>
          Saw: {ocrState.recognizedText}
        </Text>
      ) : null}
      {ocrState.error ? (
        <Text numberOfLines={2} style={styles.ocrPanelError}>
          {ocrState.error}
        </Text>
      ) : null}
    </View>
  );
}

function getDefaultOverlaySize(): Size {
  const windowSize = Dimensions.get('window');

  return {
    height: Math.max(1, windowSize.height - OVERLAY_BOTTOM_OFFSET),
    width: Math.max(1, windowSize.width),
  };
}

function normalizeScanFrame(frame: ScanFrame, overlaySize: Size): ScanFrame {
  const width = clamp(frame.width, 180, Math.min(340, overlaySize.width));
  const height = clamp(frame.height, 72, Math.min(180, overlaySize.height));
  const maxOffsetX = Math.max(0, (overlaySize.width - width) / 2);
  const maxOffsetY = Math.max(0, (overlaySize.height - height) / 2);

  return {
    height,
    offsetX: clamp(frame.offsetX, -maxOffsetX, maxOffsetX),
    offsetY: clamp(frame.offsetY, -maxOffsetY, maxOffsetY),
    width,
  };
}

function getScanFrameRect(scanFrame: ScanFrame, overlaySize: Size) {
  return {
    height: scanFrame.height,
    left: overlaySize.width / 2 - scanFrame.width / 2 + scanFrame.offsetX,
    top: overlaySize.height / 2 - scanFrame.height / 2 + scanFrame.offsetY,
    width: scanFrame.width,
  };
}

function isPointInFrame(
  x: number,
  y: number,
  frame: ReturnType<typeof getScanFrameRect>,
) {
  return (
    x >= frame.left &&
    x <= frame.left + frame.width &&
    y >= frame.top &&
    y <= frame.top + frame.height
  );
}

async function cropToScanBox(
  image: NitroImage,
  scanFrame: ScanFrame,
  overlaySize: Size,
) {
  const previewHeight = Math.max(1, overlaySize.height);
  const previewWidth = Math.max(1, overlaySize.width);
  const scaleX = image.width / previewWidth;
  const scaleY = image.height / previewHeight;
  const cropWidth = Math.min(previewWidth, scanFrame.width * 1.18);
  const cropHeight = Math.min(previewHeight, scanFrame.height * 1.55);
  const centerX = previewWidth / 2 + scanFrame.offsetX;
  const centerY = previewHeight / 2 + scanFrame.offsetY;
  const startX = clamp((centerX - cropWidth / 2) * scaleX, 0, image.width - 1);
  const startY = clamp((centerY - cropHeight / 2) * scaleY, 0, image.height - 1);
  const endX = clamp((centerX + cropWidth / 2) * scaleX, startX + 1, image.width);
  const endY = clamp(
    (centerY + cropHeight / 2) * scaleY,
    startY + 1,
    image.height,
  );

  return image.cropAsync(startX, startY, endX, endY);
}

function buildScorecardFromOcr(result: TextRecognitionResult) {
  const bestScores = getBestScoreCandidate(result);

  if (bestScores.length < FRONT_NINE_PAR.length) {
    return null;
  }

  return bestScores.slice(0, FRONT_NINE_PAR.length).map((strokes, index) => ({
    confidence: getOcrConfidence(strokes),
    hole: index + 1,
    par: FRONT_NINE_PAR[index],
    strokes,
  }));
}

function getBestScoreCandidate(result: TextRecognitionResult) {
  const lines = result.blocks.flatMap(block => block.lines.map(line => line.text));
  const candidates = [...lines, result.text]
    .map(text => parseScoreTokens(text))
    .filter(tokens => tokens.length > 0)
    .sort((left, right) => scoreCandidate(right) - scoreCandidate(left));

  return candidates[0] ?? [];
}

function parseScoreTokens(text: string) {
  return (text.match(/\b\d{1,2}\b/g) ?? [])
    .map(token => Number(token))
    .filter(value => Number.isInteger(value) && value >= 1 && value <= 12);
}

function scoreCandidate(tokens: number[]) {
  const countScore =
    FRONT_NINE_PAR.length - Math.abs(FRONT_NINE_PAR.length - tokens.length);
  const total = tokens.slice(0, FRONT_NINE_PAR.length).reduce((sum, value) => {
    return sum + value;
  }, 0);
  const totalScore = total >= 25 && total <= 80 ? 4 : 0;
  const sequencePenalty = isHoleNumberSequence(tokens) ? 8 : 0;

  return countScore + totalScore - sequencePenalty;
}

function isHoleNumberSequence(tokens: number[]) {
  return tokens
    .slice(0, FRONT_NINE_PAR.length)
    .every((token, index) => token === index + 1);
}

function getOcrConfidence(strokes: number): ScoreHole['confidence'] {
  return strokes >= 3 && strokes <= 8 ? 'high' : 'review';
}

function markScorecardForReview(scorecard: ScoreHole[]) {
  return scorecard.map(row => ({
    ...row,
    confidence: 'review' as const,
  }));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

const styles = StyleSheet.create({
  actionButton: {
    flex: 1,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 18,
  },
  bottomSheet: {
    backgroundColor: 'rgba(15, 23, 42, 0.92)',
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    padding: 20,
  },
  captureError: {
    color: '#fecaca',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 8,
  },
  capturePreview: {
    backgroundColor: '#020617',
    borderRadius: 8,
    height: 86,
    marginTop: 12,
    overflow: 'hidden',
  },
  capturePreviewFallback: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  capturePreviewImage: {
    height: '100%',
    width: '100%',
  },
  capturePreviewText: {
    color: '#94a3b8',
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  container: {
    backgroundColor: '#000000',
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  disabledButton: {
    opacity: 0.58,
  },
  overlay: {
    alignItems: 'center',
    bottom: OVERLAY_BOTTOM_OFFSET,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  permissionContainer: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  permissionTitle: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  permissionText: {
    color: '#cbd5e1',
    fontSize: 16,
    lineHeight: 23,
    marginBottom: 22,
    textAlign: 'center',
  },
  panelCopy: {
    color: '#cbd5e1',
    fontSize: 15,
    lineHeight: 21,
    marginBottom: 18,
  },
  panelEyebrow: {
    color: '#7dd3fc',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  panelTitle: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 8,
  },
  ocrPanel: {
    backgroundColor: 'rgba(15, 23, 42, 0.76)',
    borderColor: 'rgba(148, 163, 184, 0.34)',
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 10,
    padding: 12,
  },
  ocrPanelComplete: {
    backgroundColor: 'rgba(22, 101, 52, 0.34)',
    borderColor: 'rgba(134, 239, 172, 0.5)',
  },
  ocrPanelError: {
    color: '#fecaca',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 5,
  },
  ocrPanelRawText: {
    color: '#bae6fd',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 5,
  },
  ocrPanelReview: {
    backgroundColor: 'rgba(146, 64, 14, 0.3)',
    borderColor: 'rgba(253, 186, 116, 0.5)',
  },
  ocrPanelText: {
    color: '#e2e8f0',
    fontSize: 13,
    lineHeight: 18,
  },
  ocrPanelTitle: {
    color: '#f8fafc',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0,
    marginBottom: 3,
    textTransform: 'uppercase',
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#22c55e',
    borderRadius: 8,
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  primaryButtonText: {
    color: '#052e16',
    fontSize: 16,
    fontWeight: '800',
  },
  reviewHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  scanPrompt: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 24,
    textAlign: 'center',
    textShadowColor: '#000000',
    textShadowOffset: {
      height: 1,
      width: 0,
    },
    textShadowRadius: 6,
  },
  scanBox: {
    borderColor: '#ffffff',
    borderRadius: 4,
    borderWidth: 2,
    height: SCAN_BOX_HEIGHT,
    position: 'absolute',
    width: SCAN_BOX_WIDTH,
  },
  scanBoxCapturing: {
    borderColor: '#facc15',
  },
  scanBoxError: {
    borderColor: '#ef4444',
  },
  scanBoxRecognized: {
    borderColor: '#22c55e',
  },
  scanBoxHandle: {
    backgroundColor: '#ffffff',
    borderColor: '#0f172a',
    borderRadius: 7,
    borderWidth: 1,
    bottom: -8,
    height: 14,
    position: 'absolute',
    right: -8,
    width: 14,
  },
  scoreBadge: {
    alignItems: 'center',
    backgroundColor: '#e0f2fe',
    borderRadius: 8,
    minWidth: 76,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  scoreBadgeLabel: {
    color: '#0369a1',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  scoreBadgeValue: {
    color: '#082f49',
    fontSize: 24,
    fontWeight: '900',
  },
  scoreCell: {
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderColor: 'transparent',
    borderWidth: 2,
    borderRadius: 8,
    marginRight: 8,
    minWidth: 58,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  scoreCellLabel: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '700',
  },
  scoreCellReview: {
    backgroundColor: '#fef3c7',
  },
  scoreCellSelected: {
    borderColor: '#22c55e',
  },
  scoreCellSubtext: {
    color: '#64748b',
    fontSize: 12,
    marginTop: 1,
  },
  scoreCellValue: {
    color: '#0f172a',
    fontSize: 22,
    fontWeight: '900',
    marginTop: 2,
  },
  scoreTable: {
    marginTop: 12,
  },
  secondaryButton: {
    alignItems: 'center',
    borderColor: '#94a3b8',
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 18,
  },
  secondaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
  },
  selectedHoleText: {
    color: '#ffffff',
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
  },
  stepperButton: {
    alignItems: 'center',
    backgroundColor: '#e2e8f0',
    borderRadius: 8,
    height: 44,
    justifyContent: 'center',
    width: 56,
  },
  stepperRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    marginTop: 14,
  },
  stepperText: {
    color: '#0f172a',
    fontSize: 24,
    fontWeight: '900',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  summaryText: {
    color: '#e2e8f0',
    fontSize: 15,
    fontWeight: '700',
  },
  validationPanel: {
    backgroundColor: 'rgba(14, 165, 233, 0.16)',
    borderColor: 'rgba(125, 211, 252, 0.34)',
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 14,
    padding: 12,
  },
  validationSubtext: {
    color: '#bae6fd',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },
  validationText: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '800',
  },
});

export default App;
