/* global jest */
global.__GOLF_LENS_TEST__ = true;

jest.mock('react-native-vision-camera', () => {
  const React = require('react');
  const { View } = require('react-native');

  const MockCamera = React.forwardRef((props, ref) => {
    React.useImperativeHandle(ref, () => ({
      takeSnapshot: jest.fn(async () => ({
        width: 1280,
        height: 720,
        saveToTemporaryFileAsync: jest.fn(async () => '/tmp/mock-snapshot.jpg'),
      })),
    }));

    return React.createElement(View, props);
  });

  return {
    Camera: MockCamera,
    useCameraPermission: () => ({
      canRequestPermission: false,
      hasPermission: true,
      requestPermission: jest.fn(),
      status: 'authorized',
    }),
    useCameraDevice: () => ({ id: 'mock-back-camera' }),
    usePhotoOutput: () => ({
      capturePhoto: jest.fn(async () => ({
        dispose: jest.fn(),
        height: 720,
        saveToTemporaryFileAsync: jest.fn(async () => '/tmp/mock-full-scorecard.jpg'),
        width: 1280,
      })),
    }),
  };
});

jest.mock('@react-native-ml-kit/text-recognition', () => ({
  __esModule: true,
  default: {
    recognize: jest.fn(async () => ({
      blocks: [
        {
          lines: [
            {
              text: 'Hole 1 2 3 4 5 6 7 8 9',
            },
            {
              text: 'Par 4 3 5 4 4 3 4 5 4',
            },
            {
              text: 'Yards 388 154 522 410 401 171 395 530 418',
            },
            {
              text: 'Darius 4 4 5 5 4 3 4 5 4',
            },
            {
              text: 'Dad 5 4 6 4 5 3 5 6 4',
            },
          ],
          text: 'Hole 1 2 3 4 5 6 7 8 9\nPar 4 3 5 4 4 3 4 5 4\nYards 388 154 522 410 401 171 395 530 418\nDarius 4 4 5 5 4 3 4 5 4\nDad 5 4 6 4 5 3 5 6 4',
        },
      ],
      text: 'Hole 1 2 3 4 5 6 7 8 9\nPar 4 3 5 4 4 3 4 5 4\nYards 388 154 522 410 401 171 395 530 418\nDarius 4 4 5 5 4 3 4 5 4\nDad 5 4 6 4 5 3 5 6 4',
    })),
  },
}));
