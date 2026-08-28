/* ============================================================
   粵學堂 · 分级阅读（原创短文）
   ------------------------------------------------------------
   初级短文：逐句粤拼 + 释义 + 点击朗读 + 理解题 + 生词入复习

   用字规范（与 js/data.js 保持一致，校验器会检查）：
   - han（粤语正文）与 newWords 用繁体（香港用字）
   - mand（普通话释义）用简体
   - newWords 必须是 js/data.js 词库中已收录的词，否则读完无法入复习计划
   ============================================================ */
const STORIES = [
  {
    id: 'first-dimsum',
    title: '第一次飲茶',
    level: '初級',
    words: 90,
    minutes: 3,
    intro: '同朋友第一次去茶樓飲茶，學下點單同埋埋單。',
    lines: [
      { han: '今日，我同朋友去茶樓飲茶。', jp: 'gam1 jat6, ngo5 tung4 pang4 jau5 heoi3 caa4 lau4 jam2 caa4.', mand: '今天，我和朋友去茶楼喝早茶。' },
      { han: '侍應問我哋幾位。', jp: 'si6 jing3 man6 ngo5 dei6 gei2 wai2.', mand: '服务员问我们几位。' },
      { han: '我話：「兩位。」', jp: 'ngo5 waa6: "loeng5 wai2."', mand: '我说：“两位。”' },
      { han: '佢又問：「飲咩茶？」', jp: 'keoi5 jau6 man6: "jam2 me1 caa4?"', mand: '他又问：“喝什么茶？”' },
      { han: '我哋叫咗普洱。', jp: 'ngo5 dei6 giu3 zo2 pou2 lei2.', mand: '我们点了普洱茶。' },
      { han: '跟住，我哋點咗蝦餃同燒賣。', jp: 'gan1 zyu6, ngo5 dei6 dim2 zo2 haa1 gaau2 tung4 siu1 maai6.', mand: '接着，我们点了虾饺和烧卖。' },
      { han: '蝦餃好好食，燒賣都好正。', jp: 'haa1 gaau2 hou2 hou2 sik6, siu1 maai6 dou1 hou2 zeng3.', mand: '虾饺很好吃，烧卖也很棒。' },
      { han: '飲完茶，我哋埋單，盛惠八十八蚊。', jp: 'jam2 jyun4 caa4, ngo5 dei6 maai4 daan1, sing6 wai6 baat3 sap6 baat3 man1.', mand: '喝完茶，我们结账，一共八十八块。' },
      { han: '朋友話：「下次再嚟！」', jp: 'pang4 jau5 waa6: "haa6 ci3 zoi3 lai4!"', mand: '朋友说：“下次再来！”' }
    ],
    newWords: ['飲茶', '蝦餃', '燒賣', '侍應'],
    quiz: [
      { q: '佢哋去邊度？', opts: ['茶樓', '街市', '巴士站', '茶餐廳'], ans: 0 },
      { q: '佢哋飲咩茶？', opts: ['香片', '普洱', '鐵觀音', '菊花'], ans: 1 },
      { q: '點咗咩點心？', opts: ['只有蝦餃', '只有燒賣', '蝦餃同燒賣', '叉燒包同蛋撻'], ans: 2 },
      { q: '埋單盛惠幾多？', opts: ['十八蚊', '八十蚊', '八十八蚊', '八百蚊'], ans: 2 },
      { q: '「下次再嚟」係邊個講嘅？', opts: ['侍應', '朋友', '老闆', '路人'], ans: 1 }
    ]
  }
];
