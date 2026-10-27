import { useCallback, useEffect, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  Alert,
  Animated,
  AppState,
  Easing,
  Linking,
  Pressable,
  StyleSheet,
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
  getPermissionStatus,
  getPhase,
  hideSilentNotice,
  isSilentNoticeHidden,
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

/** 夜空の装飾：右上に三日月、まわりに小さな星。操作は透過させる */
const STARS = [
  { top: 140, left: 48, size: 4 },
  { top: 92, left: 150, size: 2 },
  { top: 210, right: 70, size: 2 },
  { top: 60, right: 170, size: 4 },
  { top: 250, left: 110, size: 2 },
];

function NightSky() {
  return (
    <View style={styles.backdrop} pointerEvents="none">
      {/* 月の円に夜空色の円を少しずらして重ね、三日月に欠けさせる */}
      <View style={styles.moon}>
        <View style={styles.moonDisc} />
        <View style={styles.moonShadow} />
      </View>
      {STARS.map((st, i) => (
        <View
          key={i}
          style={[
            styles.star,
            { top: st.top, left: st.left, right: st.right, width: st.size, height: st.size },
          ]}
        />
      ))}
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

/**
 * 通知が許可されていないときだけ出す案内。通知は必須ではないので、
 * 「使えない」ではなく「アプリを開いている間だけ鳴る」ことを伝える。
 */
function NotifyWarning({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.warning, pressed && styles.pressed]}
      onPress={onPress}
    >
      <Text style={styles.warningTitle}>通知がオフです</Text>
      <Text style={styles.warningBody}>アプリを閉じていると鳴りません（タップで設定）</Text>
    </Pressable>
  );
}

export default function App() {
  const [alarm, setAlarm] = useState<Alarm | null>(null);
  const [phase, setPhase] = useState<AlarmPhase>('idle');
  const [pickerValue, setPickerValue] = useState<Date>(defaultPickerValue);
  const [repeatDaily, setRepeatDaily] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [now, setNow] = useState(new Date());
  // 判定前は警告を出さない（起動直後に一瞬だけ出るのを避ける）
  const [notifyGranted, setNotifyGranted] = useState(true);
  const alarmRef = useRef<Alarm | null>(null);
  alarmRef.current = alarm;
  // 直前の許可状態。再予約が必要な「オフ→オン」の変化を見るために持つ
  const grantedRef = useRef(true);

  const refreshPermission = useCallback(async () => {
    const status = await getPermissionStatus();
    // 通知オフのままセットされたアラームは予約が空なので、
    // 後から許可が下りたタイミング（設定アプリから戻る等）で取り直す
    const a = alarmRef.current;
    if (!grantedRef.current && status.granted && a && getPhase(a) === 'armed') {
      await scheduleBurst(new Date(a.nextFire), a.hour, a.minute);
    }
    grantedRef.current = status.granted;
    setNotifyGranted(status.granted);
    return status;
  }, []);

  /**
   * セット時に一度だけOSの許可を聞く。断られてもアラームのセットは止めない
   * （通知はあくまで「アプリを閉じていても鳴らす」ための任意の機能）。
   */
  const askPermissionOnce = useCallback(async (): Promise<boolean> => {
    const status = await refreshPermission();
    if (status.granted) return true;
    if (!status.canAskAgain) return false;
    await requestPermission();
    return (await refreshPermission()).granted;
  }, [refreshPermission]);

  /**
   * 警告バナーをユーザーが自分でタップしたときだけ呼ぶ。
   * ダイアログを出せる状態なら出し、一度拒否済みで出せない場合のみ設定アプリへ案内する。
   */
  const enableNotification = useCallback(async () => {
    const status = await refreshPermission();
    if (status.granted) return;
    if (status.canAskAgain) {
      await requestPermission();
      await refreshPermission();
      return;
    }
    Alert.alert(
      '通知をオンにしますか？',
      'オンにすると、アプリを閉じていても鳴ります。設定アプリから変えられます。',
      [
        { text: 'あとで', style: 'cancel' },
        { text: '設定', onPress: () => void Linking.openSettings() },
      ]
    );
  }, [refreshPermission]);

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
      await refreshPermission();
      setLoaded(true);
    })();
  }, [reconcile, refreshPermission]);

  // フォアグラウンド復帰時に状態を再評価。
  // 設定アプリで通知を切り替えて戻ってくる経路があるので許可状態も見直す
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void reconcile(alarmRef.current);
        void refreshPermission();
      }
    });
    return () => sub.remove();
  }, [reconcile, refreshPermission]);

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
    // 許可されなくてもセットは通す。通知はアプリを閉じている間の補助でしかない
    await askPermissionOnce();
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
    if (!(await isSilentNoticeHidden())) {
      Alert.alert(
        'マナーモードだと音が鳴りません',
        '音で起きたいときは、寝る前にマナーモードを切っておいてください。',
        [
          { text: '次回から非表示', style: 'destructive', onPress: () => void hideSilentNotice() },
          { text: 'OK', style: 'cancel' },
        ]
      );
    }
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
        <SunMark />
        <Text style={styles.ringingLabel}>おはよう</Text>
        <Text style={styles.ringingTime}>
          {alarm ? formatTime(alarm.hour, alarm.minute) : ''}
        </Text>
        <Pressable
          style={({ pressed }) => [styles.stopButton, pressed && styles.pressed]}
          onPress={handleStop}
        >
          <Text style={styles.stopButtonText}>ストップ</Text>
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
        <NightSky />
        <StatusBar style="light" />
        {/* 読むだけの情報なので面で囲わず、夜空の上に直接置く */}
        <View style={styles.armedBlock}>
          <Text style={styles.armedLabel}>
            {alarm.repeatDaily ? '毎日' : '1回だけ'}
          </Text>
          <Text style={styles.armedTime}>{formatTime(alarm.hour, alarm.minute)}</Text>
          <Text style={styles.countdown}>
            あと {remainH > 0 ? `${remainH}時間` : ''}
            {remainM}分
          </Text>
        </View>
        {!notifyGranted && <NotifyWarning onPress={() => void enableNotification()} />}
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
      <NightSky />
      <StatusBar style="light" />
      <DateTimePicker
        // ネイティブのピッカーは幅の既定値を持たず固有サイズに任せる作りなので、
        // 幅を決めて収める
        style={styles.picker}
        value={pickerValue}
        mode="time"
        display="spinner"
        themeVariant="dark"
        textColor={colors.starlight}
        accentColor={colors.honey}
        onChange={(_, date) => {
          if (date) setPickerValue(date);
        }}
      />
      {/* 既定は1回だけ。毎日にしたいときだけ触ればいいので、2択ではなくチェック1つにする */}
      <Pressable
        style={({ pressed }) => [styles.repeatRow, pressed && styles.pressed]}
        onPress={() => setRepeatDaily((v) => !v)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: repeatDaily }}
      >
        <View style={[styles.check, repeatDaily && styles.checkOn]}>
          {repeatDaily && <Text style={styles.checkMark}>✓</Text>}
        </View>
        <Text style={[styles.repeatText, repeatDaily && styles.repeatTextOn]}>毎日</Text>
      </Pressable>
      {!notifyGranted && <NotifyWarning onPress={() => void enableNotification()} />}
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
    backgroundColor: colors.night,
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

  // --- 夜空 ---
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  moon: {
    position: 'absolute',
    top: 72,
    right: 44,
    width: 64,
    height: 64,
  },
  moonDisc: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.moon,
  },
  // 切り抜き（overflow: hidden）だと欠けた側に月の輪郭が細く残るので、上に重ねて隠す
  moonShadow: {
    position: 'absolute',
    top: -10,
    left: -22,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.night,
  },
  star: {
    position: 'absolute',
    borderRadius: 2,
    backgroundColor: colors.starlight,
    opacity: 0.6,
  },

  // --- セット画面 ---
  picker: {
    // 高さは指定しない（プラットフォームごとの固有の高さをそのまま使う）
    width: '100%',
    maxWidth: 320,
  },
  // 「毎日」のチェック。丸い枠を月明かりの色で描き、入れるとはちみつ色で満たす
  repeatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  check: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.dusk,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: {
    backgroundColor: colors.honey,
    borderColor: colors.honey,
  },
  checkMark: {
    color: colors.night,
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 16,
  },
  repeatText: {
    color: colors.dusk,
    fontSize: 16,
    letterSpacing: 1,
  },
  repeatTextOn: {
    color: colors.starlight,
  },

  // --- 通知オフの警告 ---
  // 画面の主役はあくまで時刻なので、赤い面ではなく一段明るい夜空の面に収める
  warning: {
    width: '100%',
    maxWidth: 320,
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.nightRaised,
    borderRadius: radius.panel,
    paddingVertical: 14,
    paddingHorizontal: 20,
    // gap の 28 は面と面の間隔としては空きすぎるので詰める
    marginVertical: -8,
  },
  warningTitle: {
    color: colors.honey,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  warningBody: {
    color: colors.dusk,
    fontSize: 13,
  },

  // --- セットボタン ---
  // 夜空の中で唯一の明るい面にして、押す場所を迷わせない
  setButton: {
    width: '100%',
    maxWidth: 320,
    alignItems: 'center',
    backgroundColor: colors.honey,
    paddingVertical: 18,
    borderRadius: radius.pill,
    marginTop: 12,
  },
  setButtonText: {
    color: colors.night,
    fontSize: 19,
    fontWeight: '700',
    letterSpacing: 4,
  },

  // --- セット済み画面 ---
  armedBlock: {
    alignItems: 'center',
    gap: 10,
  },
  // 面を持たせず文字だけで示す。字間を広めに取って、静かなまま存在感を出す
  armedLabel: {
    color: colors.honey,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 5,
    // letterSpacing で右側に余白がつくぶんを戻して光学的に中央へ寄せる
    marginLeft: 5,
  },
  armedTime: {
    color: colors.starlight,
    fontSize: 92,
    fontWeight: '200',
    letterSpacing: 2,
    fontVariant: ['tabular-nums'],
  },
  countdown: {
    color: colors.dusk,
    fontSize: 16,
    letterSpacing: 1,
  },
  disarmButton: {
    borderColor: colors.clay,
    borderWidth: 1.5,
    paddingVertical: 14,
    paddingHorizontal: 52,
    borderRadius: radius.pill,
    marginTop: 8,
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
    backgroundColor: colors.paper,
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
