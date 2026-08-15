/**
 * クリーム基調のあたたかい配色。
 * 朝の日差しが入る部屋（生成りのクリーム＋やわらかいセージグリーン）をイメージし、
 * 鳴動中だけ朝日のオレンジに切り替えて視認性を上げる。
 */
export const colors = {
  /** 画面背景の生成りクリーム */
  cream: '#FAF3E6',
  /** 背景に敷く一段濃いクリーム（光の帯） */
  creamDeep: '#F6E7CB',
  /** カード面。背景よりわずかに明るい */
  card: '#FFFCF5',
  /** カードの縁取り */
  cardBorder: '#EDE0C9',

  /** 本文・時刻の文字色（黒ではなく温かみのある焦茶） */
  ink: '#4A4038',
  /** 補助テキスト */
  inkSoft: '#9C8C79',

  /** アクセントのセージグリーン（毛布・時計のイメージ） */
  sage: '#8FA98B',
  /** ボタンなど、白文字を載せる濃いめのセージ */
  sageDeep: '#6E8B6A',
  /** 背景装飾に使う淡いセージ */
  sagePale: '#E7EFE0',
  /** クリーム地に小さな文字で載せるセージ（コントラスト比 4.7:1） */
  sageInk: '#5A7456',

  /** 鳴動画面の朝日オレンジ */
  sunrise: '#F5A85F',
  /** 朝日の芯 */
  sunriseCore: '#FFF0D2',
  /** オレンジ背景に載せる濃い文字色 */
  sunriseInk: '#4A3120',
  /** 「止める」ボタンの文字色 */
  sunriseDeep: '#C4622A',

  /** 解除など取り消し系の柔らかいテラコッタ */
  clay: '#C9765A',
  /** 警告の面。クリームより少しだけ赤みを帯びた淡いテラコッタ */
  clayPale: '#FBEAE0',
  /** 警告文。淡いテラコッタ地に小さな文字で載せる（コントラスト比 4.8:1） */
  clayInk: '#A8502F',

  /** スイッチのオフ時トラック */
  switchOff: '#DED3BF',
} as const;

export const radius = {
  card: 28,
  pill: 999,
} as const;

/** カードに共通で当てるやわらかい影（iOS: shadow*, Android: elevation） */
export const softShadow = {
  shadowColor: '#B79A6B',
  shadowOpacity: 0.18,
  shadowRadius: 18,
  shadowOffset: { width: 0, height: 8 },
  elevation: 3,
} as const;
