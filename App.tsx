import React, { useEffect, useMemo, useState } from 'react';
import {
  Dimensions,
  Image as RNImage,
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

type ScoreHole = {
  confidence: 'high' | 'review';
  hole: number;
  par: number;
  strokes: number;
};

type ScanFrame = {
  height: number;
  offsetX: number;
  offsetY: number;
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
  const [scanFrame, setScanFrame] = useState(DEFAULT_SCAN_FRAME);
  const [scorecard, setScorecard] = useState(PREVIEW_SCORECARD);
  const [selectedHole, setSelectedHole] = useState(3);

  const cameraOutputs = useMemo(() => [photoOutput], [photoOutput]);

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
      const croppedImage = await cropToScanBox(capturedImage, scanFrame);
      const croppedPath = await croppedImage.saveToTemporaryFileAsync(
        'jpg',
        88,
      );

      setCapturedPhotoUri(`file://${croppedPath}`);
      croppedImage.dispose();
      capturedImage.dispose();
      photo.dispose();
    } catch (error) {
      setCaptureError(
        error instanceof Error
          ? error.message
          : 'The camera could not capture this scorecard.',
      );
    } finally {
      setScanStatus('review');
    }
  };

  const handleRescan = () => {
    setCapturedPhotoUri(null);
    setCaptureError(null);
    setScanStatus('ready');
  };

  const handleConfirm = () => {
    setScanStatus('confirmed');
  };

  const adjustScanFrame = (updates: Partial<ScanFrame>) => {
    setScanFrame(current => ({
      height: clamp(updates.height ?? current.height, 72, 180),
      offsetX: clamp(updates.offsetX ?? current.offsetX, -72, 72),
      offsetY: clamp(updates.offsetY ?? current.offsetY, -96, 72),
      width: clamp(updates.width ?? current.width, 180, 340),
    }));
  };

  const resetScanFrame = () => {
    setScanFrame(DEFAULT_SCAN_FRAME);
  };

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
            <View pointerEvents="none" style={styles.overlay}>
              <Text style={styles.scanPrompt}>{scanPrompt}</Text>
              <View
                style={[
                  styles.scanBox,
                  {
                    height: scanFrame.height,
                    transform: [
                      { translateX: scanFrame.offsetX },
                      { translateY: scanFrame.offsetY },
                    ],
                    width: scanFrame.width,
                  },
                  scanStatus === 'scanning' && styles.scanBoxCapturing,
                  isCaptured && styles.scanBoxRecognized,
                  captureError && styles.scanBoxError,
                ]}
              />
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
                  reviewCount={reviewCount}
                  scoreLabel={scoreLabel}
                  scorecard={scorecard}
                  selectedHole={selectedHole}
                  status={scanStatus}
                  totals={totals}
                />
              ) : (
                <ScanPanel
                  onAdjustFrame={adjustScanFrame}
                  onResetFrame={resetScanFrame}
                  onScan={handleScan}
                  scanFrame={scanFrame}
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
              : 'Allow camera access so Golf Score Scanner can read your card.'}
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
  onAdjustFrame,
  onResetFrame,
  onScan,
  scanFrame,
  status,
}: {
  onAdjustFrame: (updates: Partial<ScanFrame>) => void;
  onResetFrame: () => void;
  onScan: () => void;
  scanFrame: ScanFrame;
  status: 'ready' | 'scanning';
}) {
  const isScanning = status === 'scanning';

  return (
    <>
      <Text style={styles.panelEyebrow}>Milestone 3</Text>
      <Text style={styles.panelTitle}>
        {isScanning ? 'Capturing scorecard...' : 'Ready to capture'}
      </Text>
      <Text style={styles.panelCopy}>
        Line up the front nine inside the frame, then capture a still image for
        score review.
      </Text>
      <FrameControls
        disabled={isScanning}
        onAdjustFrame={onAdjustFrame}
        onResetFrame={onResetFrame}
        scanFrame={scanFrame}
      />
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

function FrameControls({
  disabled,
  onAdjustFrame,
  onResetFrame,
  scanFrame,
}: {
  disabled: boolean;
  onAdjustFrame: (updates: Partial<ScanFrame>) => void;
  onResetFrame: () => void;
  scanFrame: ScanFrame;
}) {
  return (
    <View style={styles.frameControls}>
      <View style={styles.frameControlHeader}>
        <Text style={styles.frameControlTitle}>Crop box</Text>
        <Pressable
          accessibilityRole="button"
          disabled={disabled}
          onPress={onResetFrame}
          style={[styles.frameResetButton, disabled && styles.disabledButton]}>
          <Text style={styles.frameResetText}>Reset</Text>
        </Pressable>
      </View>
      <View style={styles.frameControlGrid}>
        <FrameControlButton
          disabled={disabled}
          label="Up"
          onPress={() => onAdjustFrame({ offsetY: scanFrame.offsetY - 12 })}
        />
        <FrameControlButton
          disabled={disabled}
          label="W-"
          onPress={() => onAdjustFrame({ width: scanFrame.width - 24 })}
        />
        <FrameControlButton
          disabled={disabled}
          label="W+"
          onPress={() => onAdjustFrame({ width: scanFrame.width + 24 })}
        />
        <FrameControlButton
          disabled={disabled}
          label="Left"
          onPress={() => onAdjustFrame({ offsetX: scanFrame.offsetX - 12 })}
        />
        <FrameControlButton
          disabled={disabled}
          label="Down"
          onPress={() => onAdjustFrame({ offsetY: scanFrame.offsetY + 12 })}
        />
        <FrameControlButton
          disabled={disabled}
          label="Right"
          onPress={() => onAdjustFrame({ offsetX: scanFrame.offsetX + 12 })}
        />
        <FrameControlButton
          disabled={disabled}
          label="H-"
          onPress={() => onAdjustFrame({ height: scanFrame.height - 16 })}
        />
        <Text style={styles.frameSizeText}>
          {Math.round(scanFrame.width)} x {Math.round(scanFrame.height)}
        </Text>
        <FrameControlButton
          disabled={disabled}
          label="H+"
          onPress={() => onAdjustFrame({ height: scanFrame.height + 16 })}
        />
      </View>
    </View>
  );
}

function FrameControlButton({
  disabled,
  label,
  onPress,
}: {
  disabled: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={`Crop box ${label}`}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[styles.frameControlButton, disabled && styles.disabledButton]}>
      <Text style={styles.frameControlButtonText}>{label}</Text>
    </Pressable>
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
          Sample scores are placeholders until OCR is connected. Tap a hole to
          test corrections.
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

async function cropToScanBox(image: NitroImage, scanFrame: ScanFrame) {
  const windowSize = Dimensions.get('window');
  const previewHeight = Math.max(
    1,
    windowSize.height - OVERLAY_BOTTOM_OFFSET,
  );
  const previewWidth = Math.max(1, windowSize.width);
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
  frameControlButton: {
    alignItems: 'center',
    backgroundColor: '#334155',
    borderRadius: 8,
    height: 34,
    justifyContent: 'center',
    minWidth: 58,
    paddingHorizontal: 8,
  },
  frameControlButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
  },
  frameControlGrid: {
    alignItems: 'center',
    columnGap: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    rowGap: 8,
  },
  frameControlHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  frameControlTitle: {
    color: '#e2e8f0',
    fontSize: 13,
    fontWeight: '800',
  },
  frameControls: {
    backgroundColor: 'rgba(2, 6, 23, 0.4)',
    borderColor: 'rgba(148, 163, 184, 0.3)',
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 14,
    padding: 12,
  },
  frameResetButton: {
    alignItems: 'center',
    borderColor: '#64748b',
    borderRadius: 8,
    borderWidth: 1,
    height: 30,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  frameResetText: {
    color: '#e2e8f0',
    fontSize: 12,
    fontWeight: '800',
  },
  frameSizeText: {
    color: '#bae6fd',
    fontSize: 12,
    fontWeight: '800',
    minWidth: 78,
    textAlign: 'center',
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
