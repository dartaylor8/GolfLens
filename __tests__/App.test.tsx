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

test('shows the score review after capturing a card', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App />);
  });

  const scanButton = renderer!.root.findByProps({
    accessibilityLabel: 'Capture scorecard',
  });

  expect(scanButton).toBeDefined();

  await ReactTestRenderer.act(async () => {
    await scanButton!.props.onPress();
  });

  expect(renderer!.root.findByProps({ children: 'Review scan' })).toBeTruthy();
  expect(
    renderer!.root.findByProps({
      accessibilityLabel: 'Captured scorecard preview',
    }),
  ).toBeTruthy();
  expect(renderer!.root.findByProps({ children: 42 })).toBeTruthy();
});

test('lets golfers correct a detected hole score', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App />);
  });

  const scanButton = renderer!.root.findByProps({
    accessibilityLabel: 'Capture scorecard',
  });

  await ReactTestRenderer.act(async () => {
    await scanButton!.props.onPress();
  });

  const holeThree = renderer!.root.findByProps({
    accessibilityLabel: 'Hole 3 score 6, review recommended',
  });

  await ReactTestRenderer.act(() => {
    holeThree.props.onPress();
  });

  const increaseButton = renderer!.root.findByProps({
    accessibilityLabel: 'Increase selected score',
  });

  await ReactTestRenderer.act(() => {
    increaseButton.props.onPress();
  });

  expect(renderer!.root.findByProps({ children: 43 })).toBeTruthy();
  expect(
    renderer!.root.findByProps({
      accessibilityLabel: 'Hole 3 score 7, confirmed',
    }),
  ).toBeTruthy();
});
