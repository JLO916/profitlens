"use client";

import { useCallback, useEffect, useState } from "react";
import { labels } from "@/i18n";
import { shouldShowWhatsNewAfterRestore, shouldShowWhatsNewOnLoad, whatsNewText, writeWhatsNewMark } from "@/application/whats-new";

/**
 * V3-2a（F23，PRD §8.9）：「這版改了什麼」提示的狀態。
 * 首次載入時偵測本機 IndexedDB 工作區（只讀，不建立資料庫）；還原備份後由呼叫端呼叫 onRestore。
 * 點「查看名詞對照」即記為已讀（下次載入不再出現），但這次保持顯示到使用者關閉，讓對話框關閉後焦點能回到連結。
 */
export function useWhatsNew() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    let live = true;
    void shouldShowWhatsNewOnLoad().then(show => { if (live && show) setVisible(true); });
    return () => { live = false; };
  }, []);
  // V3-9a 收尾：帶入還原來源的 schema_version（v5 是 v3 寫的備份，不再提示；沒給時沿用預設＝v4）。
  const onRestore = useCallback((schema?: string) => { if (shouldShowWhatsNewAfterRestore(schema)) setVisible(true); }, []);
  const markRead = useCallback(() => { writeWhatsNewMark("dismissed"); }, []);
  const dismiss = useCallback(() => { writeWhatsNewMark("dismissed"); setVisible(false); }, []);
  return { visible, onRestore, markRead, dismiss };
}

/** 頁首下方一行（40px）：說明文字、「查看名詞對照」連結（開啟指標定義並捲到 v2 舊名）、關閉。 */
export function WhatsNewNote({ onOpenGlossary, onDismiss }: { onOpenGlossary: () => void; onDismiss: () => void }) {
  return <div className="whats-new" role="status" data-testid="whats-new">
    <p>{whatsNewText()} <button type="button" className="text-button" aria-haspopup="dialog" onClick={onOpenGlossary}>{labels.shell.whatsNew.link}</button></p>
    <button type="button" className="button quiet whats-new-dismiss" aria-label={labels.shell.whatsNew.dismissAria} onClick={() => { onDismiss(); document.getElementById("main-content")?.focus({ preventScroll: true }); }}>{labels.shell.whatsNew.dismiss}</button>
  </div>;
}
