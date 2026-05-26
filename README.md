# Golf Lens

Golf Lens is a React Native app for scanning golf scorecards. The current build is a camera-first live scanner that reads scorecard rows with on-device OCR, highlights unreadable numbers, and overlays player totals after the same result appears across consecutive scans.

## Current Build

The current app:

- Requests camera permission.
- Opens the rear camera with `react-native-vision-camera`.
- Shows a full-screen live camera preview.
- Captures periodic still frames in the background.
- Runs on-device text recognition with `@react-native-ml-kit/text-recognition`.
- Parses spatial OCR rows into player names, front-nine scores, and totals.
- Waits for a stable repeated scan before committing visible totals.
- Shows warning copy when no rows are detected, a row is incomplete, or OCR needs review.
- Draws red overlay boxes around score-like OCR elements that were not readable as valid scores.
- Does not include database, login, saving, or backend yet.

## Key Files

- `App.tsx`: Main camera screen, permission flow, live frame capture, OCR orchestration, scan stability, overlay boxes, warnings, and totals UI.
- `src/scorecardParser.ts`: Pure scorecard OCR parsing, score normalization, duplicate suppression, summaries, and warning selection.
- `android/app/src/main/AndroidManifest.xml`: Adds Android camera permission.
- `ios/GolfLens/Info.plist`: Adds iOS camera usage text: `This app uses the camera to scan golf score numbers.`
- `package.json` and `package-lock.json`: Adds `react-native-vision-camera`, `react-native-nitro-modules`, `react-native-nitro-image`, and `@react-native-ml-kit/text-recognition`.
- `ios/Podfile.lock`: Updated after installing iOS pods.
- `__tests__/App.test.tsx`: Covers app rendering and live scan status copy.
- `__tests__/scorecardParser.test.ts`: Covers parser row extraction, duplicate rows, summaries, and incomplete-row warnings.
- `jest.config.js` and `jest.setup.js`: Adds Jest mocks for the native camera module, mock camera device, and mock photo capture output.
- `ios/GolfLens.xcodeproj/project.pbxproj`: Includes Xcode project updates and disables user script sandboxing for React Native iOS builds.
- `ios/GolfLens.xcodeproj/xcshareddata/xcschemes/GolfLens.xcscheme`: Xcode scheme upgrade metadata.

## Important iOS Notes

The app uses the camera, so iOS requires this permission in `Info.plist`:

```xml
<key>NSCameraUsageDescription</key>
<string>This app uses the camera to scan golf score numbers.</string>
```

Xcode's recommended setting `ENABLE_USER_SCRIPT_SANDBOXING = YES` caused the React Native iOS build to fail because the build script needed to write `ip.txt` into the app bundle. The project sets it to `NO` for Debug and Release.

The direct iPad Mini build succeeded after that fix:

```text
** BUILD SUCCEEDED **
```

## Running The App

Open the iOS project in Xcode from the CocoaPods workspace:

```sh
open ios/GolfLens.xcworkspace
```

Use the workspace, not `ios/GolfLens.xcodeproj`, so Xcode loads the app target and Pods together.

Start Metro in one terminal:

```sh
npm start
```

Run on iOS simulator:

```sh
npm run ios
```

List available iOS devices:

```sh
npx react-native run-ios --list-devices
```

Run on the connected iPad Mini used during setup:

```sh
npx react-native run-ios --udid 00008130-0001145E3EE3803A --no-packager
```

Use `--no-packager` when Metro is already running.

## iPad / Physical Device Setup

Developer Mode is per-device. Enabling it on an iPhone does not enable it on the iPad.

For a new iPad:

1. Plug the iPad into the Mac.
2. Unlock the iPad.
3. Tap `Trust This Computer` if prompted.
4. Open Xcode.
5. Go to `Window -> Devices and Simulators`.
6. Select the iPad and wait for Xcode to prepare it.
7. On the iPad, enable `Settings -> Privacy & Security -> Developer Mode` if it appears.
8. Restart the iPad if prompted.

If Developer Mode does not appear, connect the iPad to Xcode first. It generally only appears on iOS/iPadOS 16 or later after Xcode has seen the device.

## Checks

Run these before wrapping up changes:

```sh
npm test -- --runInBand
npm test -- --runInBand --watchman=false
npm run lint
npx tsc --noEmit
```

After native dependency changes, run:

```sh
cd ios
bundle exec pod install
```

## Git / Backup Status

The project is saved locally at:

```text
/Users/dariusmtaylor/Documents/GolfLens
```

The GitHub remote is:

```text
https://github.com/dartaylor8/GolfLens.git
```

GitHub Desktop has been used successfully to push changes when Terminal could not access GitHub credentials.

## Next Milestones

Suggested next path:

1. Improve OCR parsing for full scorecards, back nine, totals, and multiple players.
2. Add image preprocessing such as grayscale, contrast, and sharpening.
3. Add score correction for uncertain or missing holes.
4. Persist confirmed scorecards locally.
5. Add a lightweight marketing-ready scan history screen.

OCR will not automatically recognize only golf scorecards. The app should make OCR behave like a scorecard scanner by combining:

- Stable live frame capture.
- Spatial grouping of OCR lines and elements.
- Image preprocessing such as grayscale, contrast, and sharpening.
- OCR for visible text and numbers.
- Golf-specific parsing for hole numbers, pars, scores, front 9, back 9, totals, and player names.
- Validation that rejects scans that do not look like scorecards.

The important user flow after OCR:

1. User hovers over the scorecard.
2. App reads live frames until the score rows stabilize.
3. OCR finds candidate player rows and scores.
4. App shows recognized totals on screen.
5. User reviews any highlighted uncertain numbers.
6. User confirms or corrects the numbers when the review flow is added.
