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
  };
});
