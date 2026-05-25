import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  LayoutAnimation,
  LayoutChangeEvent,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
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
import TextRecognition, {
  type TextRecognitionResult,
} from '@react-native-ml-kit/text-recognition';

type PlayerScoreRow = {
  confidence: 'high' | 'review';
  id: string;
  name: string;
  scores: number[];
  total: number;
};

type FrameRect = {
  height: number;
  left: number;
  top: number;
  width: number;
};

type ParsedRowWithFrame = PlayerScoreRow & {
  frame?: FrameRect;
};

type LiveScanState = {
  ocrHint: string;
  rows: ParsedRowWithFrame[];
  status: 'idle' | 'reading' | 'ready' | 'warning' | 'error';
  warning: string | null;
};

const FRONT_NINE_PAR = [4, 3, 5, 4, 4, 3, 4, 5, 4];
const LIVE_SCAN_INTERVAL_MS = 1300;
const IS_TEST_ENV = (globalThis as { __GOLF_LENS_TEST__?: boolean })
  .__GOLF_LENS_TEST__ === true;
const STABLE_SCAN_STREAK = 2;

function App() {
  const isDarkMode = useColorScheme() === 'dark';
  const device = useCameraDevice('back');
  const photoOutput = usePhotoOutput();
  const cameraRef = useRef<CameraRef>(null);
  const scanBusyRef = useRef(false);
  const candidateKeyRef = useRef('');
  const candidateStreakRef = useRef(0);
  const [imageSize, setImageSize] = useState({ height: 1, width: 1 });
  const [liveRows, setLiveRows] = useState<ParsedRowWithFrame[]>([]);
  const [previewSize, setPreviewSize] = useState({ height: 1, width: 1 });
  const { canRequestPermission, hasPermission, requestPermission } =
    useCameraPermission();
  const [scanState, setScanState] = useState<LiveScanState>({
    ocrHint: '',
    rows: [],
    status: 'idle',
    warning: null,
  });

  const rowsNeedingReview = useMemo(
    () => scanState.rows.filter(row => row.confidence === 'review').length,
    [scanState.rows],
  );

  useEffect(() => {
    if (!hasPermission && canRequestPermission) {
      requestPermission();
    }
  }, [canRequestPermission, hasPermission, requestPermission]);

  useEffect(() => {
    if (!hasPermission || !device || IS_TEST_ENV) {
      return;
    }

    let mounted = true;
    const timer = setInterval(async () => {
      if (!mounted || scanBusyRef.current || !cameraRef.current) {
        return;
      }
      scanBusyRef.current = true;
      setScanState(prev => ({ ...prev, status: prev.rows.length ? 'reading' : 'idle' }));

      try {
        let uri = '';
        let frameWidth = 1;
        let frameHeight = 1;

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
          frameWidth = photo.width;
          frameHeight = photo.height;
          photo.dispose();
        } else {
          const snapshot = await cameraRef.current.takeSnapshot();
          const tempPath = await snapshot.saveToTemporaryFileAsync('jpg', 85);
          uri = toFileUri(tempPath);
          frameWidth = snapshot.width || 1;
          frameHeight = snapshot.height || 1;
        }

        const result = await TextRecognition.recognize(uri);
        const parsedRows = getPlayerScoreRowsFromSpatialLayout(result).map(row => {
          const normalizedScores = normalizeDisplayedScores(row.scores);
          const confidence: 'high' | 'review' =
            normalizedScores.length >= FRONT_NINE_PAR.length ? 'high' : 'review';
          return {
            ...row,
            confidence,
            id: `${row.name}-${normalizedScores.join('-')}`,
            scores: normalizedScores,
            total: normalizedScores.reduce((sum, score) => sum + score, 0),
          };
        });
        const deduped = dedupePlayerRows(parsedRows);
        setLiveRows(deduped);
        const warning = getScanWarning(deduped);
        const key = deduped
          .map(row => `${row.name}:${row.scores.join('-')}`)
          .join('|');

        if (key && key === candidateKeyRef.current) {
          candidateStreakRef.current += 1;
        } else {
          candidateKeyRef.current = key;
          candidateStreakRef.current = 1;
        }

        const shouldCommitTotals =
          deduped.length > 0 && candidateStreakRef.current >= STABLE_SCAN_STREAK;

        setImageSize({
          height: frameHeight,
          width: frameWidth,
        });
        if (shouldCommitTotals) {
          setScanState({
            ocrHint: summarizePlayerRows(deduped).slice(0, 160),
            rows: deduped,
            status: warning ? 'warning' : 'ready',
            warning,
          });
        } else {
          setScanState(prev => ({
            ...prev,
            status: warning ? 'warning' : prev.status,
            warning,
          }));
        }
      } catch (error) {
        setScanState(prev => ({
          ...prev,
          status: 'error',
          warning:
            error instanceof Error
              ? error.message
              : 'OCR is having trouble. Move closer and hold steady.',
        }));
      } finally {
        scanBusyRef.current = false;
      }
    }, LIVE_SCAN_INTERVAL_MS);

    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [device, hasPermission, photoOutput]);

  const onPreviewLayout = (event: LayoutChangeEvent) => {
    const { height, width } = event.nativeEvent.layout;
    if (height > 0 && width > 0) {
      setPreviewSize({ height, width });
    }
  };

  const overlayBoxes = useMemo(() => {
    if (liveRows.length === 0) {
      return [];
    }
    const scaleX = previewSize.width / imageSize.width;
    const scaleY = previewSize.height / imageSize.height;

    return liveRows
      .filter(row => row.confidence === 'review' && row.frame)
      .map(row => ({
        frame: {
          height: Math.max(20, (row.frame?.height ?? 24) * scaleY),
          left: Math.max(0, (row.frame?.left ?? 0) * scaleX),
          top: Math.max(0, (row.frame?.top ?? 0) * scaleY),
          width: Math.max(80, (row.frame?.width ?? 120) * scaleX),
        },
        id: row.id,
      }));
  }, [imageSize.height, imageSize.width, liveRows, previewSize.height, previewSize.width]);

  useEffect(() => {
    if (overlayBoxes.length > 0) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
  }, [overlayBoxes]);

  const cameraStatusCopy =
    scanState.status === 'error'
      ? 'OCR error'
      : scanState.status === 'warning'
        ? 'Needs review'
        : scanState.status === 'reading'
          ? 'Reading...'
          : scanState.rows.length > 0
            ? 'Live totals'
            : 'Point camera at scorecard';

  return (
    <View onLayout={onPreviewLayout} style={styles.container}>
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

            {overlayBoxes.map(box => (
              <View key={box.id} pointerEvents="none" style={[styles.unreadableBox, box.frame]} />
            ))}

            <View pointerEvents="none" style={styles.totalsColumn}>
              {scanState.rows.map(row => (
                <View key={row.id} style={styles.totalPill}>
                  <Text numberOfLines={1} style={styles.totalName}>
                    {row.name}
                  </Text>
                  <Text style={styles.totalValue}>{row.total}</Text>
                </View>
              ))}
            </View>

            {scanState.ocrHint ? (
              <Text numberOfLines={1} style={styles.sawText}>
                Saw: {scanState.ocrHint}
              </Text>
            ) : null}

            {rowsNeedingReview > 0 ? (
              <Text style={styles.reviewHint}>
                {rowsNeedingReview} row{rowsNeedingReview === 1 ? '' : 's'} need review
              </Text>
            ) : null}
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
        </View>
      )}
    </View>
  );
}

function getScanWarning(rows: ParsedRowWithFrame[]) {
  if (rows.length === 0) {
    return 'No player rows detected yet. Move closer and align the score rows.';
  }

  const missing = rows.find(row => row.scores.length < 9);
  if (missing) {
    return `Missing numbers for ${missing.name}. Hold still so handwriting is clearer.`;
  }

  const review = rows.find(row => row.confidence === 'review');
  if (review) {
    return `OCR is unsure about ${review.name}. Keep the row flat and in focus.`;
  }

  return null;
}

function getPlayerScoreRowsFromSpatialLayout(result: TextRecognitionResult) {
  const items = result.blocks.flatMap(block =>
    block.lines.flatMap(line => {
      const lineFrame = line.frame;
      const elementTexts = line.elements
        ?.map(element => element.text.trim())
        .filter(Boolean);
      const lineText = line.text.trim();
      const tokens = elementTexts && elementTexts.length > 0
        ? elementTexts
        : splitLineTokens(lineText);
      const top = lineFrame?.top ?? line.elements?.[0]?.frame?.top ?? Number.NaN;
      const left = lineFrame?.left ?? line.elements?.[0]?.frame?.left ?? Number.NaN;
      const height = lineFrame?.height ?? line.elements?.[0]?.frame?.height ?? 24;
      const width = lineFrame?.width ?? line.elements?.[0]?.frame?.width ?? 120;

      if (!Number.isFinite(top) || !Number.isFinite(left) || tokens.length === 0) {
        return [];
      }

      return [{ height, left, text: lineText, tokens, top, width }];
    }),
  );

  if (items.length === 0) {
    return [];
  }

  const sorted = [...items].sort((a, b) => a.top - b.top);
  const avgHeight =
    sorted.reduce((sum, item) => sum + Math.max(16, item.height), 0) /
    Math.max(1, sorted.length);
  const rowTolerance = Math.max(12, avgHeight * 0.6);
  const groupedRows: Array<typeof sorted> = [];

  for (const item of sorted) {
    const lastRow = groupedRows[groupedRows.length - 1];
    if (!lastRow) {
      groupedRows.push([item]);
      continue;
    }
    const rowCenter =
      lastRow.reduce((sum, rowItem) => sum + rowItem.top, 0) / lastRow.length;
    if (Math.abs(item.top - rowCenter) <= rowTolerance) {
      lastRow.push(item);
    } else {
      groupedRows.push([item]);
    }
  }

  return groupedRows
    .map(group => buildPlayerRowFromSpatialGroup(group))
    .filter((row): row is ParsedRowWithFrame => Boolean(row));
}

function buildPlayerRowFromSpatialGroup(
  group: Array<{
    height: number;
    left: number;
    text: string;
    tokens: string[];
    top: number;
    width: number;
  }>,
): ParsedRowWithFrame | null {
  const ordered = [...group].sort((a, b) => a.left - b.left);
  const mergedText = ordered.map(item => item.text).join(' ');
  const mergedTokens = ordered.flatMap(item => item.tokens);
  const name = getPlayerName(ordered[0]?.text ?? mergedText);
  let scores = parseScoreTokens(mergedTokens.join(' ')).slice(0, 18);
  if (/^\s*\d{1,2}[.)]\s*[A-Za-z]/.test(mergedText) && scores.length > 0) {
    scores = scores.slice(1);
  }

  if (!name || scores.length < 3 || looksLikeMetadataRow(name, scores)) {
    return null;
  }

  const left = Math.min(...ordered.map(item => item.left));
  const top = Math.min(...ordered.map(item => item.top));
  const right = Math.max(...ordered.map(item => item.left + item.width));
  const bottom = Math.max(...ordered.map(item => item.top + item.height));
  const frame = {
    height: Math.max(24, bottom - top),
    left,
    top,
    width: Math.max(120, right - left),
  };
  const confidence = scores.length >= FRONT_NINE_PAR.length ? 'high' : 'review';

  return {
    confidence,
    frame,
    id: `${name}-${scores.join('-')}`,
    name,
    scores,
    total: scores.reduce((sum, score) => sum + score, 0),
  };
}

function splitLineTokens(text: string) {
  return text
    .split(/\s+/)
    .map(token => token.trim())
    .filter(Boolean);
}

function normalizeDisplayedScores(scores: number[]) {
  if (scores.length === 0) {
    return scores;
  }

  const clipped = scores.filter(score => score >= 1 && score <= 12);
  if (clipped.length <= FRONT_NINE_PAR.length) {
    return clipped;
  }

  return clipped.slice(0, FRONT_NINE_PAR.length);
}

function parseScoreTokens(text: string) {
  const normalized = normalizeScoreText(text);
  const explicitTokens = (normalized.match(/\b\d{1,2}\b/g) ?? [])
    .map(token => Number(token))
    .filter(value => Number.isInteger(value) && value >= 1 && value <= 12);

  if (explicitTokens.length >= 3) {
    return explicitTokens;
  }

  const compactRuns = normalized.match(/\d{6,18}/g) ?? [];
  return compactRuns
    .flatMap(run => run.split(''))
    .map(token => Number(token))
    .filter(value => Number.isInteger(value) && value >= 1 && value <= 9);
}

function getPlayerName(text: string) {
  const cleanedName = text
    .replace(/\d+/g, ' ')
    .replace(/[^A-Za-z .'-]/g, ' ')
    .replace(/\b(player|name|gross|net|total|out|in|score|hole|holes|par|yard|yards|yardage|tee|tees|hcp|hdcp|handicap)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleanedName || isIgnoredScorecardLabel(cleanedName)) {
    return '';
  }

  const words = cleanedName
    .split(' ')
    .map(word => word.trim())
    .filter(word => word.length > 1);

  return words.length === 0 ? '' : words.slice(0, 3).join(' ');
}

function isIgnoredScorecardLabel(label: string) {
  return /^(hole|holes|par|yard|yards|yardage|hcp|hdcp|handicap|index|rating|slope|out|in|total|totals|score|scores|front|back|tee|tees)$/i.test(
    label.trim(),
  );
}

function looksLikeMetadataRow(name: string, scores: number[]) {
  if (isIgnoredScorecardLabel(name) || /^official scorecard$/i.test(name.trim())) {
    return true;
  }
  return scores.some(score => score > 12);
}

function normalizeScoreText(text: string) {
  return text
    .replace(/[Oo]/g, '0')
    .replace(/[Il|]/g, '1')
    .replace(/[Bb]/g, '8')
    .replace(/[Ss]/g, '5');
}

function dedupePlayerRows(rows: ParsedRowWithFrame[]) {
  const seen = new Set<string>();
  return rows.filter(row => {
    const key = `${row.name.toLowerCase()}-${row.scores.join('-')}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function summarizePlayerRows(rows: ParsedRowWithFrame[]) {
  return rows
    .map(row => `${row.name}: ${row.scores.join(' ')} = ${row.total}`)
    .join('\n');
}

function toFileUri(pathOrUri: string) {
  if (/^(file|content|https?):\/\//.test(pathOrUri)) {
    return pathOrUri;
  }
  return `file://${pathOrUri}`;
}

const styles = StyleSheet.create({
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
  reviewHint: {
    alignSelf: 'center',
    bottom: 18,
    color: '#fca5a5',
    fontSize: 13,
    fontWeight: '700',
    position: 'absolute',
    textShadowColor: '#000000',
    textShadowRadius: 6,
  },
  sawText: {
    bottom: 42,
    color: '#bae6fd',
    fontSize: 11,
    left: 14,
    position: 'absolute',
    right: 14,
  },
  totalName: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '600',
    maxWidth: 110,
  },
  totalPill: {
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    borderColor: 'rgba(148, 163, 184, 0.4)',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
    minHeight: 34,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  totalsColumn: {
    gap: 8,
    position: 'absolute',
    right: 10,
    top: 86,
    width: 170,
  },
  totalValue: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '900',
  },
  unreadableBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.24)',
    borderColor: 'rgba(248, 113, 113, 0.95)',
    borderRadius: 6,
    borderWidth: 1,
    position: 'absolute',
  },
  warningBanner: {
    alignSelf: 'center',
    backgroundColor: 'rgba(127, 29, 29, 0.78)',
    borderColor: 'rgba(248, 113, 113, 0.8)',
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 10,
    maxWidth: '92%',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  warningText: {
    color: '#fee2e2',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
});

export default App;
