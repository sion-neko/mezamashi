import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

// iOSのローカル通知は同時予約64件が上限のため、60件に抑える
export const BURST_COUNT = 60;
export const BURST_INTERVAL_MS = 2000;
export const BURST_DURATION_MS = BURST_COUNT * BURST_INTERVAL_MS;

const STORAGE_KEY = 'alarm';
const ALARM_SOUND = 'alarm-alert.wav';
const ANDROID_CHANNEL_ID = 'alarm';

export type Alarm = {
  hour: number;
  minute: number;
  repeatDaily: boolean;
  /** 次に鳴る時刻 (ISO文字列) */
  nextFire: string;
};

export type AlarmPhase = 'idle' | 'armed' | 'ringing' | 'expired';

export async function loadAlarm(): Promise<Alarm | null> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  return raw ? (JSON.parse(raw) as Alarm) : null;
}

export async function saveAlarm(alarm: Alarm): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(alarm));
}

export async function clearAlarm(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}

/** 現在時刻から見て次に hour:minute が来る日時を返す */
export function computeNextFire(hour: number, minute: number, from = new Date()): Date {
  const d = new Date(from);
  d.setHours(hour, minute, 0, 0);
  if (d.getTime() <= from.getTime()) {
    d.setDate(d.getDate() + 1);
  }
  return d;
}

export function formatTime(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function getPhase(alarm: Alarm | null, now = new Date()): AlarmPhase {
  if (!alarm) return 'idle';
  const fire = new Date(alarm.nextFire).getTime();
  if (now.getTime() < fire) return 'armed';
  if (now.getTime() < fire + BURST_DURATION_MS) return 'ringing';
  return 'expired';
}

/** Android 8+ ではチャンネル単位でしか通知音を指定できないため、事前に用意しておく */
async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: '目覚ましアラーム',
    importance: Notifications.AndroidImportance.MAX,
    sound: ALARM_SOUND,
  });
}

/** 既存予約をすべて消してから、fire時刻を起点に2秒間隔のバーストを予約する */
export async function scheduleBurst(fire: Date, hour: number, minute: number): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
  await ensureAndroidChannel();
  const label = formatTime(hour, minute);
  for (let i = 0; i < BURST_COUNT; i++) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '⏰ 起きる時間です',
        body: `${label} のアラーム — アプリを開いて止めてください`,
        sound: ALARM_SOUND,
        ...(Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL_ID } : {}),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(fire.getTime() + i * BURST_INTERVAL_MS),
      },
    });
  }
}

/** 鳴動中の停止：残りの予約を消し、通知センターからも消す */
export async function stopRinging(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
  await Notifications.dismissAllNotificationsAsync();
}

export async function requestPermission(): Promise<boolean> {
  const existing = await Notifications.getPermissionsAsync();
  if (existing.granted) return true;
  const result = await Notifications.requestPermissionsAsync();
  return result.granted;
}
