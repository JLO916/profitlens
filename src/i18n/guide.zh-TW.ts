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
    /** 11 個功能區（D-V41-19；代號＝src/application/guide.ts 的 GUIDE_AREA_CODES）的標題。和介面字串相同的部分一律引用。列入 L1。 */
    areas: {
      start: { title: "開始使用：看懂畫面與期間" },
      import: { title: "{ui:shell.buttons.importData}" },
      overview: { title: "{ui:shell.nav.overview.headline}" },
      diagnosis: { title: "{ui:shell.nav.diagnosis.headline}" },
      products: { title: "{ui:shell.nav.products.headline}" },
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
