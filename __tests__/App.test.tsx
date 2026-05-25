/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';

test('renders correctly', async () => {
  await ReactTestRenderer.act(() => {
    ReactTestRenderer.create(<App />);
  });
});

test('shows the score review after scanning', async () => {
  jest.useFakeTimers();
  let renderer: ReactTestRenderer.ReactTestRenderer;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App />);
  });

  const scanButton = renderer!.root
    .findAllByProps({ accessibilityRole: 'button' })
    .find(button => button.props.children.props.children === 'Scan scorecard');

  expect(scanButton).toBeDefined();

  await ReactTestRenderer.act(() => {
    scanButton!.props.onPress();
    jest.runOnlyPendingTimers();
  });

  expect(renderer!.root.findByProps({ children: 'Review scan' })).toBeTruthy();
  expect(renderer!.root.findByProps({ children: 42 })).toBeTruthy();

  jest.useRealTimers();
});
