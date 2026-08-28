/* ============================================================
   粵學堂 · 主题课（学习路径主线）
   ------------------------------------------------------------
   每课 7 步：聲調辨析 → 場景詞 → 情景對話 → 語法點 → 文化提示
             → 理解題 → 完成（生詞自動入複習計劃）
   步骤引用现有数据（词汇/对话/语法/文化），不复制内容。

   用字规范（与 js/data.js、js/stories.js 一致，校验器会检查）：
   - 面向学习者的粤语文本（title / desc / ask / quiz 题干与选项）用繁体
   - artId / catId / dlgId / lifeTitle 是查表键，必须与 js/data.js 完全一致
     （lifeTitle 对应 DATA.culture.life[].title，目前该处仍为简体）
   ============================================================ */
const LESSONS = [
  {
    id: 'tea-house',
    title: '飲茶',
    emoji: '🍵',
    level: '初級',
    minutes: 6,
    desc: '從聲調到一盅兩件：學茶樓點單與飲茶文化',
    steps: [
      {
        type: 'tones', title: '聲調辨析',
        pairs: [
          { a: {han:'詩', jp:'si1'}, b: {han:'時', jp:'si4'}, ask: '邊個係「陰平 55」？', ans: 'a' },
          { a: {han:'試', jp:'si3'}, b: {han:'事', jp:'si6'}, ask: '邊個係「陽去 22」？', ans: 'b' }
        ]
      },
      {
        type: 'vocab', title: '場景詞',
        catId: 'food', words: ['飲茶', '蝦餃', '燒賣', '蛋撻', '腸粉']
      },
      {
        type: 'dialogue', title: '情景對話', dlgId: 'dimsum'
      },
      {
        type: 'grammar', title: '語法點', artId: 'particles'
      },
      {
        type: 'culture', title: '文化提示', lifeTitle: '「一盅两件」叹世界'
      },
      {
        type: 'quiz', title: '理解題',
        questions: [
          { q: '侍應第一句問咩？', opts: ['幾位呀？', '飲咩茶呀？', '要啲咩點心？', '埋單呀？'], ans: 0 },
          { q: '食客飲咩茶？', opts: ['香片', '普洱', '鐵觀音', '菊花'], ans: 1 },
          { q: '食客點咗咩點心？', opts: ['只有蝦餃', '只有燒賣', '蝦餃同燒賣，仲要一碟腸粉', '叉燒包同蛋撻'], ans: 2 },
          { q: '「埋單」係咩意思？', opts: ['點餐', '結賬', '催菜', '打包'], ans: 1 },
          { q: '埋單一共幾多錢？', opts: ['八十蚊', '八十八蚊', '十八蚊', '八百蚊'], ans: 1 }
        ]
      }
    ]
  }
];
