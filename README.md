# GolfScoreScanner

GolfScoreScanner is a React Native app for scanning golf scorecards. The current build is Milestone 3: a camera-first flow with an adjustable crop box, real still-image capture, cropped scorecard preview, confidence flags, score correction controls, totals, rescan, and confirmation.

## Current Milestone

Milestone 3 is complete:

- Requests camera permission.
- Opens the rear camera with `react-native-vision-camera`.
- Shows a full-screen live camera preview.
- Displays an adjustable rectangular scanning box.
- Lets users move the crop box and change its width/height before capture.
- Shows the prompt: `Hover over the scorecard`.
- Adds a capture button and temporary capturing state.
- Captures a still scorecard image using Vision Camera photo output.
- Crops the captured image around the adjusted on-screen scan box and saves that crop to a temporary file.
- Shows the cropped scorecard preview in review mode.
- Shows a golf-specific score review for the front nine.
- Calculates par, score, and score relative to par from sample scorecard data.
- Flags low-confidence holes that need a quick golfer review.
- Lets users select a hole and correct detected strokes before confirming.
- Lets users rescan or confirm the reviewed score.
- Does not include OCR, database, login, saving, or backend yet. Review scores are still sample placeholder values.

## Changed Files For Milestone 3

- `App.tsx`: Main camera screen, permission flow, adjustable scan box, capture/review/confirm state, real still-image capture, scan-box crop preview, sample scorecard preview, score correction controls, confidence flags, score totals, and controls.
- `android/app/src/main/AndroidManifest.xml`: Adds Android camera permission.
- `ios/GolfScoreScanner/Info.plist`: Adds iOS camera usage text: `This app uses the camera to scan golf score numbers.`
- `package.json` and `package-lock.json`: Adds `react-native-vision-camera`, `react-native-nitro-modules`, and `react-native-nitro-image`.
- `ios/Podfile.lock`: Updated after installing iOS pods.
- `__tests__/App.test.tsx`: Covers rendering, the capture-to-review flow, captured preview rendering, and correcting a detected score.
- `jest.config.js` and `jest.setup.js`: Adds Jest mocks for the native camera module, mock camera device, and mock photo capture output.
- `ios/GolfScoreScanner.xcodeproj/project.pbxproj`: Includes Xcode project updates and disables user script sandboxing for React Native iOS builds.
- `ios/GolfScoreScanner.xcodeproj/xcshareddata/xcschemes/GolfScoreScanner.xcscheme`: Xcode scheme upgrade metadata.

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
/Users/dariusmtaylor/Documents/GolfScoreScanner
```

The GitHub remote is:

```text
https://github.com/dartaylor8/GolfScoreScanner.git
```

GitHub Desktop has been used successfully to push changes when Terminal could not access GitHub credentials.

## Next Milestones

Suggested next path:

1. Add OCR and fill the score grid with detected numbers.
2. Highlight low-confidence OCR results so users know what to review.
3. Expand score correction from front nine to full scorecards and multiple players.
4. Persist confirmed scorecards locally.
5. Add a lightweight marketing-ready scan history screen.

OCR will not automatically recognize only golf scorecards. The app should make OCR behave like a scorecard scanner by combining:

- Cropping to the scan box.
- Respecting the user's adjusted crop box size and position.
- Image preprocessing such as grayscale, contrast, and sharpening.
- OCR for visible text and numbers.
- Golf-specific parsing for hole numbers, pars, scores, front 9, back 9, totals, and player names.
- Validation that rejects scans that do not look like scorecards.

The important user flow after OCR:

1. User hovers over the scorecard.
2. App captures/scans the scorecard.
3. OCR finds candidate numbers.
4. App shows recognized scores on screen.
5. User taps any number to correct it.
6. User confirms when the numbers look right.
