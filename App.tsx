import { useCallback, useEffect, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  Alert,
  Animated,
  AppState,
  Easing,
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
import { colors, radius, softShadow } from './src/theme';

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

/** 背景の装飾：右上に朝の光、下にセージ色の毛布のような膨らみ。操作は透過させる */
function Backdrop() {
  return (
    <View style={styles.backdrop} pointerEvents="none">
      <View style={styles.glowOuter} />
      <View style={styles.glowInner} />
      <View style={styles.hillBack} />
      <View style={styles.hillFront} />
    </View>
  );
}

/** 鳴動画面の朝日。ゆっくり呼吸するように拡縮させる */
function SunMark() {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1600,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1600,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] });
  const haloScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.22] });

  return (
    <View style={styles.sunWrap} pointerEvents="none">
      <Animated.View style={[styles.sunHalo, { transform: [{ scale: haloScale }] }]} />
      <Animated.View style={[styles.sunRing, { transform: [{ scale }] }]} />
      <View style={styles.sunCore} />
    </View>
  );
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
    return <View style={styles.screen} />;
  }

  if (phase === 'ringing') {
    return (
      <View style={[styles.screen, styles.ringingScreen]}>
        <StatusBar style="dark" />
        <View style={styles.backdrop} pointerEvents="none">
          <View style={styles.sunriseHill} />
        </View>
        <SunMark />
        <Text style={styles.ringingLabel}>起きる時間です</Text>
        <Text style={styles.ringingTime}>
          {alarm ? formatTime(alarm.hour, alarm.minute) : ''}
        </Text>
        <Pressable
          style={({ pressed }) => [styles.stopButton, pressed && styles.pressed]}
          onPress={handleStop}
        >
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
      <View style={styles.screen}>
        <Backdrop />
        <StatusBar style="dark" />
        <View style={styles.card}>
          <View style={styles.chip}>
            <Text style={styles.chipText}>
              {alarm.repeatDaily ? '毎日' : '1回だけ'}
            </Text>
          </View>
          <Text style={styles.armedTime}>{formatTime(alarm.hour, alarm.minute)}</Text>
          <Text style={styles.countdown}>
            あと {remainH > 0 ? `${remainH}時間` : ''}
            {remainM}分
          </Text>
        </View>
        <Pressable
          style={({ pressed }) => [styles.disarmButton, pressed && styles.pressed]}
          onPress={handleDisarm}
        >
          <Text style={styles.disarmButtonText}>解除</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Backdrop />
      <StatusBar style="dark" />
      <View style={styles.header}>
        <Text style={styles.title}>目覚まし</Text>
        <Text style={styles.subtitle}>何時に起こしましょうか</Text>
      </View>
      <View style={styles.card}>
        <DateTimePicker
          value={pickerValue}
          mode="time"
          display="spinner"
          themeVariant="light"
          textColor={colors.ink}
          accentColor={colors.sageDeep}
          onChange={(_, date) => {
            if (date) setPickerValue(date);
          }}
        />
        <View style={styles.divider} />
        <View style={styles.repeatRow}>
          <Text style={styles.repeatLabel}>毎日繰り返す</Text>
          <Switch
            value={repeatDaily}
            onValueChange={setRepeatDaily}
            trackColor={{ false: colors.switchOff, true: colors.sage }}
            thumbColor={colors.card}
            ios_backgroundColor={colors.switchOff}
          />
        </View>
      </View>
      <Pressable
        style={({ pressed }) => [styles.setButton, pressed && styles.pressed]}
        onPress={handleSet}
      >
        <Text style={styles.setButtonText}>セット</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.cream,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 28,
    padding: 24,
    // 背景装飾を画面外にはみ出させずに切り取る
    overflow: 'hidden',
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },

  // --- 背景装飾 ---
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  glowOuter: {
    position: 'absolute',
    top: -160,
    right: -120,
    width: 380,
    height: 380,
    borderRadius: 190,
    backgroundColor: colors.creamDeep,
    opacity: 0.55,
  },
  glowInner: {
    position: 'absolute',
    top: -110,
    right: -40,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: colors.creamDeep,
    opacity: 0.6,
  },
  hillBack: {
    position: 'absolute',
    left: -80,
    right: -80,
    bottom: -140,
    height: 300,
    borderRadius: 220,
    backgroundColor: colors.sagePale,
    opacity: 0.7,
  },
  hillFront: {
    position: 'absolute',
    left: -60,
    right: -60,
    bottom: -190,
    height: 300,
    borderRadius: 200,
    backgroundColor: colors.sagePale,
  },

  // --- 見出し ---
  header: {
    alignItems: 'center',
    gap: 6,
  },
  title: {
    color: colors.ink,
    fontSize: 30,
    fontWeight: '600',
    letterSpacing: 2,
  },
  subtitle: {
    color: colors.inkSoft,
    fontSize: 14,
    letterSpacing: 1,
  },

  // --- カード ---
  card: {
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingVertical: 20,
    paddingHorizontal: 20,
    gap: 8,
    ...softShadow,
  },
  divider: {
    alignSelf: 'stretch',
    height: 1,
    backgroundColor: colors.cardBorder,
    marginTop: 4,
  },
  repeatRow: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 6,
  },
  repeatLabel: {
    color: colors.ink,
    fontSize: 16,
  },

  // --- セットボタン ---
  setButton: {
    backgroundColor: colors.sageDeep,
    paddingVertical: 18,
    paddingHorizontal: 72,
    borderRadius: radius.pill,
    ...softShadow,
    shadowColor: colors.sageDeep,
    shadowOpacity: 0.3,
  },
  setButtonText: {
    color: colors.card,
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 2,
  },

  // --- セット済み画面 ---
  chip: {
    backgroundColor: colors.sagePale,
    borderRadius: radius.pill,
    paddingVertical: 6,
    paddingHorizontal: 18,
  },
  chipText: {
    color: colors.sageDeep,
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 1,
  },
  armedTime: {
    color: colors.ink,
    fontSize: 76,
    fontWeight: '200',
    letterSpacing: 2,
    fontVariant: ['tabular-nums'],
  },
  countdown: {
    color: colors.inkSoft,
    fontSize: 16,
    letterSpacing: 1,
  },
  disarmButton: {
    borderColor: colors.clay,
    borderWidth: 1.5,
    paddingVertical: 14,
    paddingHorizontal: 52,
    borderRadius: radius.pill,
  },
  disarmButtonText: {
    color: colors.clay,
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: 2,
  },

  // --- 鳴動画面 ---
  ringingScreen: {
    backgroundColor: colors.sunrise,
  },
  sunriseHill: {
    position: 'absolute',
    left: -60,
    right: -60,
    bottom: -190,
    height: 300,
    borderRadius: 200,
    backgroundColor: colors.sunriseCore,
    opacity: 0.22,
  },
  sunWrap: {
    width: 200,
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sunHalo: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: colors.sunriseCore,
    opacity: 0.25,
  },
  sunRing: {
    position: 'absolute',
    width: 148,
    height: 148,
    borderRadius: 74,
    backgroundColor: colors.sunriseCore,
    opacity: 0.45,
  },
  sunCore: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.sunriseCore,
  },
  ringingLabel: {
    color: colors.sunriseInk,
    fontSize: 18,
    letterSpacing: 3,
    opacity: 0.8,
  },
  ringingTime: {
    color: colors.sunriseInk,
    fontSize: 64,
    fontWeight: '300',
    letterSpacing: 2,
    fontVariant: ['tabular-nums'],
  },
  stopButton: {
    backgroundColor: colors.card,
    paddingVertical: 20,
    paddingHorizontal: 72,
    borderRadius: radius.pill,
    ...softShadow,
    shadowColor: '#8A4A18',
    shadowOpacity: 0.25,
  },
  stopButtonText: {
    color: colors.sunriseDeep,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 3,
  },
});
