import React, { useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
} from 'react-native-vision-camera';

type ScoreHole = {
  hole: number;
  par: number;
  strokes: number;
};

const PREVIEW_SCORECARD: ScoreHole[] = [
  { hole: 1, par: 4, strokes: 5 },
  { hole: 2, par: 3, strokes: 3 },
  { hole: 3, par: 5, strokes: 6 },
  { hole: 4, par: 4, strokes: 4 },
  { hole: 5, par: 4, strokes: 5 },
  { hole: 6, par: 3, strokes: 4 },
  { hole: 7, par: 4, strokes: 4 },
  { hole: 8, par: 5, strokes: 6 },
  { hole: 9, par: 4, strokes: 5 },
];

function App() {
  const isDarkMode = useColorScheme() === 'dark';
  const device = useCameraDevice('back');
  const { canRequestPermission, hasPermission, requestPermission } =
    useCameraPermission();
  const [scanStatus, setScanStatus] = useState<
    'ready' | 'scanning' | 'review' | 'confirmed'
  >('ready');

  const totals = useMemo(
    () =>
      PREVIEW_SCORECARD.reduce(
        (summary, row) => ({
          par: summary.par + row.par,
          strokes: summary.strokes + row.strokes,
        }),
        { par: 0, strokes: 0 },
      ),
    [],
  );

  const scoreRelativeToPar = totals.strokes - totals.par;
  const scoreLabel =
    scoreRelativeToPar === 0
      ? 'E'
      : scoreRelativeToPar > 0
        ? `+${scoreRelativeToPar}`
        : `${scoreRelativeToPar}`;

  useEffect(() => {
    if (!hasPermission && canRequestPermission) {
      requestPermission();
    }
  }, [canRequestPermission, hasPermission, requestPermission]);

  const handleScan = () => {
    setScanStatus('scanning');
    setTimeout(() => {
      setScanStatus('review');
    }, 650);
  };

  const handleRescan = () => {
    setScanStatus('ready');
  };

  const handleConfirm = () => {
    setScanStatus('confirmed');
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
          />
          <SafeAreaView style={styles.content}>
            <View pointerEvents="none" style={styles.overlay}>
              <Text style={styles.scanPrompt}>
                {scanStatus === 'review'
                  ? 'Review the detected score'
                  : scanStatus === 'confirmed'
                    ? 'Scorecard saved'
                    : 'Hover over the scorecard'}
              </Text>
              <View
                style={[
                  styles.scanBox,
                  scanStatus === 'review' && styles.scanBoxComplete,
                ]}
              />
            </View>

            <View style={styles.bottomSheet}>
              {scanStatus === 'review' || scanStatus === 'confirmed' ? (
                <ReviewPanel
                  onConfirm={handleConfirm}
                  onRescan={handleRescan}
                  scoreLabel={scoreLabel}
                  scorecard={PREVIEW_SCORECARD}
                  status={scanStatus}
                  totals={totals}
                />
              ) : (
                <ScanPanel onScan={handleScan} status={scanStatus} />
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
  onScan,
  status,
}: {
  onScan: () => void;
  status: 'ready' | 'scanning';
}) {
  const isScanning = status === 'scanning';

  return (
    <>
      <Text style={styles.panelEyebrow}>Milestone 2</Text>
      <Text style={styles.panelTitle}>
        {isScanning ? 'Reading scorecard...' : 'Ready to scan'}
      </Text>
      <Text style={styles.panelCopy}>
        Line up the front nine inside the frame, then capture a scan for review.
      </Text>
      <Pressable
        accessibilityRole="button"
        disabled={isScanning}
        onPress={onScan}
        style={[styles.primaryButton, isScanning && styles.disabledButton]}>
        <Text style={styles.primaryButtonText}>
          {isScanning ? 'Scanning...' : 'Scan scorecard'}
        </Text>
      </Pressable>
    </>
  );
}

function ReviewPanel({
  onConfirm,
  onRescan,
  scoreLabel,
  scorecard,
  status,
  totals,
}: {
  onConfirm: () => void;
  onRescan: () => void;
  scoreLabel: string;
  scorecard: ScoreHole[];
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
          <Text style={styles.panelTitle}>Front nine detected</Text>
        </View>
        <View style={styles.scoreBadge}>
          <Text style={styles.scoreBadgeLabel}>Score</Text>
          <Text style={styles.scoreBadgeValue}>{totals.strokes}</Text>
        </View>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.scoreTable}>
        {scorecard.map(row => (
          <View key={row.hole} style={styles.scoreCell}>
            <Text style={styles.scoreCellLabel}>H{row.hole}</Text>
            <Text style={styles.scoreCellValue}>{row.strokes}</Text>
            <Text style={styles.scoreCellSubtext}>Par {row.par}</Text>
          </View>
        ))}
      </ScrollView>
      <View style={styles.summaryRow}>
        <Text style={styles.summaryText}>Par {totals.par}</Text>
        <Text style={styles.summaryText}>{scoreLabel}</Text>
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
    bottom: 212,
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
    height: 96,
    width: 240,
  },
  scanBoxComplete: {
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
});

export default App;
