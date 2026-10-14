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
      /** <meta name="description"> 與分享摘要。 */
      description: "為什麼做這套服務、幫哪些人解決哪些問題、有什麼獨特性，以及 30 秒上手的步驟。",
      /** h1 下的一句話：直接引用 brand.description，不另寫口號（GUIDE_CONTENT §1.0）。 */
      intro: "{ui:brand.description}",
      /** 主要按鈕（同分頁連到工作台 /）；說明頁頂端外框也用這一條。 */
      openApp: "開啟工作台",
      /** 次要連結（頁內錨點 #quickstart）。 */
      startHere: "從 30 秒上手開始",
      /** 本頁目錄 <nav> 的可及名稱。 */
      tocAria: "本頁目錄",
    },
    /** 說明首頁的段落標題（h2；scope、tradeoffs 是 h3）。列入 L1：每個子句 ≤ 14 字。 */
    sections: {
      why: "為什麼做這套服務",
      who: "這套服務幫哪些人解決哪些問題？",
      scope: "適合誰，還沒涵蓋什麼",
      unique: "這套服務有什麼獨特性？",
      tradeoffs: "這些做法的代價",
      quickstart: "30 秒上手",
      areas: "各功能區的操作說明",
      // ── V41-2a 錨點：功能區頁的段落名稱（PRD §3.3）。answers、before 是 h1 下方摘要的欄名；notes、next 是 h2（頁內錨點 #notes、#next）。
      answers: "這頁回答什麼",
      before: "開始前",
      notes: "要注意",
      next: "下一步",
    },
    /** 為什麼做這套服務（GUIDE_CONTENT §1.1 產品口吻；D-V41-9＝A，使用者 2026-10-14 同意用草稿，H7 再確認）。 */
    why: {
      lead: "淨營收漲了，扣完平台抽成、物流與廣告，到底多賺還是少賺？",
      body: [
        "電商團隊每週開會，常卡在這一題。平台後台看得到成交金額和廣告 ROAS，平台抽成、商品成本和廣告費卻分散在不同報表；多半要有人把幾個後台的資料貼進 Excel 拼起來，數字被問到時，再回頭翻原始檔。",
        "EC ProfitLens 把這件事做成固定的流程：匯入銷售、通路費用、廣告三份每日報表，用同一套算法一層一層扣到扣廣告後貢獻，比較兩期差在哪裡，再把要做的事帶進週會。每個數字都能點開，看到公式、檔名和行號。",
      ],
      status: "示範資料是虛構的合成資料，還沒有真實商家的試用結果，所以這裡只說明它做什麼，不談成效。",
    },
    /** 這套服務幫哪些人解決哪些問題？（GUIDE_CONTENT §1.3）。每個角色一塊，fields 是各欄的名稱；「從哪裡開始」的功能區在 src/application/guide.ts 的 GUIDE_WHO。 */
    who: {
      lead: "同一份資料，老闆、主管和執行者看的深度不同；不用切換角色，往下展開就好。",
      fields: { ask: "想知道", before: "以前怎麼做", after: "在這裡怎麼做", start: "從哪裡開始" },
      roles: {
        boss: {
          role: "老闆",
          ask: "本期多賺還是少賺、差多少、最大一項是什麼。",
          before: "看得到成交金額和廣告 ROAS，扣完費用的結果要等人整理。",
          after: "打開{ui:shell.nav.overview.headline}，最上面是{ui:overview.snapshotUi.heading}和五個關鍵數字，下面一張瀑布圖拆出兩期差額；會後可以印{ui:exports.variantsV3.names.boss}。",
        },
        manager: {
          role: "主管（行銷、營運）",
          ask: "差額來自哪個通路、哪一項費用，下一步要調什麼。",
          before: "在幾個後台和 Excel 之間對數字，週會前趕一頁摘要。",
          after: "{ui:shell.nav.diagnosis.headline}把問題按影響金額排好；{ui:shell.nav.scenarios.headline}算出調廣告、折扣或物流費之後，扣廣告後貢獻會差多少；再{ui:actions.buttons.addToActions}、在{ui:shell.nav.meeting.headline}寫下決議，{ui:overview.snapshotUi.copy}。",
        },
        operator: {
          role: "執行者（分析、營運助理）",
          ask: "三份資料對不對，哪個檔、第幾行有問題，某個數字怎麼來的。",
          before: "各平台報表欄位不同，含稅、未稅混在一起；數字被問到時要回頭翻檔案。",
          after: "匯入精靈四步完成，含稅報表換算成未稅；錯誤訊息寫出檔名、第幾行和修法；任何數字都能開{ui:evidence.sections.evidence}，看到公式、檔名和行號。",
        },
      },
      also: "也適合代營運與電商顧問（一頁摘要有{ui:exports.variantsV3.names.client}），以及需要核對數字的財務人員。",
      fits: "適合單一公司、新台幣、賣實體商品，在官網與市集多通路經營的團隊。",
      notYet: "目前還沒涵蓋訂閱制、服務業、製造成本與多幣別，也沒有廣告歸因與訂單、顧客層級的指標。扣廣告後貢獻還沒扣固定費和所得稅，和公司淨利不同。",
    },
    /** 這套服務有什麼獨特性？（GUIDE_CONTENT §1.4；D-V41-11＝A：只寫可在產品裡驗證的做法）。「在哪裡看得到」的功能區在 src/application/guide.ts 的 GUIDE_UNIQUE。 */
    unique: {
      lead: "會算扣廣告後貢獻的工具不少；EC ProfitLens 把重點放在下面幾件事。",
      /** 每一項下方連到功能區頁的那一行的名稱。 */
      where: "在哪裡看得到",
      items: {
        evidence: { title: "每個數字都查得到出處", body: "點任一金額，或圖上的柱、點、格，都能看到公式、組成項目、CSV 檔名與行號；標題下一行是到分的精確值。" },
        bridge: { title: "兩期差額拆到分", body: "九項差額加起來剛好等於扣廣告後貢獻的差額，並附平衡檢核。金額以分為單位精確計算，畫面上的萬、元都從精確值四捨五入。" },
        rules: { title: "固定規則健檢，不打分數", body: "用固定規則檢查各通路與費用，{ui:overview.sections.impactLegend}，資料缺漏排最前；不用健康分數，也不用 AI 自評的信心分數。" },
        scenarios: { title: "試算只算你填的假設", body: "從這一期的實績出發，填銷量、折扣、物流費、廣告預算的增減，算出單一通路的扣廣告後貢獻；銷量範圍固定在 −90% 到 +100%，不外推、不代填。" },
        meeting: { title: "從數字走到週會決定", body: "{ui:diagnosis.sections.diagnosisList}可以{ui:actions.buttons.addToActions}，試算方案可以{ui:meeting.buttons.selectForMeeting}；{ui:meeting.buttons.finalizeMeeting}後紀錄就固定，下次自動和上次比較。匯出格式有 PDF、Excel、PowerPoint、Markdown 與 CSV。" },
        local: { title: "資料留在你的瀏覽器", body: "原始 CSV 只在瀏覽器裡處理，免登入、不上傳；要不要{ui:storage.buttons.saveLocal}，由你決定。公開示範站不使用 AI，所有計算與健檢照常可用。" },
        taiwan: { title: "照台灣多通路的習慣設計", body: "含稅報表換算成未稅（預設 5%）；內建蝦皮、momo、PChome、91APP、Shopline、Cyberbiz、Meta、Google 的欄位預設，目前只有蝦皮訂單匯出以真實檔驗證，其他請自行確認對照。" },
      },
    },
    tradeoffs: {
      body: "資料要自己從各平台匯出，訂單明細要先整理成每日資料；沒有自動同步、提醒、多人帳號或手機 App；一次一人操作，開會時共看。",
    },
    /** 30 秒上手（GUIDE_CONTENT §1.5）；每一步的連結在 src/application/guide.ts 的 GUIDE_QUICKSTART。 */
    quickstart: {
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
      scenarios: { title: "{ui:shell.nav.scenarios.headline}" },
      actions: { title: "{ui:shell.nav.actions.headline}" },
      meeting: { title: "{ui:shell.nav.meeting.headline}與投影" },
      data: { title: "{ui:shell.nav.data.headline}" },
      evidence: { title: "{ui:evidence.sections.evidence}、{ui:shell.buttons.basis}" },
      export: { title: "匯出、儲存與備份" },
    },
  },
} as const;

export type GuideLabels = typeof guideLabels;
