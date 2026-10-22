// EC ProfitLens 說明頁（/guide、/guide/{area}）的文字——說明頁所有使用者看得到的中文（含 metadata、alt、圖說）的單一來源（D-V41-12＝A'；docs/revamp-v4.1/01_PRD.md §3.10）。
// 內容出自 docs/revamp-v4.1/GUIDE_CONTENT.md（介紹三段是 H7 前的草稿，D-V41-9＝A 用 §1.1 產品口吻）。
// 只給伺服器模組 import（src/app/guide/**、src/components/guide/**）；任何 "use client" 模組都不 import 這個檔（tests/guide-routes.test.tsx 斷言），
// 說明文字才不會進工作台 / 的首載——labels.zh-TW.ts 整份進首載，所以說明文字不放那裡。頂層只有 guide（tests/labels-structure.test.ts）。
// 寫法：{ui:路徑} 引用 labels.zh-TW.ts 的既有介面字串，渲染時由 src/application/guide.ts 的 resolveUiRefs 換成原字串；介面字串不重打（tests/guide-content.test.ts）。
// {名稱} 是執行時用 fill() 填值的占位符。這個檔不 import 任何模組：scripts/*.mjs 可以直接用 Node 載入。
// 用詞依 docs/revamp-v3/GLOSSARY.md、docs/revamp-v4/GLOSSARY.md；不寫成效、不點名競品、不用最高級（copy-scan 對 guide.* 擋）。

export const guideLabels = {
  guide: {
    // ── V41-1 錨點：說明首頁（GUIDE_CONTENT §1.0–1.6）、外框、metadata 與 11 個功能區的標題（D-V41-19；功能區頁的步驟從 V41-2a 起加）。
    common: {
      /** 每個說明頁的 <title> 與分享標題：{page}＝該頁標題，{brand}＝labels.brand.name（執行時填入，不寫死品牌名）。 */
      pageTitle: "{page} · {brand}",
      // ── V41-2a 錨點：功能區頁的共用字（GUIDE_CONTENT §0、§1.7）。
      /** 每張截圖外包的原尺寸連結，只放在可及名稱（sr-only）：連結的可及名稱＝alt＋這一句。 */
      fullSize: "（開啟原尺寸圖）",
      /** 圖說後另起一行的資料來源註記：S1、S6–S8（示範資料，src/application/guide.ts 的 guideDataNote＝demo）。 */
      demoCaption: "畫面為示範資料（虛構）",
      /** 同上：S3、S4、S5（repo 內既有的合成檔，guideDataNote＝synthetic；D-V41-21＝A）。 */
      syntheticCaption: "畫面為虛構的合成資料",
      /** 說明頁頁尾：{date}＝src/application/guide-media.json 的 updated（只有實際更新了媒體時才變；還沒有媒體時整句不顯示）。截圖有示範資料也有合成資料（都是虛構的），所以寫「虛構資料」。 */
      mediaUpdated: "截圖是虛構資料的畫面，更新於 {date}。",
      // ── V41-3 錨點：示範影片的共用字（GUIDE_CONTENT §1.7、§3；PRD §3.3 第 7 項、§3.6）。
      /** 每支影片下方、逐字稿之前的一行（GUIDE_CONTENT §1.7 原文）。 */
      videoNote: "影片沒有聲音；下方是影片的逐步文字。",
      /** 字幕軌（<track kind="captions" srclang="zh-Hant-TW">）的名稱：顯示在播放器的字幕選單。 */
      captionsLabel: "中文字幕",
    },
    /** V41-2a：功能區頁的麵包屑與連結用字。 */
    areaPage: {
      /** 麵包屑 <nav> 的可及名稱。 */
      breadcrumbAria: "目前位置",
      /** 麵包屑第一層（連到 /guide）：與工作台入口同一個字。 */
      home: "{ui:shell.guideV41.entry}",
      /** 「要注意」某一點後附的功能區連結前的提示。 */
      seeAlso: "相關說明：",
    },
    hub: {
      /** h1。 */
      title: "服務介紹與使用說明",
      // ── V42-G1 錨點：說明首頁改寫（使用者 2026-10-20 改寫稿）
      // 副標、meta description、為什麼做這套服務、幫哪些人解決哪些問題、獨特性（3 主張＋1 前提，固定四段）、刻意不做的事、30 秒上手引言都依改寫稿（docs/revamp-v4.2/06_BATCHES.md V42-G1；D-V42-32、33）。
      // 改值與新增的鍵凍結在 verification/revamp-v42/labels-guide-rewrite.flat.json（tests/labels-structure.test.ts「V42-G1」）；被護欄改掉的字（最快、我們、一鍵、箭頭）與依事實改寫的句子見 docs/DECISIONS.md 2026-10-20。
      // h1（title）、兩顆按鈕（openApp、startHere）、tocAria、why.lead（GUIDE_SENTINELS）、who.fields、scope、fits、notYet、四步、影片、功能區目錄都逐字沿用 v4.1。
      /** <meta name="description"> 與分享摘要。 */
      description: "EC ProfitLens 把電商週會的獲利檢討做成固定流程：匯入三份日報，算出扣廣告後貢獻，每個數字可追到來源。看它為誰而做、和一般工具差在哪，30 秒上手。",
      /** h1 下的一句話：V42-G1 起是說明頁自己的副標（v4.1 直接引用 brand.description，不另寫一句；D-V42-32）。 */
      intro: "匯入銷售、通路費用、廣告三份日報，算出扣廣告後貢獻、拆出兩期差額；每個數字都能追到檔名與行號，要做的事直接帶進週會。",
      /** 主要按鈕（同分頁連到工作台 /）；說明頁頂端外框也用這一條。 */
      openApp: "開啟工作台",
      /** 次要連結（頁內錨點 #quickstart）。 */
      startHere: "從 30 秒上手開始",
      /** 本頁目錄 <nav> 的可及名稱。 */
      tocAria: "本頁目錄",
    },
    /** 說明首頁的段落標題（h2；scope、tradeoffs 是 h3）。列入 L1：每個子句 ≤ 14 字。V42-G1：tradeoffs 改「刻意不做的事」（改寫稿的「我們刻意不做的事」含 copy-style 語氣黑名單「我們」）；unique 不改（D-V42-33）。 */
    sections: {
      why: "為什麼做這套服務",
      who: "這套服務幫哪些人解決哪些問題？",
      scope: "適合誰，還沒涵蓋什麼",
      unique: "這套服務有什麼獨特性？",
      tradeoffs: "刻意不做的事",
      quickstart: "30 秒上手",
      areas: "各功能區的操作說明",
      // ── V41-2a 錨點：功能區頁的段落名稱（PRD §3.3）。answers、before 是 h1 下方摘要的欄名；notes、next 是 h2（頁內錨點 #notes、#next）。
      answers: "這頁回答什麼",
      before: "開始前",
      notes: "要注意",
      next: "下一步",
    },
    /** 為什麼做這套服務（V42-G1 改寫稿 §2；lead 逐字沿用 v4.1，是 GUIDE_SENTINELS 之一，不改）。 */
    why: {
      lead: "淨營收漲了，扣完平台抽成、物流與廣告，到底多賺還是少賺？",
      body: [
        "電商團隊每週開會，常卡在這一題。蝦皮、momo、官網各有後台，看得到成交金額和廣告 ROAS；平台抽成、金流物流、商品成本和廣告費卻散在不同報表，有的含稅、有的未稅。多半是某個人在週會前把幾份報表貼進 Excel 拼成一張表；會議上一個數字被追問，就得回頭翻原始檔，討論停在「下次再確認」。",
        "EC ProfitLens 把這件事做成固定流程：匯入銷售、通路費用、廣告三份每日報表，用同一套算法從淨營收一層一層扣到扣廣告後貢獻；比較兩期差在哪裡、差額來自哪個通路哪項費用；再把要做的事變成待辦，把決定記進{ui:shell.nav.meeting.headline}。每個數字都能點開，看到公式、CSV 檔名和行號，被問到時答案就在畫面上。",
      ],
      /** 結語（渲染成 guide-note）：改寫稿的「最快的方法是載入示範資料」因說明頁最高級黑名單改成「直接載入示範資料」（D-V42-33）。 */
      status: "這一頁只說明它做什麼，不談成效：示範資料是虛構的合成資料，目前還沒有真實商家的試用結果。要判斷它適不適合你，直接{ui:shell.buttons.loadDemo}，花 30 秒點開幾個數字。",
    },
    /** 這套服務幫哪些人解決哪些問題？（V42-G1 改寫稿 §3）。每個角色一塊，fields 是各欄的名稱（與 v4.1 相同）；「從哪裡開始」的功能區在 src/application/guide.ts 的 GUIDE_WHO（不變）。 */
    who: {
      lead: "同一份資料，老闆、主管和執行者要的答案不同；不用切換角色或帳號，各自往下展開就好。",
      fields: { ask: "想知道", before: "以前怎麼做", after: "在這裡怎麼做", start: "從哪裡開始" },
      roles: {
        boss: {
          role: "老闆",
          ask: "本期多賺還是少賺、差多少、最大一項是什麼。",
          /** 改寫稿的「後台只有成交金額和廣告 ROAS」是對第三方後台的絕對句、產品內無法驗證，改成「看得到」（D-V42-33）。 */
          before: "後台看得到成交金額和廣告 ROAS；扣完抽成、物流、廣告的結果要等人整理，追問一個數字就要再等一輪。",
          after: "打開{ui:shell.nav.overview.headline}，最上面的{ui:overview.snapshotUi.heading}說本期多賺或少賺多少，五個關鍵數字各附上期與差額，一張瀑布圖把兩期差額拆成九項。開會用{ui:shell.presentV3.enter}，會後印{ui:exports.variantsV3.names.boss}。",
        },
        manager: {
          role: "主管（行銷、營運）",
          ask: "差額來自哪個通路、哪一項費用，下一步要調什麼。",
          before: "在幾個後台和 Excel 之間對數字；週會前趕一頁摘要，會後再把決議抄進另一份文件。",
          after: "{ui:shell.nav.diagnosis.headline}把問題依影響金額排好；{ui:shell.nav.scenarios.headline}算出調廣告、折扣或物流費後，扣廣告後貢獻差多少、{ui:scenarios.sections.scenarioBreakeven}；看完直接{ui:actions.buttons.addToActions}、{ui:meeting.buttons.selectForMeeting}，寫下決議，{ui:overview.snapshotUi.copy}貼進群組。",
        },
        operator: {
          role: "執行者（分析、營運助理）",
          ask: "三份資料對不對，哪個檔、第幾行有問題，某個數字怎麼來的。",
          before: "各平台報表欄位名稱不同，含稅、未稅混在一起；被問到某個數字怎麼來的，只能回頭翻檔案。",
          /** 改寫稿的「欄位自動對照」只在欄名完全符合標準時成立，其餘對照標「請確認」、按「確認對照」才算數，改成「由系統先對照、你再確認」（D-V42-33）。 */
          after: "匯入精靈四步完成，欄位由系統先對照、你再確認，含稅報表逐列換算成未稅；資料問題寫出檔名、第幾行和修法，缺的列不會被當成 0；任何數字都能打開{ui:evidence.sections.evidence}，看到公式、檔名和行號。",
        },
      },
      also: "也適合代營運與電商顧問：一頁摘要有{ui:exports.variantsV3.names.client}，每個數字可追到來源，客戶追問時站得住。也適合需要核對數字的財務人員：金額以分為單位計算，兩期差額拆解附平衡檢核。",
      fits: "適合單一公司、新台幣、賣實體商品，在官網與市集多通路經營的團隊。",
      notYet: "目前還沒涵蓋訂閱制、服務業、製造成本與多幣別，也沒有廣告歸因與訂單、顧客層級的指標。扣廣告後貢獻還沒扣固定費和所得稅，和公司淨利不同。",
    },
    /**
     * 這套服務有什麼獨特性？（V42-G1 改寫稿 §4：3 個主張＋1 個前提，每項固定四段；D-V41-11＝A 只寫可在產品裡驗證的做法）。
     * 項目順序與「在哪裡看得到」的功能區在 src/components/guide/guide-hub-data.ts 的 GUIDE_HUB_CLAIMS、GUIDE_HUB_PREMISE（v4.1 的 7 項 evidence…taiwan 已刪）。
     * 引言的兩個引述問句改成陳述句（新字串用陳述句）；「一鍵」「會議紀錄文件」「匯出 PDF」等照護欄改寫，見各欄註解。
     */
    unique: {
      lead: "算扣廣告後貢獻，Excel 和多數儀表板都做得到。EC ProfitLens 的設計繞著算完之後的場景：週會上有人指著一個數字問這怎麼來的、所以要怎麼做。它在三件事上刻意和一般做法不同，底下還有一個前提。",
      /** 每一項四段的欄名（前提沒有「一般做法」）；where 沿用 v4.1。 */
      fields: { before: "一般做法", after: "在這裡", meaning: "對你的意義" },
      /** 每一項下方連到功能區頁的那一行的名稱。 */
      where: "在哪裡看得到",
      items: {
        traceable: {
          title: "每個數字都經得起追問",
          before: "儀表板給一個總數，要核對只能回去翻原始檔；拆解加起來常對不上總差額，缺的資料默默變成 0。",
          after: [
            "點任一金額，或圖上的柱、點、格，打開{ui:evidence.sections.evidence}：到分的精確值、一層一層的算法，最底下的原始明細每一列都寫著 CSV 檔名與行號。",
            "兩期扣廣告後貢獻的差額拆成九項，加起來剛好等於總差額，附平衡檢核；金額以分為單位計算，畫面上的萬、元才四捨五入。",
            "缺的列不會當成 0，畫面寫「{ui:shell.status.missing}」；{ui:shell.nav.diagnosis.headline}把資料缺漏排在最前面。",
          ],
          meaning: "被追問時答案在畫面上，討論不用停在「下次確認」；拆解加得回去，不用解釋為什麼對不上。",
        },
        judgment: {
          title: "工具不替你下判斷",
          before: "給一個健康分數、一條預測曲線，或讓 AI 直接說該砍哪裡的預算；結論怎麼來的看不到，錯了也找不到原因。",
          after: [
            "{ui:shell.nav.diagnosis.headline}用固定規則檢查各通路與費用，{ui:overview.sections.impactLegend}，可能原因標為「待確認」；沒有健康分數，也沒有 AI 自評的信心分數。",
            /** 「才打平」依畫面用字補成「打平（扣廣告後貢獻 = 0）」（零貢獻門檻不單寫「打平」；D-V42-33）。 */
            "{ui:shell.nav.scenarios.headline}從本期實績出發，只算你填的銷量、折扣、物流費、廣告預算增減；銷量範圍固定在 −90% 到 +100%，不外推、不代填，並算出要賣到多少才打平（扣廣告後貢獻 = 0）、多少才維持現況。",
            "AI 不計算任何金額：所有金額由固定算法計算並有測試；公開示範站不使用 AI，計算與健檢照常可用。會議決議由人選，方案或資料改動後要重新確認。",
          ],
          meaning: "每個數字、每條健檢項目都看得出怎麼來的，沒有黑箱；判斷和責任留在人手上，那本來就是週會要做的事。",
        },
        loop: {
          title: "檢討直接開在工作台上，數字一路走到決議",
          before: "分析在儀表板、待辦在另一個工具、決議在{ui:shell.nav.meeting.headline}文件；三邊對不起來，下週也沒人回頭比對。",
          after: [
            /** 改寫稿的「一鍵加入待辦」：「一鍵」是語氣黑名單，改「可以直接」。 */
            "{ui:diagnosis.sections.diagnosisList}可以直接{ui:actions.buttons.addToActions}，帶著當時的數字與來源；待辦寫具體動作、負責人、期限、怎麼看成效、何時喊停，置頂三項會進一頁摘要。",
            "試算方案{ui:meeting.buttons.selectForMeeting}；{ui:meeting.sections.meetingAgenda}依會議固定的資料自動組成，{ui:shell.presentV3.enter}只留結論。{ui:meeting.buttons.finalizeMeeting}後紀錄固定、只能查看，下次會議自動和上次比較。",
            /** 「匯出 PDF」逐字是按鈕名（exports.buttons.exportPdf），改成「匯出成 PDF、…」。 */
            "複製純文字週會摘要貼進群組，或匯出成 PDF、Excel、PowerPoint、Markdown、CSV；一頁摘要有{ui:exports.variantsV3.names.standard}、{ui:exports.variantsV3.names.boss}、{ui:exports.variantsV3.names.client}。",
          ],
          /** 改寫稿的「決定有沒有兌現，下週開會時自動對帳」：系統不判斷兌現，下次議程列出上次決議與置頂待辦的狀態；「對帳」站內專指金額對帳（D-V42-33）。 */
          meaning: "從看到問題到記下決定不用換工具；決定做到哪裡，下次開會時自動列出上次決議與置頂待辦的狀態。",
        },
        premise: {
          title: "前提：為台灣多通路電商設計，資料不離開你的電腦",
          after: [
            "含稅報表換算成未稅（預設 5% 營業稅），原值與換算值都看得到；內建蝦皮、momo、PChome、91APP、Shopline、Cyberbiz、Meta、Google 的欄位預設，目前只有蝦皮訂單匯出以真實檔驗證，其他請自行確認對照。新台幣、台北時間。",
            "原始 CSV 只在瀏覽器裡讀取與計算，免登入、不上傳；要不要{ui:storage.buttons.saveLocal}由你決定，換電腦用備份檔。",
          ],
          meaning: "銷售與成本資料不用交給任何服務商就能開始用；不用申請帳號，30 秒就能用示範資料試。",
        },
      },
    },
    /**
     * 刻意不做的事（V42-G1 改寫稿 §5，取代 v4.1 的「這些做法的代價」一段）：引言、三點、結語。
     * sync 後附「相關說明：」連到匯入資料頁（src/components/guide/guide-hub-data.ts 的 GUIDE_TRADEOFF_LINKS）：改寫稿的「有整理工具說明 → /docs/ORDER_AGGREGATION.md」含箭頭字元（copy-style 棘輪 0），而且說明首頁的站內連結只有 /、/guide/{area}，整理工具說明的連結在匯入資料頁的「開始前」。
     */
    tradeoffs: {
      lead: "為了做到免登入、不上傳、每個數字可追到原始檔，EC ProfitLens 放掉了幾項便利。前兩項是目前的取捨，第三項是刻意的設計。",
      items: {
        sync: "不自動同步：資料要自己從各平台匯出，訂單明細要先整理成每日資料（整理工具的說明在{ui:shell.buttons.importData}這一頁）。",
        accounts: "沒有帳號系統：沒有多人帳號、提醒通知，也沒有手機 App（手機瀏覽器可以用）；一次一人操作，開會時共看一個畫面。",
        judgment: "不預測、不打分數：試算只算你填的假設，健檢只排影響金額；想要「系統直接告訴我該怎麼做」的人，這裡不會滿意。",
      },
      closing: "如果你需要的是自動串接後台、多人協作的雲端系統，它目前不是那個工具。",
    },
    /** 30 秒上手（GUIDE_CONTENT §1.5）；每一步的連結在 src/application/guide.ts 的 GUIDE_QUICKSTART。V42-G1：4 步之前加一行引言，四步逐字沿用 v4.1。 */
    quickstart: {
      lead: "不用登入、不用準備資料；示範資料是虛構的合成資料。",
      steps: {
        step1: "開啟工作台，按{ui:shell.buttons.loadDemo}。",
        step2: "先讀最上面的{ui:overview.snapshotUi.heading}與關鍵數字，再看{ui:overview.sections.topThree}。",
        step3: "點任一數字或{ui:evidence.buttons.viewEvidence}，在{ui:evidence.sections.evidence}看算法、檔名與行號；標題下一行是到分的精確值。",
        step4: "要用自己的資料，看{ui:shell.buttons.importData}這一頁的說明。",
      },
    },
    /** 功能區目錄的分組標題（GUIDE_CONTENT §1.6）：中間四組沿用側欄分組。 */
    groups: {
      start: "開始使用",
      results: "{ui:shell.sidebarV3.groups.results}",
      causes: "{ui:shell.sidebarV3.groups.causes}",
      decisions: "{ui:shell.sidebarV3.groups.decisions}",
      data: "{ui:shell.sidebarV3.groups.data}",
      tools: "跨頁工具",
    },
    /**
     * 11 個功能區（D-V41-19；代號＝src/application/guide.ts 的 GUIDE_AREA_CODES）的標題。和介面字串相同的部分一律引用。列入 L1。
     * ── V41-2a 錨點：start、import、overview、diagnosis、products 的功能區頁（GUIDE_CONTENT §2.1–2.5）。每區 answers（這頁回答什麼；也是說明首頁目錄卡片的一句與 metadata description）、
     * before（開始前：使用者要先做的操作）、steps.{key}.{title, body, alt, caption}（key 與截圖代號在 GUIDE_AREA_STEPS；title 列入 L1、動詞開頭；body 的 {ui:…} 渲染成粗體；
     * alt 寫畫面上看得到什麼、強調框框住哪裡（PRD §3.6；沒有強調框的截圖只寫前者）；caption 是這一步的結果，頁面另起一行加資料來源註記）、notes（要注意，≤ 3 點）。不寫示範資料的數字。
     */
    areas: {
      start: {
        title: "開始使用：看懂畫面與期間",
        answers: "第一次打開工作台，要先看哪裡、怎麼換頁、怎麼換期間。",
        before: "不需要任何資料。",
        steps: {
          load: {
            title: "{ui:shell.buttons.loadDemo}",
            body: "在首頁按{ui:shell.buttons.loadDemo}。右下角會問「{ui:storage.autoSave.promptTitle}」，先按{ui:storage.autoSave.decline}；之後隨時可以在頂欄{ui:shell.buttons.save}改。",
            alt: "首頁的「{ui:shell.buttons.loadDemo}」與「{ui:shell.buttons.importData}」兩個按鈕，下方是{ui:empty.stateV3.filesHeading}；強調框框住「{ui:shell.buttons.loadDemo}」。",
            caption: "載入後，每一頁都用示範資料計算。",
          },
          nav: {
            title: "認識側欄四組",
            body: "側欄分成{ui:shell.sidebarV3.groups.results}、{ui:shell.sidebarV3.groups.causes}、{ui:shell.sidebarV3.groups.decisions}、{ui:shell.sidebarV3.groups.data}四組，由上往下就是一次檢討的順序。",
            alt: "側欄的四組頁面，從{ui:shell.nav.overview.headline}到{ui:shell.nav.data.headline}；強調框框住四個分組標題。",
            caption: "點側欄的頁名，就換到那一頁。",
          },
          period: {
            title: "換期間與通路",
            body: "期間列寫著本期對比上期與天數。{ui:shell.sections.presetGroup}（例如{ui:shell.periods.presets.last4w}）按一下就套用；要自己選日期，按{ui:shell.periodBarV3.custom}，改好再按{ui:shell.buttons.apply}。{ui:shell.periodBar.filter.channel}選單可以只看一個通路。",
            alt: "期間列左邊是{ui:shell.sections.presetGroup}，右邊寫著本期與上期的日期、天數；強調框框住{ui:shell.sections.presetGroup}。",
            caption: "套用後，每一頁都改用新的期間與通路。",
          },
          mobile: {
            title: "在手機上換頁與換期間",
            body: "手機底部是{ui:shell.mobileNav.tabs.overview}、{ui:shell.mobileNav.tabs.diagnosis}、{ui:shell.mobileNav.tabs.actions}、{ui:shell.mobileNav.tabs.meeting}四個分頁，其他頁在{ui:shell.mobileNav.more}。期間收成一個按鈕，按下打開{ui:shell.periodBarV3.sheetTitle}。",
            alt: "手機畫面底部的分頁列，「{ui:shell.mobileNav.more}」面板列出其他頁與工具；強調框框住「{ui:shell.mobileNav.more}」面板。",
            caption: "{ui:shell.mobileNav.more}裡是底部分頁以外的頁面與工具。",
          },
        },
        notes: ["資料只在這個瀏覽器分頁裡；重新整理前要保留，請先{ui:storage.buttons.saveLocal}或{ui:storage.buttons.downloadBackup}。"],
      },
      import: {
        title: "{ui:shell.buttons.importData}",
        answers: "怎麼把自己的三份 CSV 放進來，含稅報表怎麼處理，出錯時怎麼看。",
        before: "準備三份日粒度 CSV（{ui:empty.stateV3.fileDescriptions.sales}；{ui:empty.stateV3.fileDescriptions.costs}；{ui:empty.stateV3.fileDescriptions.ads}）。空白範本在頂欄{ui:shell.topbarV3.export}的{ui:exports.downloads.templatesHeading}。訂單明細要先整理成每日資料。",
        /** 「開始前」後附的連結文字（連到 /docs/ORDER_AGGREGATION.md，src/application/guide.ts 的 GUIDE_AREA_BEFORE_LINKS）。 */
        beforeLink: "{ui:importWizard.orderLevelLink}",
        steps: {
          files: {
            title: "{ui:importWizard.steps.0}",
            body: "按{ui:shell.buttons.importData}，把三份檔案拖進來，或點選檔；系統依檔名自動歸位，看不出來的會請你指定。",
            alt: "匯入精靈第 1 步，三份檔案已經放進對應的位置；強調框框住上方的拖放區。",
            caption: "三份檔案都讀取完成、沒有被擋下，才能到{ui:importWizard.steps.1}。",
          },
          mapping: {
            title: "{ui:importWizard.steps.1}",
            body: "系統先自動對照欄名，已對上的收合起來；你只要確認沒對上的欄。",
            alt: "欄位對照，三份檔案的欄名都已自動對上，各收合成一列；強調框框住第一份檔案的收合列。",
            caption: "必填欄位都對上，才能到{ui:importWizard.steps.2}。",
          },
          basis: {
            title: "{ui:importWizard.steps.2}",
            body: "平台報表的金額多半含稅，選{ui:importWizard.basis.inclusive}；系統逐列換算成未稅，原值和換算值都看得到。確認期間後，按{ui:importWizard.confirmAndCheck}。",
            alt: "金額基準選了含稅，下方是建議的上期與本期；強調框框住含稅選項。",
            caption: "按下後，系統檢核全部資料，再到{ui:importWizard.steps.3}。",
          },
          review: {
            title: "{ui:importWizard.steps.3}",
            body: "看狀態一行與資料問題表：每個問題都有檔名、欄位和修法，對得到原始列的另附行號。沒有阻擋的問題就按{ui:importWizard.commit}。",
            alt: "第 4 步的檢核結果與對帳表，所有來源都相符；強調框框住「{ui:importWizard.commit}」按鈕。",
            caption: "按下後，這批資料才取代目前的資料。",
          },
          issues: {
            title: "有問題時怎麼看",
            body: "被擋下的檔案會在問題表列出原因與修法；修好原始檔再重新選檔。套用後，問題也會留在{ui:shell.nav.data.headline}頁。",
            alt: "資料問題表，寫著哪個檔、哪一天哪個通路少了廣告列；強調框框住第一列的檔名。",
            caption: "每個問題都寫出檔名與修法；缺列的問題寫出哪一天、哪個通路。",
          },
        },
        notes: [
          "{ui:importWizard.privacyNote}",
          "缺的列不會當成 0，畫面會寫「{ui:shell.status.missing}」。",
          "九個來源預設中，只有蝦皮訂單匯出以真實檔驗證過，其他請自己確認對照。",
        ],
      },
      overview: {
        title: "{ui:shell.nav.overview.headline}",
        answers: "{ui:shell.nav.overview.explain}。",
        before: "先在首頁按「{ui:shell.buttons.loadDemo}」。",
        steps: {
          snapshot: {
            title: "先讀{ui:overview.snapshotUi.heading}與關鍵數字",
            body: "最上面的{ui:overview.snapshotUi.heading}用一句話說本期多賺或少賺多少；下面五個關鍵數字依序是淨營收、商品毛利、扣廣告前貢獻、扣廣告後貢獻、扣廣告後貢獻率，每個都有上期與差額。",
            alt: "{ui:shell.nav.overview.headline}上方，一句話寫本期與上期的差額，下面五個關鍵數字；強調框框住這一句話。",
            caption: "五個關鍵數字都附上期與差額。",
          },
          "top-three": {
            title: "看{ui:overview.sections.topThree}",
            body: "{ui:overview.sections.topThree}依影響金額列出要先處理的事，按{ui:evidence.buttons.viewEvidence}或到{ui:shell.nav.diagnosis.headline}。",
            alt: "{ui:overview.sections.topThree}，每一項寫差額、說明和影響金額，右側是「{ui:evidence.buttons.viewEvidence}」與「{ui:actions.buttons.addToActions}」；強調框框住第一項。",
            caption: "按{ui:evidence.buttons.viewEvidence}，打開這一項的{ui:evidence.sections.evidence}。",
          },
          bridge: {
            title: "用瀑布圖看差額從哪裡來",
            body: "{ui:overview.sections.bridge}把兩期的扣廣告後貢獻差額拆成九項，加起來剛好等於總差額。圖的標題就是結論；旁邊的表可以逐項核對，點任一柱或數字，打開{ui:evidence.sections.evidence}。",
            alt: "{ui:overview.sections.bridge}的瀑布圖，從上期扣廣告後貢獻一項一項加減到本期；強調框框住減少最多的一項。",
            caption: "九項差額加起來，等於兩期扣廣告後貢獻的差額。",
          },
          trend: {
            title: "看趨勢、各通路與{ui:overview.sections.assistKpis}",
            body: "往下是{ui:overview.sections.trend}、各通路兩期比較與{ui:overview.sections.assistKpis}（含{ui:assist.breakevenV3.label}）。每張圖下方都能展開資料表。",
            alt: "{ui:overview.sections.trend}的折線圖。",
            caption: "趨勢圖每週一個點，畫出淨營收與扣廣告後貢獻。",
          },
          "bridge-mobile": {
            title: "手機上看瀑布圖",
            body: "手機上拆解表在前，每一項旁邊有一條差額條；瀑布圖可以左右捲動。",
            alt: "手機上的{ui:overview.sections.bridge}表，每一列旁邊有差額條；強調框框住減少最多那一列的差額條。",
            caption: "手機上先看表，差額條標出每一項的增減。",
          },
        },
        notes: [
          "差額說明發生了什麼，原因還需要確認；扣廣告後貢獻沒有扣固定費與所得稅，見{ui:shell.buttons.basis}。",
          "{ui:overview.pnlV3.advancedSummary}收在頁面下方。",
        ],
      },
      diagnosis: {
        title: "{ui:shell.nav.diagnosis.headline}",
        answers: "{ui:shell.nav.diagnosis.explain}。",
        before: "先在首頁按「{ui:shell.buttons.loadDemo}」。",
        steps: {
          list: {
            title: "讀{ui:diagnosis.sections.diagnosisList}",
            body: "{ui:diagnosis.sections.diagnosisList}{ui:overview.sections.impactLegend}，資料缺漏排最前。每一項寫哪個通路、哪項費用、影響多少，展開看{ui:diagnosis.sections.cause}與{ui:diagnosis.sections.nextStep}。",
            alt: "{ui:shell.nav.diagnosis.headline}的結果清單，每一項有影響金額條；強調框框住第一項的影響金額條。",
            caption: "資料缺漏排最前，其餘{ui:overview.sections.impactLegend}。",
          },
          "add-action": {
            title: "把一項{ui:actions.buttons.addToActions}",
            body: "決定要追的項目，按{ui:actions.buttons.addToActions}；它會帶著當時的數字與來源進到待辦。",
            alt: "展開的健檢項目，下一步建議下方是「{ui:actions.buttons.addToActions}」按鈕；強調框框住這個按鈕。",
            caption: "加入後，這一項會出現在{ui:shell.nav.actions.headline}頁。",
          },
          share: {
            title: "看{ui:diagnosis.chartsV4.share.section}",
            body: "{ui:diagnosis.chartsV4.share.section}把每個通路每 100 元淨營收分成商品成本、通路費用合計、廣告費與剩下的錢；虧損的通路超過 100 的部分會標出來。",
            alt: "每個通路一條堆疊條，寫著每 100 元扣完廣告剩多少。",
            caption: "每條代表一個通路的 100 元淨營收。",
          },
          heat: {
            title: "找出哪一天出問題",
            body: "日 × 通路的月曆熱表標出扣廣告後貢獻為負的日子；用 Tab 進到表裡，方向鍵移動，按 Enter 開當天的明細。",
            alt: "各通路每天的扣廣告後貢獻月曆，負的日子有顏色；強調框框住標題寫的最差那一天。",
            caption: "有顏色的格子，就是扣廣告後貢獻為負的日子。",
          },
        },
        notes: ["可能原因是待確認的假說；健檢用固定規則，不打分數。", "AI 解釋在公開示範站沒有開啟。"],
      },
      products: {
        title: "{ui:shell.nav.products.headline}",
        answers: "{ui:shell.nav.products.explain}；{ui:products.pageV3.description}。",
        before: "先在首頁按「{ui:shell.buttons.loadDemo}」。",
        steps: {
          variance: {
            title: "看減少最多與增加最多的商品",
            body: "最上面的圖列出商品毛利兩期差額減少最多與增加最多的商品；旁邊的表是{ui:products.sections.productTopBottom}前 10 名。",
            alt: "商品毛利兩期差額圖，上半部是減少最多的商品；強調框框住減少最多的那一列。",
            caption: "減少最多的商品排在最上面。",
          },
          table: {
            title: "在完整表裡排序、篩選與匯出",
            body: "{ui:products.highlights.fullTable}表可以用{ui:products.pageV3.sortLabel}換排序、搜尋商品，{ui:products.pageV3.exportPage}匯出目前顯示的商品。",
            alt: "{ui:products.highlights.fullTable}表，上方是品類、搜尋、{ui:products.pageV3.sortLabel}與欄位選單；強調框框住{ui:products.pageV3.sortLabel}選單。",
            caption: "{ui:products.pageV3.exportPage}只匯出目前顯示的商品。",
          },
          pareto: {
            title: "有商品毛利為負的商品時",
            body: "有商品毛利為負的商品時，會多一張累計圖，看前幾個商品佔了多少。",
            alt: "商品毛利為負的商品由大到小排列，右側是累計佔比。",
            caption: "看累計佔比，就知道前幾個商品佔了多少。",
          },
        },
        notes: ["這一頁只寫「商品毛利為負」，那是還沒扣通路費用與廣告的結果。"],
      },
      // ── V41-2b 錨點：scenarios、actions、meeting、data、evidence、export 的功能區頁（GUIDE_CONTENT §2.6–2.11；欄位同 V41-2a）。
      // before 寫使用者要先做的操作（S1 是載入示範資料；S6、S7 寫出具體步驟，相關功能區的連結在 src/application/guide.ts 的 GUIDE_AREA_BEFORE_AREAS）。
      // alt 依 verification/guide-media/baseline/ 的實際截圖寫（畫面上看得到什麼＋強調框框住的那一個元素；PRD §3.6）。
      scenarios: {
        title: "{ui:shell.nav.scenarios.headline}",
        answers: "{ui:shell.nav.scenarios.explain}。",
        before: "先在首頁按「{ui:shell.buttons.loadDemo}」。第 3、4 步要先有試算過的方案：照第 1、2 步{ui:scenarios.buttons.applyTemplate}「{ui:scenarios.presets.items.keep.name}」，再按{ui:scenarios.buttons.calculate}。第 3 步的截圖另按{ui:scenarios.buttons.addScenario}，第二個方案{ui:scenarios.buttons.applyTemplate}「{ui:scenarios.presets.items.cut_ads_half.name}」並試算。",
        steps: {
          setup: {
            title: "選通路與範本",
            body: "每個方案針對一個通路。可以從範本開始（{ui:scenarios.buttons.applyTemplate}），或按{ui:scenarios.buttons.addScenario}。",
            alt: "{ui:shell.nav.scenarios.headline}頁上方是{ui:scenarios.form.channel}選單與{ui:scenarios.sections.scenarioBaseline}，下方方案 1 有{ui:scenarios.decision.planName}與{ui:scenarios.form.presetSelect}選單；強調框框住「{ui:scenarios.buttons.addScenario}」。",
            caption: "{ui:scenarios.buttons.applyTemplate}後，假設欄位會帶入範本的值。",
          },
          inputs: {
            title: "填假設並試算",
            body: "填{ui:scenarios.inputs.volume.label}、{ui:scenarios.inputs.discount.label}、{ui:scenarios.inputs.fulfillmentUnit.label}、{ui:scenarios.inputs.adSpend.label}與{ui:scenarios.inputs.oneOff.label}；不變的填 0（{ui:scenarios.buttons.applyTemplate}「{ui:scenarios.presets.items.keep.name}」會把五格都填 0）。勾選{ui:scenarios.inputs.acceptAssumptions}後按{ui:scenarios.buttons.calculate}。",
            alt: "方案的五個假設欄位，下方是確認勾選框與「{ui:scenarios.buttons.calculate}」按鈕；強調框框住「{ui:scenarios.buttons.calculate}」按鈕。",
            caption: "按下後，方案欄寫出試算後的扣廣告後貢獻。",
          },
          compare: {
            title: "並排比較方案",
            body: "{ui:scenarios.chartsV4.variance.section}把各方案試算後的扣廣告後貢獻和現況比；方案之間不能相加。",
            alt: "{ui:scenarios.chartsV4.variance.section}的長條圖，下方的明細表逐項列出本期與每個方案的金額。",
            caption: "每一條是一個方案和現況的差額。",
          },
          threshold: {
            title: "看{ui:scenarios.sections.scenarioBreakeven}，再{ui:meeting.buttons.selectForMeeting}",
            body: "{ui:scenarios.sections.scenarioBreakeven}填三個銷量假設，看兩個門檻落在哪裡；決定要討論的方案按{ui:meeting.buttons.selectForMeeting}。",
            alt: "「{ui:meeting.buttons.selectForMeeting}」下方展開{ui:scenarios.sections.scenarioBreakeven}：打平與維持現況兩個門檻，下面的圖用空心圈標出兩個門檻、實心點 A、B、C 標出三個假設的位置，橫軸是銷量增減；強調框框住「{ui:meeting.buttons.selectForMeeting}」。",
            caption: "選入後，這個方案會帶進{ui:shell.nav.meeting.headline}。",
          },
        },
        notes: ["這是「如果這樣做會變多少」的試算，不是預測；銷量範圍固定在 −90% 到 +100%，系統不外推、不代填。"],
      },
      actions: {
        title: "{ui:shell.nav.actions.headline}",
        answers: "{ui:shell.nav.actions.explain}。",
        before: "先在首頁按「{ui:shell.buttons.loadDemo}」，再到{ui:shell.nav.diagnosis.headline}把第一項{ui:actions.buttons.addToActions}。",
        steps: {
          board: {
            title: "看看板或清單",
            body: "{ui:actions.sections.actionBoard}依狀態排列；可以切到{ui:actions.board.viewList}。頁首的計數條顯示多少項快到期。",
            alt: "上方是到期分布的計數條，下方的{ui:actions.board.viewBoard}依狀態分成{ui:actions.form.statuses.not_started}、{ui:actions.form.statuses.in_progress}、{ui:actions.form.statuses.blocked}、{ui:actions.form.statuses.done}四欄；強調框框住「{ui:actions.board.viewBoard}」「{ui:actions.board.viewList}」切換鈕。",
            caption: "看板依執行狀態分欄，每張卡片是一項待辦。",
          },
          edit: {
            title: "編輯一項待辦",
            body: "按卡片上的{ui:actions.pageV3.edit}打開面板，寫{ui:actions.form.step}、{ui:actions.form.owner}、{ui:actions.form.due}、{ui:actions.form.metric}與{ui:actions.form.stop}；跟廣告有關的可以標{ui:actions.adDecisionV3.field}。",
            alt: "待辦的編輯面板，有{ui:actions.form.problem}、{ui:actions.form.step}、{ui:actions.form.owner}、{ui:actions.form.metric}、{ui:actions.form.due}、{ui:actions.form.stop}等欄位；強調框框住{ui:actions.adDecisionV3.field}欄位。",
            caption: "改好的負責人、期限與狀態，會寫在面板標題下方與看板的卡片上。",
          },
          pin: {
            title: "置頂最重要的三項",
            body: "按卡片標題左邊的星號（{ui:actions.buttons.pin}）；{ui:actions.workbench.intro}",
            alt: "{ui:actions.form.statuses.not_started}欄的待辦卡片，標題左邊的星號是「{ui:actions.buttons.pin}」按鈕；強調框框住這個按鈕。",
            caption: "置頂的項目會列入一頁摘要。",
          },
        },
        notes: ["從{ui:diagnosis.sections.diagnosisList}或會議決議新增的待辦，會帶著當時的數字；資料更新後可以按{ui:actions.buttons.rebind}。"],
      },
      meeting: {
        title: "{ui:shell.nav.meeting.headline}與投影",
        answers: "{ui:shell.nav.meeting.explain}。",
        before: "先在首頁按「{ui:shell.buttons.loadDemo}」；到{ui:shell.nav.scenarios.headline}試算一個方案並按{ui:meeting.buttons.selectForMeeting}，再到{ui:shell.nav.diagnosis.headline}把第一項{ui:actions.buttons.addToActions}。",
        steps: {
          agenda: {
            title: "照議程開會",
            body: "{ui:meeting.sections.meetingAgenda}依會議固定的資料與範圍自動組成；點數字打開{ui:evidence.sections.evidence}。",
            alt: "{ui:shell.nav.meeting.headline}的{ui:meeting.sections.meetingAgenda}：第 1 項{ui:meeting.record.agenda.kpis}與第 2 項{ui:meeting.record.agenda.priorities}，左側是議程目錄；強調框框住議程目錄。",
            caption: "點議程目錄的一項，就跳到那一項。",
          },
          decision: {
            title: "寫決議",
            body: "在頁首的{ui:meeting.form.decision}選單選這次的決定，理由寫在{ui:meeting.form.notes}；{ui:meeting.form.decisionNote}。",
            alt: "會議頁首的{ui:meeting.form.decision}選單（目前是「{ui:meeting.form.decisions.draft}」），右邊是「{ui:meeting.buttons.finalizeMeeting}」「{ui:overview.snapshotUi.copy}」「{ui:meeting.pageV3.exportMenu}」；強調框框住{ui:meeting.form.decision}選單。",
            caption: "決議跟著這次會議，{ui:meeting.buttons.finalizeMeeting}時一起存入{ui:meeting.page.history}。",
          },
          present: {
            title: "投影給大家看",
            body: "按{ui:shell.presentV3.enter}，字放大、只留結論；在{ui:shell.nav.overview.headline}與{ui:shell.nav.meeting.headline}之間可以直接切換，按 Esc 或{ui:shell.presentV3.exit}離開。",
            alt: "{ui:shell.presentV3.enter}中的{ui:shell.nav.overview.headline}：一句話結論、五個關鍵數字、{ui:overview.sections.topThree}與{ui:overview.sections.bridge}的瀑布圖，右上是「{ui:shell.nav.meeting.headline}」與「{ui:shell.presentV3.exit}」；強調框框住「{ui:shell.presentV3.exit}」。",
            caption: "投影時字放大，只留下結論。",
          },
          finalize: {
            title: "{ui:meeting.buttons.finalizeMeeting}並匯出",
            body: "按{ui:meeting.buttons.finalizeMeeting}並確認；{ui:meeting.page.finalizeHint}下次會自動{ui:meeting.sections.meetingCompare}。匯出在頁首的{ui:meeting.pageV3.exportMenu}；已結束的會議也可以在{ui:meeting.page.history}按{ui:exports.buttons.exportMarkdown}。",
            alt: "{ui:meeting.page.history}出現剛結束的會議，右邊是「{ui:exports.buttons.exportMarkdown}」與「{ui:meeting.page.removeMeeting}」；強調框框住「{ui:exports.buttons.exportMarkdown}」。",
            caption: "結束後，這次會議只能查看；下次會議會和它比較。",
          },
          copy: {
            title: "{ui:overview.snapshotUi.copy}",
            body: "頂欄{ui:shell.topbarV3.export}的{ui:overview.snapshotUi.copy}：{ui:exports.menuV3.descriptions.copySummary}。",
            alt: "{ui:shell.topbarV3.export}選單的{ui:exports.menuV3.groupMeeting}組：「{ui:overview.snapshotUi.copy}」，下方寫著{ui:exports.menuV3.descriptions.copySummary}；強調框框住這一項。",
            caption: "按下後，週會摘要的文字就複製好了。",
          },
        },
        notes: ["決議由人決定；方案或資料改動後，要先{ui:meeting.buttons.updateMeetingSource}才能{ui:meeting.buttons.finalizeMeeting}。"],
      },
      data: {
        title: "{ui:shell.nav.data.headline}",
        answers: "{ui:shell.nav.data.explain}。",
        before: "先在首頁按「{ui:shell.buttons.loadDemo}」。第 2、3 步的截圖是缺了廣告列的合成資料；資料有缺列或問題時，才會出現這些標示。",
        steps: {
          scope: {
            title: "確認範圍與金額基準",
            body: "最上方寫資料涵蓋到哪天、金額基準，{ui:data.sections.dataScope}與{ui:data.sections.dataPreprocessing}寫匯入時做了哪些換算。",
            alt: "{ui:shell.nav.data.headline}頁上方的狀態列，寫著資料到哪天、涵蓋的日期、檔案數與金額基準；強調框框住這一行狀態列。",
            caption: "狀態列寫出資料到哪天與金額基準。",
          },
          coverage: {
            title: "看{ui:data.chartsV4.coverage.section}",
            body: "{ui:data.chartsV4.coverage.section}畫出三份檔案各自涵蓋的日期；虛線框是缺列的日子，點一下會篩到問題表。",
            alt: "{ui:data.chartsV4.coverage.section}，廣告檔有一天缺列，以虛線框標出；強調框框住這個虛線框。",
            caption: "缺列的日子用虛線框標出。",
          },
          issues: {
            title: "處理資料問題",
            body: "{ui:data.sections.dataIssues}列出每個問題的檔名、欄位與修法，對得到原始列的另附行號；{ui:data.chartsV4.issues.section}依檔案和原因分組，點格子就篩選。完整清單按{ui:exports.downloads.issuesCsv}。",
            alt: "{ui:data.sections.dataIssues}：上方的{ui:data.chartsV4.issues.section}只有{ui:importWizard.files.ads}那一列有數字，下方的問題表寫出檔名、欄位、問題與修法；強調框框住「{ui:exports.downloads.issuesCsv}」。",
            caption: "每個問題都寫出檔名與修法；點分布表的格子，問題表就只留那一類。",
          },
          preview: {
            title: "預覽來源檔與下載範本",
            body: "{ui:data.sections.dataPreview}顯示每份檔案的前 10 列，不受期間與通路影響；也可以在這裡下載範本。",
            alt: "{ui:data.sections.dataPreview}，第一份檔案{ui:importWizard.files.sales}已展開，顯示前 10 列；另外兩份檔案收合著。",
            caption: "預覽顯示原始檔的欄位與前 10 列。",
          },
        },
        notes: ["缺的列不會當成 0；缺資料的指標會顯示「{ui:shell.status.missing}」。"],
      },
      evidence: {
        title: "{ui:evidence.sections.evidence}、{ui:shell.buttons.basis}",
        answers: "某個數字是怎麼算出來的、來自哪個檔哪一行；每個名詞是什麼意思。",
        before: "先在首頁按「{ui:shell.buttons.loadDemo}」。",
        steps: {
          drawer: {
            title: "打開{ui:evidence.sections.evidence}",
            body: "點任一數字、圖上的柱或格，或按{ui:evidence.buttons.viewEvidence}，右側會打開{ui:evidence.sections.evidence}：金額下方是到分的精確值，再下面是一層一層的算法。",
            alt: "扣廣告後貢獻的{ui:evidence.sections.evidence}抽屜：金額下方是到分的精確值，再下面是{ui:evidence.ladderTitle}與一層一層的算法表；強調框框住精確值。",
            caption: "從到分的精確值，一層一層拆到組成項目。",
          },
          sources: {
            title: "追到{ui:evidence.sourcesTitle}",
            body: "{ui:evidence.ladderNote}在{ui:evidence.sourcesTitle}可以{ui:evidence.searchLabel}，每列寫 CSV 檔名與行號。",
            alt: "{ui:evidence.sourcesTitle}分成{ui:evidence.sourceTabs.sales}、{ui:evidence.sourceTabs.costs}、{ui:evidence.sourceTabs.ads}三個分頁，旁邊是{ui:evidence.searchLabel}；每一列寫出檔名與行號、日期、通路與欄位數值；強調框框住第一列的檔名與行號。",
            caption: "每一列都對得到原始 CSV 的檔名與行號。",
          },
          basis: {
            title: "查{ui:shell.buttons.basis}與名詞",
            body: "頂欄{ui:shell.buttons.basis}列出九條算法規則，下方的{ui:glossary.heading}輸入舊名也找得到新名。",
            alt: "{ui:shell.buttons.basis}對話框，上方是九條規則，下方是{ui:glossary.heading}與{ui:glossary.searchLabel}欄；強調框框住{ui:glossary.heading}標題。",
            caption: "在{ui:glossary.heading}輸入舊名，也找得到現在的名稱。",
          },
        },
        notes: ["AI 不計算任何金額；所有金額由固定的算法計算並有測試。"],
      },
      export: {
        title: "匯出、儲存與備份",
        answers: "怎麼把結果帶走、怎麼保留工作、怎麼刪掉這台電腦上的資料。",
        before: "先在首頁按「{ui:shell.buttons.loadDemo}」；到{ui:shell.nav.scenarios.headline}試算一個方案並按{ui:meeting.buttons.selectForMeeting}，再到{ui:shell.nav.diagnosis.headline}把第一項{ui:actions.buttons.addToActions}。",
        steps: {
          export: {
            title: "{ui:shell.topbarV3.export}",
            body: "頂欄{ui:shell.topbarV3.export}分成{ui:shell.sections.downloadCurrentView}、{ui:meeting.sections.meetingSummary}、{ui:shell.sections.downloadDecision}、{ui:exports.menuV3.groupMeeting}、{ui:exports.downloads.templatesHeading}五組；一頁摘要有{ui:exports.variantsV3.names.standard}、{ui:exports.variantsV3.names.boss}、{ui:exports.variantsV3.names.client}。",
            alt: "{ui:shell.topbarV3.export}選單分成五組，從{ui:shell.sections.downloadCurrentView}到{ui:exports.downloads.templatesHeading}；強調框框住一頁摘要的{ui:exports.variantsV3.names.standard}、{ui:exports.variantsV3.names.boss}、{ui:exports.variantsV3.names.client}三個版本。",
            caption: "一頁摘要先選版本，再選要下載的格式。",
          },
          save: {
            title: "{ui:storage.buttons.saveLocal}",
            body: "{ui:shell.buttons.save}選單的{ui:shell.topbarV3.storageGroups.local}：勾選同意後，每次修改會自動保存。",
            alt: "{ui:shell.buttons.save}選單分成{ui:shell.topbarV3.storageGroups.local}、{ui:shell.topbarV3.storageGroups.backup}與{ui:shell.topbarV3.storageGroups.danger}；{ui:shell.topbarV3.storageGroups.local}有同意的勾選框與「{ui:storage.buttons.saveLocal}」按鈕，強調框框住這一區。",
            caption: "同意後，資料只存在這個瀏覽器，不會上傳。",
          },
          backup: {
            title: "下載與讀入備份檔",
            body: "{ui:storage.buttons.downloadBackup}會把資料、方案、待辦與會議歷史存成一個檔；換電腦時從同一個選單讀入。",
            alt: "{ui:shell.buttons.save}選單的{ui:shell.topbarV3.storageGroups.backup}區：「{ui:storage.buttons.downloadBackup}」，旁邊是選取備份檔的欄位；強調框框住「{ui:storage.buttons.downloadBackup}」。",
            caption: "讀入備份檔時先看預覽，確認後才取代目前的資料。",
          },
          delete: {
            title: "{ui:storage.buttons.deleteLocal}",
            body: "{ui:shell.topbarV3.storageGroups.danger}的{ui:storage.buttons.deleteLocal}會刪掉存在這個瀏覽器的副本；已下載的檔案不受影響。",
            alt: "{ui:shell.buttons.save}選單的{ui:shell.topbarV3.storageGroups.danger}：「{ui:storage.buttons.deleteLocal}」與「{ui:storage.buttons.clear}」兩個按鈕；強調框框住「{ui:storage.buttons.deleteLocal}」。",
            caption: "刪除後，目前畫面上的資料與已下載的檔案都還在。",
          },
        },
        notes: ["{ui:storage.replacement.saveOptionsCaution}"],
      },
    },
    /**
     * ── V41-3 錨點：3 支無聲示範影片（D-V41-6＝A；GUIDE_CONTENT §3；代號與 cue 順序＝src/application/guide.ts 的 GUIDE_VIDEOS）。
     * title：影片的短名稱（影片上方的圖說，也是 <video> 的可及名稱）。cues.{key}：每個 cue 一句字幕，寫影片在那一段做的事，與功能區步驟同義但較短；
     * 介面字串一樣用 {ui:…}。字幕檔 public/guide/video/{id}.vtt 與影片下方的逐字稿 <ol> 都由這裡產生（{ui:…} 換成純文字）。不寫示範資料的數字。
     */
    videos: {
      // S0 → S1：載入示範資料 → 讀本期一句話與關鍵數字 → 捲到貢獻變化拆解 → 點扣廣告後貢獻打開計算與來源 → 關閉。
      "start-30s": {
        title: "示範影片：30 秒上手",
        cues: {
          load: "在首頁按「{ui:shell.buttons.loadDemo}」。",
          snapshot: "先讀最上面的{ui:overview.snapshotUi.heading}與五個關鍵數字。",
          bridge: "往下捲到{ui:overview.sections.bridge}，看兩期差額拆成哪幾項。",
          evidence: "點扣廣告後貢獻的金額，打開{ui:evidence.sections.evidence}，看算法與到分的精確值。",
          close: "關閉{ui:evidence.sections.evidence}，回到{ui:shell.nav.overview.headline}。",
        },
      },
      // S3：選三個檔 → 確認欄位對照 → 選含稅、確認期間 → 看檢核結果 → 套用，回到經營總覽。
      "import-wizard": {
        title: "示範影片：{ui:shell.buttons.importData}",
        cues: {
          files: "按「{ui:shell.buttons.importData}」，選三份檔案，系統依檔名自動歸位。",
          mapping: "在「{ui:importWizard.steps.1}」這一步確認欄名都已對上。",
          basis: "金額基準選含稅，再確認建議的上期與本期。",
          review: "開始檢核後，在「{ui:importWizard.steps.3}」這一步看檢核結果與含稅換算。",
          apply: "按「{ui:importWizard.commit}」，回到{ui:shell.nav.overview.headline}。",
        },
      },
      // S1 → S8：健檢第一項加入待辦 → 假設試算用維持現況試算並選入會議 → 會議紀錄寫決議 → 結束會議 → 開匯出選單。
      "meeting-weekly": {
        title: "示範影片：週會流程",
        cues: {
          action: "在{ui:shell.nav.diagnosis.headline}把第一項「{ui:actions.buttons.addToActions}」。",
          scenario: "到{ui:shell.nav.scenarios.headline}用「{ui:scenarios.presets.items.keep.name}」試算，再按「{ui:meeting.buttons.selectForMeeting}」。",
          decision: "到{ui:shell.nav.meeting.headline}，把這次的決議選為「{ui:meeting.form.decisions.adopted}」。",
          finalize: "按「{ui:meeting.buttons.finalizeMeeting}」並確認，這次會議存入{ui:meeting.page.history}。",
          export: "打開匯出選單，選要下載的格式。",
        },
      },
    },
  },
} as const;

export type GuideLabels = typeof guideLabels;
