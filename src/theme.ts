/**
 * 「夜にセットして、朝に鳴る」配色。
 * セット前・セット中は寝る前に開く画面なので、まぶしくない夜の紺に月明かりの文字を載せる。
 * 鳴動中だけ朝日のオレンジに切り替えて、夜が明けたことを伝える。
 * アクセントはアイコンの目覚まし時計と同じはちみつ色。
 */
export const colors = {
  /** 夜空の地色 */
  night: '#1E2547',
  /** 夜空より一段明るい面（通知オフの案内） */
  nightRaised: '#2C3460',
  /** 三日月 */
  moon: '#F3E3BC',

  /** 本文・時刻の文字色（夜空の上で 12.9:1） */
  starlight: '#F5EEDF',
  /** 補助テキスト（夜空の上で 6.0:1、一段明るい面の上で 4.8:1） */
  dusk: '#9DA3C4',

  /** アクセントのはちみつ色（アイコンの目覚まし時計）。夜空の上で 7.9:1 */
  honey: '#F5B04A',
  /** 解除など取り消し系の柔らかいテラコッタ（夜空の上で 7.4:1） */
  clay: '#F0A58C',

  /** 鳴動画面の朝日オレンジ */
  sunrise: '#F5A85F',
  /** 朝日の芯 */
  sunriseCore: '#FFF0D2',
  /** オレンジ背景に載せる濃い文字色 */
  sunriseInk: '#4A3120',
  /** 「止める」ボタンの文字色 */
  sunriseDeep: '#C4622A',
  /** 「止める」ボタンの面 */
  paper: '#FFFCF5',
} as const;

export const radius = {
  panel: 20,
  pill: 999,
} as const;

/** ボタンに当てるやわらかい影（iOS: shadow*, Android: elevation） */
export const softShadow = {
  shadowColor: '#B79A6B',
  shadowOpacity: 0.18,
  shadowRadius: 18,
  shadowOffset: { width: 0, height: 8 },
  elevation: 3,
} as const;
