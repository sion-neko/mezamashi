import { useCallback, useEffect, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  Alert,
  AppState,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Notifications from 'expo-notifications';
import {
  Alarm,
  AlarmPhase,
  clearAlarm,
  computeNextFire,
  formatTime,
  getPhase,
  loadAlarm,
  requestPermission,
  saveAlarm,
  scheduleBurst,
  stopRinging,
} from './src/alarm';

// アプリを開いたまま鳴った場合もバナー＋音を出す
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function defaultPickerValue(): Date {
  const d = new Date();
  d.setHours(7, 0, 0, 0);
  return d;
}

export default function App() {
  const [alarm, setAlarm] = useState<Alarm | null>(null);
  const [phase, setPhase] = useState<AlarmPhase>('idle');
  const [pickerValue, setPickerValue] = useState<Date>(defaultPickerValue);
  const [repeatDaily, setRepeatDaily] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [now, setNow] = useState(new Date());
  const alarmRef = useRef<Alarm | null>(null);
  alarmRef.current = alarm;

  // 状態遷移の一元処理。expired（鳴り終わって放置）はここで畳む
  const reconcile = useCallback(async (a: Alarm | null) => {
    const p = getPhase(a);
    if (p === 'expired' && a) {
      if (a.repeatDaily) {
        const next = computeNextFire(a.hour, a.minute);
        const updated: Alarm = { ...a, nextFire: next.toISOString() };
        await scheduleBurst(next, a.hour, a.minute);
        await saveAlarm(updated);
        setAlarm(updated);
        setPhase('armed');
      } else {
        await clearAlarm();
        await Notifications.cancelAllScheduledNotificationsAsync();
        setAlarm(null);
        setPhase('idle');
      }
      return;
    }
    setAlarm(a);
    setPhase(p);
  }, []);

  // 起動時に保存済みアラームを復元
  useEffect(() => {
    (async () => {
      const saved = await loadAlarm();
      if (saved) {
        const d = new Date();
        d.setHours(saved.hour, saved.minute, 0, 0);
        setPickerValue(d);
        setRepeatDaily(saved.repeatDaily);
      }
      await reconcile(saved);
      setLoaded(true);
    })();
  }, [reconcile]);

  // フォアグラウンド復帰時に状態を再評価
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void reconcile(alarmRef.current);
      }
    });
    return () => sub.remove();
  }, [reconcile]);

  // 毎秒tick：armed→ringingへの遷移とカウントダウン表示のため
  useEffect(() => {
    const id = setInterval(() => {
      const current = new Date();
      setNow(current);
      const p = getPhase(alarmRef.current, current);
      setPhase((prev) => (prev === p ? prev : p));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const handleSet = async () => {
    const ok = await requestPermission();
    if (!ok) {
      Alert.alert(
        '通知が許可されていません',
        '設定アプリからこのアプリの通知を許可してください。通知なしではアラームが鳴りません。'
      );
      return;
    }
    const hour = pickerValue.getHours();
    const minute = pickerValue.getMinutes();
    const fire = computeNextFire(hour, minute);
    const next: Alarm = {
      hour,
      minute,
      repeatDaily,
      nextFire: fire.toISOString(),
    };
    await scheduleBurst(fire, hour, minute);
    await saveAlarm(next);
    setAlarm(next);
    setPhase('armed');
  };

  const handleDisarm = async () => {
    await Notifications.cancelAllScheduledNotificationsAsync();
    await clearAlarm();
    setAlarm(null);
    setPhase('idle');
  };

  const handleStop = async () => {
    await stopRinging();
    const a = alarmRef.current;
    if (a && a.repeatDaily) {
      const next = computeNextFire(a.hour, a.minute);
      const updated: Alarm = { ...a, nextFire: next.toISOString() };
      await scheduleBurst(next, a.hour, a.minute);
      await saveAlarm(updated);
      setAlarm(updated);
      setPhase('armed');
    } else {
      await clearAlarm();
      setAlarm(null);
      setPhase('idle');
    }
  };

  if (!loaded) {
    return <View style={styles.container} />;
  }

  if (phase === 'ringing') {
    return (
      <View style={[styles.container, styles.ringing]}>
        <StatusBar style="light" />
        <Text style={styles.ringingEmoji}>⏰</Text>
        <Text style={styles.ringingTime}>
          {alarm ? formatTime(alarm.hour, alarm.minute) : ''}
        </Text>
        <Pressable style={styles.stopButton} onPress={handleStop}>
          <Text style={styles.stopButtonText}>止める</Text>
        </Pressable>
      </View>
    );
  }

  if (phase === 'armed' && alarm) {
    const remainMs = new Date(alarm.nextFire).getTime() - now.getTime();
    const remainH = Math.floor(remainMs / 3600000);
    const remainM = Math.ceil((remainMs % 3600000) / 60000);
    return (
      <View style={styles.container}>
        <StatusBar style="light" />
        <Text style={styles.armedLabel}>
          {alarm.repeatDaily ? '毎日' : '1回だけ'}
        </Text>
        <Text style={styles.armedTime}>{formatTime(alarm.hour, alarm.minute)}</Text>
        <Text style={styles.countdown}>
          あと {remainH > 0 ? `${remainH}時間` : ''}
          {remainM}分
        </Text>
        <Pressable style={styles.disarmButton} onPress={handleDisarm}>
          <Text style={styles.disarmButtonText}>解除</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <Text style={styles.title}>目覚まし</Text>
      <DateTimePicker
        value={pickerValue}
        mode="time"
        display="spinner"
        themeVariant="dark"
        onChange={(_, date) => {
          if (date) setPickerValue(date);
        }}
      />
      <View style={styles.repeatRow}>
        <Text style={styles.repeatLabel}>毎日繰り返す</Text>
        <Switch value={repeatDaily} onValueChange={setRepeatDaily} />
      </View>
      <Pressable style={styles.setButton} onPress={handleSet}>
        <Text style={styles.setButtonText}>セット</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
    padding: 24,
  },
  title: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '600',
  },
  repeatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  repeatLabel: {
    color: '#ccc',
    fontSize: 16,
  },
  setButton: {
    backgroundColor: '#2e7d32',
    paddingVertical: 16,
    paddingHorizontal: 64,
    borderRadius: 32,
  },
  setButtonText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  armedLabel: {
    color: '#888',
    fontSize: 18,
  },
  armedTime: {
    color: '#fff',
    fontSize: 72,
    fontWeight: '200',
    fontVariant: ['tabular-nums'],
  },
  countdown: {
    color: '#aaa',
    fontSize: 18,
  },
  disarmButton: {
    borderColor: '#c62828',
    borderWidth: 2,
    paddingVertical: 14,
    paddingHorizontal: 56,
    borderRadius: 32,
    marginTop: 16,
  },
  disarmButtonText: {
    color: '#ef5350',
    fontSize: 18,
    fontWeight: '600',
  },
  ringing: {
    backgroundColor: '#b71c1c',
  },
  ringingEmoji: {
    fontSize: 96,
  },
  ringingTime: {
    color: '#fff',
    fontSize: 56,
    fontWeight: '300',
    fontVariant: ['tabular-nums'],
  },
  stopButton: {
    backgroundColor: '#fff',
    paddingVertical: 20,
    paddingHorizontal: 80,
    borderRadius: 40,
    marginTop: 24,
  },
  stopButtonText: {
    color: '#b71c1c',
    fontSize: 24,
    fontWeight: '800',
  },
});
