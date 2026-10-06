/**
 * App.js
 * -------
 * Bare-bones single-screen client, matching step 4 of the roadmap exactly:
 *   - Shows your own position on a map
 *   - Sends position updates to the backend over WebSocket
 *   - Displays a basic alert (banner + vibration) when the client-side
 *     risk check flags danger against any other known device
 *
 * Deliberately skipped for v1 (per the roadmap): accounts, settings,
 * map UI polish, Bluetooth. Device ID is hardcoded below.
 */

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Vibration } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import { assessRisk, RiskLevel } from './collisionRisk';

// --- Config you'll need to change ---------------------------------
// Your phone and your computer must be on the same WiFi network.
// Replace this with your computer's LAN IP (not "localhost" — the
// phone can't resolve that to your computer). Find it with:
//   Mac/Linux: ifconfig | grep "inet "
//   Windows:   ipconfig
const SERVER_URL = 'ws://YOUR_COMPUTER_LAN_IP:8080';

// Hardcoded for v1 — no accounts system yet (per roadmap step 1 scope cut).
const DEVICE_ID = 'phone-1';

export default function App() {
  const [myLocation, setMyLocation] = useState(null);
  const [otherDevices, setOtherDevices] = useState({}); // deviceId -> state
  const [alertMessage, setAlertMessage] = useState(null);
  const [permissionError, setPermissionError] = useState(null);
  const wsRef = useRef(null);

  // --- WebSocket connection: set up once on mount ---
  useEffect(() => {
    const ws = new WebSocket(SERVER_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('Connected to server');
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === 'snapshot') {
        // Newly connected: server sent us everyone it currently knows about.
        setOtherDevices((prev) => ({ ...prev, ...data.devices }));
      } else if (data.type === 'position_update') {
        // One device's live update.
        setOtherDevices((prev) => ({
          ...prev,
          [data.deviceId]: {
            lat: data.lat,
            lon: data.lon,
            heading: data.heading,
            speed: data.speed,
            timestamp: data.timestamp,
          },
        }));
      }
    };

    ws.onerror = (err) => {
      console.log('WebSocket error:', err.message);
    };

    return () => {
      ws.close();
    };
  }, []);

  // --- Location tracking: request permission, then watch position ---
  useEffect(() => {
    let subscription;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setPermissionError('Location permission is required for this app to work.');
        return;
      }

      subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 1000, // request an update at most every 1s
          distanceInterval: 1, // or every 1 meter moved, whichever comes first
        },
        (location) => {
          const { latitude, longitude, heading, speed } = location.coords;

          // heading/speed can be -1 or null when the phone can't determine
          // them yet (e.g. standing still, no recent movement). Treat as 0.
          const safeHeading = heading && heading >= 0 ? heading : 0;
          const safeSpeed = speed && speed >= 0 ? speed : 0;

          const myState = {
            lat: latitude,
            lon: longitude,
            heading: safeHeading,
            speed: safeSpeed,
          };
          setMyLocation(myState);

          // Send to server
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(
              JSON.stringify({ deviceId: DEVICE_ID, ...myState })
            );
          }
        }
      );
    })();

    return () => {
      if (subscription) subscription.remove();
    };
  }, []);

  // --- Risk check: re-run whenever my location or other devices change ---
  useEffect(() => {
    if (!myLocation) return;

    let highestRisk = RiskLevel.NONE;

    for (const [deviceId, other] of Object.entries(otherDevices)) {
      const result = assessRisk(
        { lat: myLocation.lat, lon: myLocation.lon, headingDeg: myLocation.heading, speedMps: myLocation.speed },
        { lat: other.lat, lon: other.lon, headingDeg: other.heading, speedMps: other.speed }
      );

      if (result.riskLevel === RiskLevel.HIGH) {
        highestRisk = RiskLevel.HIGH;
        break; // HIGH is the worst case, no need to check further
      } else if (result.riskLevel === RiskLevel.MODERATE && highestRisk === RiskLevel.NONE) {
        highestRisk = RiskLevel.MODERATE;
      }
    }

    if (highestRisk === RiskLevel.HIGH) {
      setAlertMessage('⚠️ COLLISION RISK — something is approaching fast!');
      Vibration.vibrate([0, 300, 100, 300]); // pattern: pause, buzz, pause, buzz
    } else if (highestRisk === RiskLevel.MODERATE) {
      setAlertMessage('Caution: nearby traffic detected');
    } else {
      setAlertMessage(null);
    }
  }, [myLocation, otherDevices]);

  if (permissionError) {
    return (
      <View style={styles.centered}>
        <Text>{permissionError}</Text>
      </View>
    );
  }

  if (!myLocation) {
    return (
      <View style={styles.centered}>
        <Text>Getting your location...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        initialRegion={{
          latitude: myLocation.lat,
          longitude: myLocation.lon,
          latitudeDelta: 0.005,
          longitudeDelta: 0.005,
        }}
        region={{
          latitude: myLocation.lat,
          longitude: myLocation.lon,
          latitudeDelta: 0.005,
          longitudeDelta: 0.005,
        }}
      >
        <Marker
          coordinate={{ latitude: myLocation.lat, longitude: myLocation.lon }}
          title="You"
          pinColor="blue"
        />
        {Object.entries(otherDevices).map(([deviceId, state]) => (
          <Marker
            key={deviceId}
            coordinate={{ latitude: state.lat, longitude: state.lon }}
            title={deviceId}
            pinColor="red"
          />
        ))}
      </MapView>

      {alertMessage && (
        <View style={styles.alertBanner}>
          <Text style={styles.alertText}>{alertMessage}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  alertBanner: {
    position: 'absolute',
    top: 50,
    left: 20,
    right: 20,
    backgroundColor: '#d32f2f',
    padding: 16,
    borderRadius: 8,
  },
  alertText: {
    color: 'white',
    fontWeight: 'bold',
    textAlign: 'center',
  },
});
