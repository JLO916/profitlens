"use client";

import type { ReactNode } from "react";
import type { AiCapability } from "@/application/ai-client";
import { fill, labels } from "@/i18n";
import { ShellIcon } from "./shell/shell-icon";

const copy = labels.diagnosis.aiCollapse;

/** 收合列的狀態字（與頂欄 AI 狀態同一套判斷：dashboard.tsx 的 aiHeadline），只是去掉重複的「AI」。 */
export function aiCollapseStatus(capability: AiCapability | null): string {
  if (capability === null || capability.reason === "STATUS_UNAVAILABLE") return copy.status.unknown;
  return capability.available ? copy.status.needsConsent : copy.status.off;
}

/**
 * V3-5（PRD §7.2 第 4 點、§6.3 #35）：通路健檢最底的 AI 解釋預設收合成一列「AI 解釋 · 未啟用（公開示範站不送出任何資料）」。
 * 展開後是原本的 AiPanel，內容與所有 ai-* testid 不變；收合時仍然掛載（M1）。summary 只放文字，不放互動元件。
 */
export function AiCollapse({ capability, children }: { capability: AiCapability | null; children: ReactNode }) {
  return <details className="ai-collapsed" data-testid="ai-collapsed">
    <summary><ShellIcon name="chevron-right" size={16} className="ai-collapsed-chev" /><span className="ai-collapsed-title">{fill(copy.summary, { status: aiCollapseStatus(capability) })}</span>{capability?.reason === "PUBLIC_DEMO" && <span className="ai-collapsed-note">{copy.publicNote}</span>}</summary>
    {children}
  </details>;
}
