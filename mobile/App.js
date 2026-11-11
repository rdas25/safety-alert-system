import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Platform, Alert, AppState,
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { serverUrl } from './serverUrl';
import { DEFAULT_SERVER } from './config';
import { startBackground, stopBackground } from './background';

const ROLES = ['pedestrian', 'cyclist', 'driver'];
const RANK = { NONE: 0, LOW: 1, MODERATE: 2, HIGH: 3, CRITICAL: 4 };
const LEVEL_COLOR = { NONE: '#2e7d32', LOW: '#f9a825', MODERATE: '#ef6c00', HIGH: '#d32f2f', CRITICAL: '#7f0000' };
const LEVEL_TITLE = { LOW: 'Heads up', MODERATE: 'Caution', HIGH: 'WARNING', CRITICAL: 'DANGER' };
const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

const compass = (deg) => COMPASS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const fmt = (v, n) => (v === null || v === undefined ? 'n/a' : Number(v).toFixed(n));

// New ephemeral identity for each setup session; the server enforces ownership.
const makeDeviceId = () => 'dev-' + Math.random().toString(36).slice(2, 8);

export default function App() {
  const [ready,setReady]=useState(false);
  useEffect(()=>{stopBackground().catch(()=>{}).finally(()=>setReady(true));},[]);
  const [session, setSession] = useState(null); // { server, role, deviceId }
  if(!ready)return <View style={styles.center}><Text>Preparing tracking…</Text></View>;
  if (!session) return <Setup onStart={setSession} />;
  return <Tracker {...session} onStop={() => setSession(null)} />;
}

// ---------------------------------------------------------------- setup screen
function Setup({ onStart }) {
  const [server, setServer] = useState(DEFAULT_SERVER);
  const [sessionToken, setSessionToken] = useState('');
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
      <Text style={styles.label}>Session access token</Text>
      <TextInput style={styles.input} value={sessionToken} onChangeText={setSessionToken} secureTextEntry autoCapitalize="none" autoCorrect={false} />
      <Text style={styles.label}>I am a...</Text>
      <View style={styles.row}>
        {ROLES.map((r) => (
          <TouchableOpacity key={r} style={[styles.roleBtn, role === r && styles.roleBtnOn]} onPress={() => setRole(r)}>
            <Text style={[styles.roleTxt, role === r && styles.roleTxtOn]}>{cap(r)}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={styles.hint}>Starting shares your location with participants in your test session and the administrator. Optional recordings contain location data. Stop ends tracking.</Text>
      <Text style={styles.hint}>This phone's ID: {deviceId}</Text>
      <TouchableOpacity
        style={styles.startBtn}
        onPress={() => { try { sessionToken.trim() ? onStart({ server: serverUrl(server), role, deviceId, sessionToken: sessionToken.trim() }) : Alert.alert('Session access', 'Enter the session access token'); } catch (e) { Alert.alert('Server address', e.message); } }}
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
function Tracker({ server, role, deviceId, sessionToken, onStop }) {
  const [keepScreenOn,setKeepScreenOn]=useState(false);
  useEffect(()=>{if(keepScreenOn)activateKeepAwakeAsync('tracking').catch(()=>{});return ()=>{deactivateKeepAwake('tracking');};},[keepScreenOn]);
  const [appState,setAppState]=useState(AppState.currentState);
  const [backgroundEnabled,setBackgroundEnabled]=useState(false);
  useEffect(()=>{const sub=AppState.addEventListener('change',setAppState);return ()=>sub.remove();},[]);
  const [conn, setConn] = useState('connecting');
  const [fix, setFix] = useState(null);
  const [status, setStatus] = useState(null);
  const [serverError, setServerError] = useState(null);
  const [permError, setPermError] = useState(null);
  const [now, setNow] = useState(Date.now());

  const wsRef = useRef(null);
  const deviceSecretRef = useRef(null);
  const fixRef = useRef(null);
  const sequenceRef = useRef(0);
  const [gpsAttempt,setGpsAttempt]=useState(0);

  // 1 Hz ticker so "message age" updates on screen
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // WebSocket with automatic reconnect
  useEffect(() => {
    if(appState!=='active') {setConn('background');return;}
    let closed = false;
    let retryTimer = null;
    let attempt = 0;
    const url = /^wss?:\/\//.test(server) ? server : 'ws://' + server;

    const connect = () => {
      if (closed) return;
      setConn(attempt === 0 ? 'connecting' : 'reconnecting');
      const ws = new WebSocket(url);
      wsRef.current = ws;
      ws.onopen = () => { attempt = 0; setConn('authenticating'); setServerError(null); ws.send(JSON.stringify({type:'authenticate',sessionToken})); };
      ws.onmessage = (e) => {
        let m;
        try { m = JSON.parse(e.data); } catch (err) { return; }
        if (m.type === 'authenticated') setConn('connected');
        if (m.type === 'credential' && !deviceSecretRef.current) deviceSecretRef.current = m.deviceSecret;
        if (m.type === 'status') setStatus({ ...m, receivedAt: Date.now() });
        else if (m.type === 'error') setServerError(m.message);
      };
      ws.onerror = () => {};
      ws.onclose = (event) => {
        if(event.code===1008){setConn('denied');return;}
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
  }, [server,sessionToken,appState]);

  // GPS
  useEffect(() => {
    if(appState!=='active')return;
    let sub = null;
    let cancelled = false;
    (async () => {
      try {
      setPermError(null);
      if(!await Location.hasServicesEnabledAsync()) throw Error('Location services are disabled. Enable them and retry.');
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') {
        setPermError('Location permission denied. Enable it in Settings > Privacy > Location Services.');
        return;
      }
      if(cancelled)return;
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 0 },
        (loc) => {
          if(cancelled || (fixRef.current && loc.timestamp<=fixRef.current.fixTime))return;
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
      } catch(error) { if(!cancelled){fixRef.current=null;setFix(null);setPermError(error.message || 'Unable to start GPS. Retry.');} }
    })();
    return () => { cancelled = true; if (sub) sub.remove(); };
  }, [gpsAttempt,appState]);

  // Send the latest fix once per second (also when standing still, so the server knows we are alive)
  useEffect(() => {
    const id = setInterval(() => {
      const f = fixRef.current;
      const ws = wsRef.current;
      if (!f || !deviceSecretRef.current || !ws || ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({
        type: 'position', sequence:(sequenceRef.current=Math.max(Date.now(),sequenceRef.current+1)), sessionToken, deviceSecret: deviceSecretRef.current,
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
  }, [deviceId, role, sessionToken]);

  // Repeat only while the server is connected and its warning is fresh.
  const activeWarning = conn === 'connected' && status && status.coverage === 'available' && !status.stale && now - status.receivedAt < 5000 ? status.level : 'NONE';
  useEffect(() => {
    if (!['HIGH', 'CRITICAL'].includes(activeWarning)) return;
    const pulse = () => Haptics.notificationAsync(activeWarning === 'CRITICAL' ? Haptics.NotificationFeedbackType.Error : Haptics.NotificationFeedbackType.Warning).catch(() => {});
    pulse();
    const timer = setInterval(pulse, activeWarning === 'CRITICAL' ? 700 : 1400);
    return () => clearInterval(timer);
  }, [activeWarning]);

  const statusFresh = conn === 'connected' && status && status.coverage === 'available' && !status.stale && now - status.receivedAt < 5000;
  const level = statusFresh ? status.level : 'NONE';
  const threat = statusFresh ? status.threat : null;
  const peers = statusFresh ? status.peers : [];
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
        <TouchableOpacity onPress={()=>setKeepScreenOn(v=>!v)}><Text style={styles.hudLine}>Keep screen on: {keepScreenOn?'Yes':'No'} — tap to change</Text></TouchableOpacity>
        {status?.recordingEnabled ? <Text style={styles.hudLine}>This session is being recorded by the administrator.</Text>:null}
        {status?.roadContext ? <Text style={styles.hudLine}>Near {status.roadContext.name} (map context only)</Text>:null}
        {permError ? <TouchableOpacity onPress={()=>setGpsAttempt(v=>v+1)}><Text style={styles.hudLine}>GPS: {permError} Tap to retry.</Text></TouchableOpacity>:null}
        {status && status.coverage !== 'available' ? <Text style={styles.hudLine}>Assessment unavailable: {status.coverage}</Text>:null}
        {status && (status.unavailablePeers>0 || status.excludedPeers>0) ? <Text style={styles.hudLine}>Incomplete coverage: {status.unavailablePeers} unavailable, {status.excludedPeers} excluded peers</Text>:null}
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
        {!statusFresh ? <Text style={[styles.hudLine, { color: '#ffd180' }]}>Waiting for fresh server data; alerts unavailable</Text> : null}
        {status && status.stale ? <Text style={[styles.hudLine, { color: '#ffd180' }]}>Server says your data is stale</Text> : null}
        <TouchableOpacity style={styles.stopBtn} onPress={async()=>{
          try{if(backgroundEnabled){await stopBackground(false);setBackgroundEnabled(false);}else{await startBackground({server,role,deviceId,sessionToken,deviceSecret:deviceSecretRef.current});setBackgroundEnabled(true);}}catch(error){Alert.alert('Background tracking',error.message);}
        }}><Text style={styles.stopTxt}>{backgroundEnabled?'Disable background tracking':'Enable background tracking (12 hours)'}</Text></TouchableOpacity>
        <Text style={styles.hudLine}>Only participating phones are detected. Background delivery depends on your phone and network.</Text>
        <TouchableOpacity style={styles.stopBtn} onPress={async()=>{await stopBackground().catch(()=>{});if(wsRef.current?.readyState===WebSocket.OPEN)wsRef.current.send(JSON.stringify({type:'stop',sessionToken,deviceId,deviceSecret:deviceSecretRef.current}));onStop();}}>

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
