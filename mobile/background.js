import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import * as SecureStore from 'expo-secure-store';
import * as Notifications from 'expo-notifications';
import { AppState, Platform } from 'react-native';
import { exchange, notificationDecision } from './backgroundTransport';
const TASK='safety-location-v1',KEY='safety-background-session',LAST='safety-last-alert',FAIL='safety-last-failure';
let busy=false,operation=0;
TaskManager.defineTask(TASK,async({data,error})=>{
 if(busy||AppState.currentState==='active')return;
 busy=true;
 try{
  const raw=await SecureStore.getItemAsync(KEY);if(!raw)return;
  const session=JSON.parse(raw);if(Date.now()>session.expiresAt){await stopBackground();return;}
  if(error)throw error;
  const loc=data?.locations?.at(-1);if(!loc)return;
  const c=loc.coords;
  const status=await exchange(WebSocket,session,{lat:c.latitude,lon:c.longitude,speed:c.speed>=0?c.speed:null,heading:c.heading>=0?c.heading:null,accuracy:c.accuracy>=0?c.accuracy:null,fixAgeMs:Math.max(0,Date.now()-loc.timestamp)});
  const lastRaw=await SecureStore.getItemAsync(LAST),last=lastRaw?JSON.parse(lastRaw):null;
  if(await SecureStore.getItemAsync(KEY)!==raw)return; // Stop/replacement cancels pending notifications.
  if(notificationDecision(status,last,Date.now())){
   await Notifications.scheduleNotificationAsync({content:{title:status.level==='CRITICAL'?'Danger nearby':'Collision warning',body:'A nearby participant may cross your path. Check your surroundings.',sound:'default'},trigger:null});
   await SecureStore.setItemAsync(LAST,JSON.stringify({level:status.level,at:Date.now()}));
  }
 }catch(error){
  // A failed callback never pretends coverage is available; avoid repeated failure notifications.
  const raw=await SecureStore.getItemAsync(KEY),lastFailure=Number(await SecureStore.getItemAsync(FAIL)||0);if(raw&&Date.now()-lastFailure>60000){await SecureStore.setItemAsync(FAIL,String(Date.now()));await Notifications.scheduleNotificationAsync({content:{title:'Safety alerts unavailable',body:'Open Safety Alert to check location and connection.'},trigger:null}).catch(()=>{});}
 }finally{busy=false;}
});
export async function startBackground(session){
 const request=++operation;
 if(!session.deviceSecret)throw Error('Wait for the server connection before enabling background tracking.');
 if(!(await Location.requestBackgroundPermissionsAsync()).granted)throw Error('Background location permission is required.');
 if(!(await Notifications.requestPermissionsAsync()).granted)throw Error('Notification permission is required.');
 if(Platform.OS==='android')await Notifications.setNotificationChannelAsync('default',{name:'Safety warnings',importance:Notifications.AndroidImportance.HIGH,sound:'default'});
 if(request!==operation)throw Error('Background tracking request cancelled.');
 await SecureStore.setItemAsync(KEY,JSON.stringify({...session,expiresAt:Date.now()+12*3600000}));
 if(request!==operation){await SecureStore.deleteItemAsync(KEY);throw Error('Background tracking request cancelled.');}
 try{await Location.startLocationUpdatesAsync(TASK,{accuracy:Location.Accuracy.BestForNavigation,timeInterval:1000,distanceInterval:0,pausesUpdatesAutomatically:false,showsBackgroundLocationIndicator:true,foregroundService:{notificationTitle:'Safety Alert is tracking',notificationBody:'Location sharing active. Open the app and tap Stop to end.',killServiceOnDestroy:true}});if(request!==operation)await stopBackground();}catch(error){await SecureStore.deleteItemAsync(KEY);throw error;}
}
export async function stopBackground(endSession=true){operation++;const raw=await SecureStore.getItemAsync(KEY);await SecureStore.deleteItemAsync(KEY);await SecureStore.deleteItemAsync(LAST);await Notifications.cancelAllScheduledNotificationsAsync();if(await Location.hasStartedLocationUpdatesAsync(TASK))await Location.stopLocationUpdatesAsync(TASK);if(raw&&endSession)await exchange(WebSocket,JSON.parse(raw),{type:'stop'}).catch(()=>{});}
