/* ============================================================
   粵學堂 · 分级阅读（原创短文）
   ------------------------------------------------------------
   初级短文：逐句粤拼 + 释义 + 点击朗读 + 理解题 + 生词入复习
   ============================================================ */
const STORIES = [
  {
    id: 'first-dimsum',
    title: '第一次饮茶',
    level: '初级',
    words: 90,
    minutes: 3,
    intro: '同朋友第一次去茶楼饮茶，学下点单同埋單。',
    lines: [
      { han: '今日，我同朋友去茶楼饮茶。', jp: 'gam1 jat6, ngo5 tung4 pang4 jau5 heoi3 caa4 lau4 jam2 caa4.', mand: '今天，我和朋友去茶楼喝早茶。' },
      { han: '侍应问我哋幾位。', jp: 'si6 jing1 man6 ngo5 dei6 gei2 wai2.', mand: '服务员问我们几位。' },
      { han: '我话：「兩位。」', jp: 'ngo5 waa6: "loeng5 wai2."', mand: '我说：“两位。”' },
      { han: '佢又问：「饮咩茶？」', jp: 'keoi5 jau6 man6: "jam2 me1 caa4?"', mand: '他又问：“喝什么茶？”' },
      { han: '我哋叫咗普洱。', jp: 'ngo5 dei6 giu3 zo2 pou2 lei2.', mand: '我们点了普洱茶。' },
      { han: '跟住，我哋点咗虾饺同烧卖。', jp: 'gan1 zyu6, ngo5 dei6 dim2 zo2 haa1 gaau2 tung4 siu1 maai6.', mand: '接着，我们点了虾饺和烧卖。' },
      { han: '虾饺好好食，烧卖都好正。', jp: 'haa1 gaau2 hou2 hou2 sik6, siu1 maai6 dou1 hou2 zeng3.', mand: '虾饺很好吃，烧卖也很棒。' },
      { han: '饮完茶，我哋埋单，盛惠八十八蚊。', jp: 'jam2 jyun4 caa4, ngo5 dei6 maai4 daan1, sing6 wai6 baat3 sap6 baat3 man1.', mand: '喝完茶，我们结账，一共八十八块。' },
      { han: '朋友话：「下次再嚟！」', jp: 'pang4 jau5 waa6: "haa6 ci3 zoi3 lai4!"', mand: '朋友说：“下次再来！”' }
    ],
    newWords: ['飲茶', '蝦餃', '燒賣', '侍應'],
    quiz: [
      { q: '佢哋去边度？', opts: ['茶楼', '街市', '巴士站', '茶餐厅'], ans: 0 },
      { q: '佢哋饮咩茶？', opts: ['香片', '普洱', '铁观音', '菊花'], ans: 1 },
      { q: '点咗咩点心？', opts: ['只有虾饺', '只有烧卖', '虾饺同烧卖', '叉烧包同蛋挞'], ans: 2 },
      { q: '埋单盛惠几多？', opts: ['十八蚊', '八十蚊', '八十八蚊', '八百蚊'], ans: 2 },
      { q: '「下次再嚟」係边个讲嘅？', opts: ['侍应', '朋友', '老板', '路人'], ans: 1 }
    ]
  }
];
