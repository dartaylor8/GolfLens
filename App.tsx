import React, { useEffect } from 'react';
import {
  StatusBar,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native';
import { Camera, useCameraPermission } from 'react-native-vision-camera';

function App() {
  const isDarkMode = useColorScheme() === 'dark';
  const { canRequestPermission, hasPermission, requestPermission } =
    useCameraPermission();

  useEffect(() => {
    if (!hasPermission && canRequestPermission) {
      requestPermission();
    }
  }, [canRequestPermission, hasPermission, requestPermission]);

  return (
    <View style={styles.container}>
      <StatusBar
        barStyle={isDarkMode ? 'light-content' : 'dark-content'}
        hidden
      />
      {hasPermission ? (
        <>
          <Camera style={StyleSheet.absoluteFill} device="back" isActive />
          <View pointerEvents="none" style={styles.overlay}>
            <View style={styles.scanBox} />
          </View>
        </>
      ) : (
        <View style={styles.permissionContainer}>
          <Text style={styles.permissionText}>Camera permission is required.</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#000000',
    flex: 1,
  },
  overlay: {
    alignItems: 'center',
    bottom: 0,
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
  permissionText: {
    color: '#ffffff',
    fontSize: 16,
    textAlign: 'center',
  },
  scanBox: {
    borderColor: '#ffffff',
    borderRadius: 4,
    borderWidth: 2,
    height: 96,
    width: 240,
  },
});

export default App;
