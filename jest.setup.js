/* global jest */

jest.mock('react-native-vision-camera', () => {
  const React = require('react');
  const { View } = require('react-native');

  return {
    Camera: props => React.createElement(View, props),
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
        toImageAsync: jest.fn(async () => ({
          cropAsync: jest.fn(async () => ({
            dispose: jest.fn(),
            saveToTemporaryFileAsync: jest.fn(async () => '/tmp/mock-scorecard.jpg'),
          })),
          dispose: jest.fn(),
          height: 1920,
          width: 1080,
        })),
      })),
    }),
  };
});
