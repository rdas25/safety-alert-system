import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Vibration, ScrollView, Platform,
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import { DEFAULT_SERVER } from './config';

const ROLES = ['pedestrian', 'cyclist', 'driver'];
const RANK = { NONE: 0, LOW: 1, MODERATE: 2, HIGH: 3, CRITICAL: 4 };
const LEVEL_COLOR = { NONE: '#2e7d32', LOW: '#f9a825', MODERATE: '#ef6c00', HIGH: '#d32f2f', CRITICAL: '#7f0000' };
const LEVEL_TITLE = { LOW: 'Heads up', MODERATE: 'Caution', HIGH: 'WARNING', CRITICAL: 'DANGER' };
const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

const compass = (deg) => COMPASS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const fmt = (v, n) => (v === null || v === undefined ? 'n/a' : Number(v).toFixed(n));

// New random ID every time the app launches, so two phones can never collide.
const makeDeviceId = () => 'dev-' + Math.random().toString(36).slice(2, 8);

export default function App() {
  const [session, setSession] = useState(null); // { server, role, deviceId }
  if (!session) return <Setup onStart={setSession} />;
  return <Tracker {...session} onStop={() => setSession(null)} />;
}

// ---------------------------------------------------------------- setup screen
function Setup({ onStart }) {
  const [server, setServer] = useState(DEFAULT_SERVER);
  const [role, setRole] = useState('pedestrian');
  const [deviceId] = useState(makeDeviceId);

  return (
    <ScrollView contentContainerStyle={styles.setup} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Safety Alert</Text>
      <Text style={styles.label}>Server (computer address and port)</Text>
      <TextInput
        style={styles.input}
        value={server}
        onChangeText={setServer}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        placeholder="192.168.1.50:8080"
      />
      <Text style={styles.label}>I am a...</Text>
      <View style={styles.row}>
        {ROLES.map((r) => (
          <TouchableOpacity key={r} style={[styles.roleBtn, role === r && styles.roleBtnOn]} onPress={() => setRole(r)}>
            <Text style={[styles.roleTxt, role === r && styles.roleTxtOn]}>{cap(r)}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={styles.hint}>This phone's ID: {deviceId}</Text>
      <TouchableOpacity
        style={styles.startBtn}
        onPress={() => onStart({ server: server.trim(), role, deviceId })}
      >
        <Text style={styles.startTxt}>Start</Text>
      </TouchableOpacity>
      <Text style={styles.hint}>
        Keep this screen on and the app open while testing. Phone and computer must be on the same network.
      </Text>
    </ScrollView>
  );
}

// ---------------------------------------------------------------- tracking screen
function Tracker({ server, role, deviceId, onStop }) {
  const [conn, setConn] = useState('connecting');
  const [fix, setFix] = useState(null);
  const [status, setStatus] = useState(null);
  const [serverError, setServerError] = useState(null);
  const [permError, setPermError] = useState(null);
  const [now, setNow] = useState(Date.now());

  const wsRef = useRef(null);
  const fixRef = useRef(null);
  const prevLevelRef = useRef('NONE');

  // 1 Hz ticker so "message age" updates on screen
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // WebSocket with automatic reconnect
  useEffect(() => {
    let closed = false;
    let retryTimer = null;
    let attempt = 0;
    const url = /^wss?:\/\//.test(server) ? server : 'ws://' + server;

    const connect = () => {
      if (closed) return;
      setConn(attempt === 0 ? 'connecting' : 'reconnecting');
      const ws = new WebSocket(url);
      wsRef.current = ws;
      ws.onopen = () => { attempt = 0; setConn('connected'); setServerError(null); };
      ws.onmessage = (e) => {
        let m;
        try { m = JSON.parse(e.data); } catch (err) { return; }
        if (m.type === 'status') setStatus({ ...m, receivedAt: Date.now() });
        else if (m.type === 'error') setServerError(m.message);
      };
      ws.onerror = () => {};
      ws.onclose = () => {
        if (wsRef.current === ws) wsRef.current = null;
        if (closed) return;
        setConn('reconnecting');
        attempt += 1;
        retryTimer = setTimeout(connect, Math.min(5000, 500 * 2 ** attempt));
      };
    };
    connect();
    return () => {
      closed = true;
      clearTimeout(retryTimer);
      if (wsRef.current) wsRef.current.close();
    };
  }, [server]);

  // GPS
  useEffect(() => {
    let sub = null;
    let cancelled = false;
    (async () => {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') {
        setPermError('Location permission denied. Enable it in Settings > Privacy > Location Services.');
        return;
      }
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 0 },
        (loc) => {
          const c = loc.coords;
          const f = {
            lat: c.latitude,
            lon: c.longitude,
            speed: Number.isFinite(c.speed) && c.speed >= 0 ? c.speed : null,
            heading: Number.isFinite(c.heading) && c.heading >= 0 ? c.heading : null,
            accuracy: Number.isFinite(c.accuracy) && c.accuracy >= 0 ? c.accuracy : null,
            fixTime: loc.timestamp,
          };
          fixRef.current = f;
          setFix(f);
        }
      );
      if (cancelled && sub) sub.remove();
    })();
    return () => { cancelled = true; if (sub) sub.remove(); };
  }, []);

  // Send the latest fix once per second (also when standing still, so the server knows we are alive)
  useEffect(() => {
    const id = setInterval(() => {
      const f = fixRef.current;
      const ws = wsRef.current;
      if (!f || !ws || ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({
        type: 'position',
        deviceId,
        role,
        lat: f.lat,
        lon: f.lon,
        speed: f.speed,
        heading: f.heading,
        accuracy: f.accuracy,
        fixAgeMs: Math.max(0, Date.now() - f.fixTime),
      }));
    }, 1000);
    return () => clearInterval(id);
  }, [deviceId, role]);

  // Vibrate when the alert level rises to HIGH or CRITICAL (not on every update)
  useEffect(() => {
    const level = status ? status.level : 'NONE';
    const prev = prevLevelRef.current;
    if (RANK[level] > RANK[prev]) {
      if (level === 'CRITICAL') Vibration.vibrate([0, 500, 120, 500, 120, 500]);
      else if (level === 'HIGH') Vibration.vibrate([0, 400, 150, 400]);
    }
    prevLevelRef.current = level;
  }, [status]);

  const level = status ? status.level : 'NONE';
  const threat = status ? status.threat : null;
  const peers = status ? status.peers : [];
  const statusAgeS = status ? (now - status.receivedAt) / 1000 : null;

  let bannerText = null;
  if (threat) {
    bannerText =
      `${cap(threat.peerRole)} ${Math.round(threat.distanceM)} m to the ${compass(threat.bearingDeg)}. ` +
      `Closest approach in ${Math.max(0, Math.round(threat.tcpaS))} s (${threat.missM.toFixed(1)} m apart).`;
  }

  return (
    <View style={styles.flex}>
      {fix ? (
        <MapView
          style={styles.flex}
          initialRegion={{ latitude: fix.lat, longitude: fix.lon, latitudeDelta: 0.003, longitudeDelta: 0.003 }}
        >
          <Marker coordinate={{ latitude: fix.lat, longitude: fix.lon }} title="You">
            <View style={[styles.dot, { backgroundColor: '#1565c0' }]} />
          </Marker>
          {peers.map((p) => (
            <Marker key={p.id} coordinate={{ latitude: p.lat, longitude: p.lon }} title={`${p.id} (${p.role})`}>
              <View style={[styles.dot, { backgroundColor: LEVEL_COLOR[p.level] }]} />
            </Marker>
          ))}
        </MapView>
      ) : (
        <View style={[styles.flex, styles.center]}>
          <Text style={styles.big}>{permError || 'Waiting for GPS fix...'}</Text>
        </View>
      )}

      {level !== 'NONE' && (
        <View style={[styles.banner, { backgroundColor: LEVEL_COLOR[level] }]}>
          <Text style={styles.bannerTitle}>{LEVEL_TITLE[level]}  ({level})</Text>
          {bannerText ? <Text style={styles.bannerText}>{bannerText}</Text> : null}
        </View>
      )}

      <View style={styles.hud}>
        <Text style={styles.hudLine}>
          You: {deviceId} ({role})   Server: {conn}
        </Text>
        <Text style={styles.hudLine}>
          GPS: ±{fmt(fix && fix.accuracy, 0)} m   speed {fmt(fix && fix.speed, 1)} m/s   heading {fmt(fix && fix.heading, 0)}°
        </Text>
        <Text style={styles.hudLine}>
          Peers in range: {peers.length}   Level: {level}   Last server msg: {statusAgeS === null ? 'none yet' : statusAgeS.toFixed(0) + ' s ago'}
        </Text>
        {threat ? (
          <Text style={styles.hudLine}>
            Top threat {threat.peerId}: risk {threat.risk}  TCPA {fmt(threat.tcpaS, 1)} s  miss {fmt(threat.missM, 1)} m  closing {fmt(threat.closingMps, 1)} m/s
          </Text>
        ) : null}
        {serverError ? <Text style={[styles.hudLine, { color: '#ff8a80' }]}>Server: {serverError}</Text> : null}
        {status && status.stale ? <Text style={[styles.hudLine, { color: '#ffd180' }]}>Server says your data is stale</Text> : null}
        <TouchableOpacity style={styles.stopBtn} onPress={onStop}>
          <Text style={styles.stopTxt}>Stop</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const mono = Platform.OS === 'ios' ? 'Menlo' : 'monospace';

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center', padding: 24 },
  big: { fontSize: 18, textAlign: 'center' },
  setup: { flexGrow: 1, justifyContent: 'center', padding: 24, paddingTop: 80, backgroundColor: '#fff' },
  title: { fontSize: 32, fontWeight: '700', marginBottom: 24 },
  label: { fontSize: 14, fontWeight: '600', marginTop: 16, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#999', borderRadius: 8, padding: 12, fontSize: 18 },
  row: { flexDirection: 'row' },
  roleBtn: { flex: 1, borderWidth: 1, borderColor: '#999', borderRadius: 8, paddingVertical: 12, marginRight: 8, alignItems: 'center' },
  roleBtnOn: { backgroundColor: '#1565c0', borderColor: '#1565c0' },
  roleTxt: { fontSize: 15, color: '#222' },
  roleTxtOn: { color: '#fff', fontWeight: '700' },
  startBtn: { backgroundColor: '#2e7d32', borderRadius: 8, paddingVertical: 16, alignItems: 'center', marginTop: 28 },
  startTxt: { color: '#fff', fontSize: 20, fontWeight: '700' },
  hint: { color: '#666', fontSize: 13, marginTop: 14 },
  dot: { width: 22, height: 22, borderRadius: 11, borderWidth: 3, borderColor: '#fff' },
  banner: { position: 'absolute', top: 0, left: 0, right: 0, paddingTop: 56, paddingBottom: 14, paddingHorizontal: 16 },
  bannerTitle: { color: '#fff', fontSize: 26, fontWeight: '800' },
  bannerText: { color: '#fff', fontSize: 16, marginTop: 4 },
  hud: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.78)', padding: 12, paddingBottom: 28 },
  hudLine: { color: '#fff', fontSize: 12, fontFamily: mono, marginBottom: 3 },
  stopBtn: { alignSelf: 'flex-end', marginTop: 6, paddingVertical: 6, paddingHorizontal: 18, borderRadius: 6, backgroundColor: '#b71c1c' },
  stopTxt: { color: '#fff', fontWeight: '700' },
});
