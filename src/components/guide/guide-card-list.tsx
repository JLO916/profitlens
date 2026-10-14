// V41-1（docs/revamp-v4.1/01_PRD.md §3.3 第 6 項）：說明首頁的功能區目錄——依分組（開始使用、側欄四組、跨頁工具）排列的連結卡。
// 伺服器元件（不加 "use client"）。卡片是普通連結（標題＋一句「回答什麼」），不是圖；呼叫端只傳已上線的功能區（src/application/guide.ts 的 GUIDE_AREAS），
// 沒有任何卡片時整個目錄不渲染（V41-1 的 GUIDE_AREAS 是空的）。文字由呼叫端從 guideLabels 解析好再傳進來。

export interface GuideCard {
  area: string;
  href: string;
  title: string;
  /** 一句「這頁回答什麼」（guide.areas.{area}.answers）；沒有時只顯示標題。 */
  answers?: string;
}
export interface GuideCardGroup {
  id: string;
  title: string;
  cards: readonly GuideCard[];
}

export function GuideCardList({ groups }: { groups: readonly GuideCardGroup[] }) {
  const shown = groups.filter(group => group.cards.length > 0);
  if (shown.length === 0) return null;
  return <div className="guide-card-groups">
    {shown.map(group => <div key={group.id} className="guide-card-group">
      <h3>{group.title}</h3>
      <ul className="guide-cards">
        {group.cards.map(card => <li key={card.area}><a className="guide-card" href={card.href}><span className="guide-card-title">{card.title}</span>{card.answers && <span className="guide-card-answer">{card.answers}</span>}</a></li>)}
      </ul>
    </div>)}
  </div>;
}
