/* ============================================================
   粵學堂 · 粤语歌学习导览
   ------------------------------------------------------------
   公共仓库只保留歌曲事实性元数据、原创导览和歌名发音提示，
   不分发第三方歌词或音频。用户可导入自己合法取得的本地音频；
   音频只在浏览器本机播放，不会上传。
   ============================================================ */

const SONGS = [
  {
    id:'ocean', title:'海闊天空', artist:'Beyond', year:1993,
    emoji:'🌊', level:'中级', tags:['经典','励志'], colors:['#0f3443','#34a2a2'],
    intro:'Beyond 的代表作，适合练习开阔元音、入声收尾和长句气息。公共版本不提供歌词，可配合正版音源和你合法取得的歌词学习。',
    lyric:[],
    notes:[{target:'海闊天空 hoi2 fut3 tin1 hung1', tip:'「闊」fut3 是入声 -t 尾；「空」hung1 保留 h- 开头和 ng 尾。'}],
  },
  {
    id:'qianqian', title:'千千闕歌', artist:'陳慧嫻', year:1989,
    emoji:'🌙', level:'初级', tags:['经典','抒情'], colors:['#3a1c71','#b5651d'],
    intro:'旋律舒缓、吐字清晰，适合初学者练习连贯气息和句尾收音。公共版本不提供歌词。',
    lyric:[],
    notes:[{target:'千千闕歌 cin1 cin1 kyut3 go1', tip:'「闕」读 kyut3，是短促的入声 -t 尾。'}],
  },
  {
    id:'redsun', title:'紅日', artist:'李克勤', year:1992,
    emoji:'🔥', level:'进阶', tags:['经典','快歌'], colors:['#8e0e00','#c94b4b'],
    intro:'节奏明快、语句密集，适合进阶学习者练口齿、节拍和连续入声。公共版本不提供歌词。',
    lyric:[],
    notes:[{target:'紅日 hung4 jat6', tip:'「日」jat6 是入声 -t 尾，收音要短而清楚。'}],
  },
  {
    id:'lihuanxi', title:'喜歡你', artist:'Beyond', year:1988,
    emoji:'💛', level:'初级', tags:['经典','情歌'], colors:['#654ea3','#eaafc8'],
    intro:'旋律温柔、字音清晰，适合新手练习稳定发声和自然口型。公共版本不提供歌词。',
    lyric:[],
    notes:[{target:'喜歡你 hei2 fun1 nei5', tip:'「喜」读 hei2；「歡」fun1 的 f- 送气要清晰。'}],
  },
  {
    id:'zhenai', title:'真的愛你', artist:'Beyond', year:1989,
    emoji:'💖', level:'初级', tags:['经典','亲情'], colors:['#ad5389','#3c1053'],
    intro:'节奏稳定、吐字清楚，适合初学者开嗓和练习情绪表达。公共版本不提供歌词。',
    lyric:[],
    notes:[{target:'真的愛你 zan1 dik1 oi3 nei5', tip:'「的」dik1 是入声 -k 尾；「愛」oi3 起音要干净。'}],
  },
  {
    id:'glory', title:'光輝歲月', artist:'Beyond', year:1990,
    emoji:'🕊️', level:'中级', tags:['经典','励志'], colors:['#4568dc','#b06ab3'],
    intro:'适合练习圆唇声母、长句气息和有力度的副歌表达。公共版本不提供歌词。',
    lyric:[],
    notes:[{target:'光輝歲月 gwong1 fai1 seoi3 jyut6', tip:'「光」以 gw- 起音；「月」jyut6 是入声 -t 尾。'}],
  },
  {
    id:'shanghai', title:'上海灘', artist:'葉麗儀', year:1980,
    emoji:'🌊', level:'中级', tags:['经典','大气'], colors:['#0f2027','#203a43'],
    intro:'旋律起伏鲜明，适合练长音、胸腔共鸣和句尾力度。公共版本不提供歌词。',
    lyric:[],
    notes:[{target:'上海灘 soeng6 hoi2 taan1', tip:'「上」soeng6 注意 oe 韵；「灘」taan1 的 aa 要充分打开。'}],
  },
  {
    id:'lion', title:'獅子山下', artist:'羅文', year:1979,
    emoji:'🦁', level:'中级', tags:['经典','香港精神'], colors:['#232526','#414345'],
    intro:'慢板且层次清楚，适合练习字正腔圆、共鸣和叙事感。公共版本不提供歌词。',
    lyric:[],
    notes:[{target:'獅子山下 si1 zi2 saan1 haa6', tip:'「獅」si1 和「子」zi2 的声母不同；「下」haa6 保留 h-。'}],
  },
  {
    id:'manbu', title:'漫步人生路', artist:'鄧麗君', year:1983,
    emoji:'🌅', level:'初级', tags:['经典','抒情'], colors:['#ee9ca7','#ffdde1'],
    intro:'旋律轻快、节奏平稳，适合练习连读和自然的粤语语流。公共版本不提供歌词。',
    lyric:[],
    notes:[{target:'漫步人生路 maan6 bou6 jan4 sang1 lou6', tip:'「漫」maan6 和「路」lou6 都是低降调，注意不要唱成普通话声调。'}],
  },
  {
    id:'pianpian', title:'偏偏喜歡你', artist:'陳百強', year:1983,
    emoji:'🌸', level:'初级', tags:['经典','情歌'], colors:['#c94b4b','#4b134f'],
    intro:'旋律线较长，适合练气息控制、咬字和抒情表达。公共版本不提供歌词。',
    lyric:[],
    notes:[{target:'偏偏喜歡你 pin1 pin1 hei2 fun1 nei5', tip:'「偏」pin1 的 p- 要送气；两个字保持同一音高起点。'}],
  },
  {
    id:'fenfenzhong', title:'分分鐘需要你', artist:'林子祥', year:1980,
    emoji:'🚀', level:'进阶', tags:['经典','轻快'], colors:['#11998e','#38ef7d'],
    intro:'节奏轻快跳脱，适合练口语腔调、连续咬字和节拍感。公共版本不提供歌词。',
    lyric:[],
    notes:[{target:'分分鐘需要你 fan1 fan1 zung1 seoi1 jiu3 nei5', tip:'「分」fan1 与「鐘」zung1 韵母不同，连续唱时不要混音。'}],
  },
];

/* 粤语歌中常见的口语字词；示例为本项目原创短语。 */
const LYRIC_WORDS = [
  {char:'嘅', jp:'ge3', mand:'的（定语助词）', ex:'我嘅心 = 我的心'},
  {char:'唔', jp:'m4', mand:'不', ex:'唔知 = 不知道'},
  {char:'喺', jp:'hai2', mand:'在（某处）', ex:'喺屋企 = 在家里'},
  {char:'嚟', jp:'lai4', mand:'来', ex:'過嚟 = 过来'},
  {char:'佢', jp:'keoi5', mand:'他/她/它', ex:'佢哋 = 他们'},
  {char:'哋', jp:'dei6', mand:'们（复数）', ex:'我哋 = 我们'},
  {char:'冇', jp:'mou5', mand:'没有', ex:'冇時間 = 没时间'},
  {char:'睇', jp:'tai2', mand:'看', ex:'睇戲 = 看电影'},
  {char:'咗', jp:'zo2', mand:'了（完成体）', ex:'走咗 = 走了'},
  {char:'係', jp:'hai6', mand:'是', ex:'就係你 = 就是你'},
  {char:'攞', jp:'lo2', mand:'拿', ex:'攞走 = 拿走'},
  {char:'喎', jp:'wo3', mand:'语气词（提醒）', ex:'小心啲喎！'},
  {char:'㗎', jp:'gaa3', mand:'语气词（强调/反问）', ex:'好正㗎！'},
  {char:'傾偈', jp:'king1 gai2', mand:'聊天', ex:'傾吓偈 = 聊聊天'},
  {char:'得閒', jp:'dak1 haan4', mand:'有空', ex:'得閒飲茶 = 有空喝早茶'},
];
