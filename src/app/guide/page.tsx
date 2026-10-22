/* eslint-disable @next/next/no-html-link-for-pages -- 說明頁刻意用 <a> 整頁載入工作台 /：next/link 會把用戶端路由元件帶進說明頁，頁面 JS 要維持只有框架（06_BATCHES V41-1 B2）。 */
import { guideLabels } from "@/i18n/guide.zh-TW";
import { GUIDE_AREA_GROUP, GUIDE_AREAS, GUIDE_GROUPS, GUIDE_HUB_SECTIONS, GUIDE_QUICKSTART, GUIDE_WHO, guideAreaHref, guideAreaPath, type GuideAreaLink } from "@/application/guide";
import { GuideAreaRef } from "@/components/guide/guide-area-ref";
import { GuideCardList, type GuideCardGroup } from "@/components/guide/guide-card-list";
import { GUIDE_HUB_CLAIMS, GUIDE_HUB_PREMISE, GUIDE_TRADEOFF_KEYS, GUIDE_TRADEOFF_LINKS } from "@/components/guide/guide-hub-data";
import { guideText } from "@/components/guide/guide-text";
import { GuideToc } from "@/components/guide/guide-toc";
import { GuideVideos } from "@/components/guide/guide-video";
import { guideMetadata, guidePageTitle } from "./metadata";

// V41-1（docs/revamp-v4.1/01_PRD.md §3.3、GUIDE_CONTENT.md §1）：說明首頁 /guide——開頭、為什麼做這套服務、幫哪些人解決哪些問題、獨特性與刻意不做的事、30 秒上手、功能區目錄。
// V42-G1（docs/revamp-v4.2/06_BATCHES.md V42-G1；使用者 2026-10-20 的改寫稿）：獨特性改成 3 個主張（編號）＋1 個前提（不編號的卡片），每項固定四段（一般做法、在這裡、對你的意義、在哪裡看得到）；
// 「這些做法的代價」改成「刻意不做的事」（引言、三點、結語，第一點附「相關說明：」連到匯入資料頁）；30 秒上手加一行引言。文字全在 guideLabels，資料常數在 src/components/guide/guide-hub-data.ts；
// h1、兩顆按鈕、本頁目錄、三種角色的 JSX、四步、影片、功能區目錄、外框都沒有改。只用既有 class（.guide-summary、.guide-notes、.guide-inline-list、.guide-roles／.guide-role），不加 testid。
// 伺服器元件、靜態產生。功能區頁還沒上線（不在 GUIDE_AREAS）時只顯示標題文字、不放連結；目錄在 GUIDE_AREAS 是空的時候整段不顯示（V41-1）。
const g = guideLabels.guide;

export const metadata = guideMetadata({ title: guidePageTitle(guideText(g.hub.title)), description: guideText(g.hub.description), path: "/guide" });

/** 「在哪裡看得到」：連到功能區頁的連結清單（同一行、會換行）。 */
function WhereLinks({ links }: { links: readonly GuideAreaLink[] }) {
  return <ul className="guide-inline-list">{links.map(link => <li key={`${link.area}#${link.hash ?? ""}`}><GuideAreaRef area={link.area} hash={link.hash} /></li>)}</ul>;
}

export default function GuideHubPage() {
  const groups: GuideCardGroup[] = GUIDE_GROUPS.map(group => ({
    id: group,
    title: guideText(g.groups[group]),
    cards: GUIDE_AREAS.filter(entry => GUIDE_AREA_GROUP[entry.area] === group).map(entry => {
      const area: { title: string; answers?: string } = g.areas[entry.area];
      return { area: entry.area, href: guideAreaPath(entry.area), title: guideText(area.title), answers: area.answers === undefined ? undefined : guideText(area.answers) };
    }),
  }));
  const hasAreas = groups.some(group => group.cards.length > 0);
  // 本頁目錄：段落依閱讀順序；功能區目錄沒有卡片時不列。
  const sections = GUIDE_HUB_SECTIONS.filter(id => id !== "areas" || hasAreas);
  const premise = g.unique.items[GUIDE_HUB_PREMISE.key];
  return <div className="guide-hub" data-testid="guide-hub">
    <div className="guide-hero">
      <h1>{guideText(g.hub.title)}</h1>
      <p className="guide-intro">{guideText(g.hub.intro)}</p>
      <div className="guide-actions">
        <a className="ui-btn ui-btn-primary" href="/">{guideText(g.hub.openApp)}</a>
        <a className="ui-btn ui-btn-secondary" href="#quickstart">{guideText(g.hub.startHere)}</a>
      </div>
    </div>
    <GuideToc label={guideText(g.hub.tocAria)} items={sections.map(id => ({ id, title: guideText(g.sections[id]) }))} />

    <section id="why" className="guide-section" aria-labelledby="guide-why-title">
      <h2 id="guide-why-title">{guideText(g.sections.why)}</h2>
      <p className="guide-lead">{guideText(g.why.lead)}</p>
      {g.why.body.map((paragraph, index) => <p key={index}>{guideText(paragraph)}</p>)}
      <p className="guide-note">{guideText(g.why.status)}</p>
    </section>

    <section id="who" className="guide-section" aria-labelledby="guide-who-title">
      <h2 id="guide-who-title">{guideText(g.sections.who)}</h2>
      <p>{guideText(g.who.lead)}</p>
      <div className="guide-roles">
        {GUIDE_WHO.map(({ role, start }) => {
          const row = g.who.roles[role];
          return <article key={role} className="guide-role" aria-labelledby={`guide-role-${role}`}>
            <h3 id={`guide-role-${role}`}>{guideText(row.role)}</h3>
            <dl>
              <dt>{guideText(g.who.fields.ask)}</dt><dd>{guideText(row.ask)}</dd>
              <dt>{guideText(g.who.fields.before)}</dt><dd>{guideText(row.before)}</dd>
              <dt>{guideText(g.who.fields.after)}</dt><dd>{guideText(row.after)}</dd>
              <dt>{guideText(g.who.fields.start)}</dt><dd><ul className="guide-inline-list">{start.map(area => <li key={area}><GuideAreaRef area={area} /></li>)}</ul></dd>
            </dl>
          </article>;
        })}
      </div>
      <p>{guideText(g.who.also)}</p>
      <h3 className="guide-subheading">{guideText(g.sections.scope)}</h3>
      <p>{guideText(g.who.fits)}</p>
      <p>{guideText(g.who.notYet)}</p>
    </section>

    <section id="unique" className="guide-section" aria-labelledby="guide-unique-title">
      <h2 id="guide-unique-title">{guideText(g.sections.unique)}</h2>
      <p>{guideText(g.unique.lead)}</p>
      {/* V42-G1：3 個主張（有序清單）。每項 h3＋四段 dl：一般做法、在這裡（幾點）、對你的意義、在哪裡看得到（功能區連結）。 */}
      <ol className="guide-unique">
        {GUIDE_HUB_CLAIMS.map(item => {
          const copy = g.unique.items[item.key];
          return <li key={item.key}>
            <h3>{guideText(copy.title)}</h3>
            <dl className="guide-summary">
              <dt>{guideText(g.unique.fields.before)}</dt><dd>{guideText(copy.before)}</dd>
              <dt>{guideText(g.unique.fields.after)}</dt><dd><ul className="guide-notes">{copy.after.map((line, index) => <li key={index}>{guideText(line)}</li>)}</ul></dd>
              <dt>{guideText(g.unique.fields.meaning)}</dt><dd>{guideText(copy.meaning)}</dd>
              <dt>{guideText(g.unique.where)}</dt><dd><WhereLinks links={item.where} /></dd>
            </dl>
          </li>;
        })}
      </ol>
      {/* 前提：不編號，用角色卡的樣式（.guide-roles 只有一張卡時佔整欄）；沒有「一般做法」。 */}
      <div className="guide-roles">
        <article className="guide-role" aria-labelledby="guide-unique-premise">
          <h3 id="guide-unique-premise">{guideText(premise.title)}</h3>
          <dl>
            <dt>{guideText(g.unique.fields.after)}</dt><dd><ul className="guide-notes">{premise.after.map((line, index) => <li key={index}>{guideText(line)}</li>)}</ul></dd>
            <dt>{guideText(g.unique.fields.meaning)}</dt><dd>{guideText(premise.meaning)}</dd>
            <dt>{guideText(g.unique.where)}</dt><dd><WhereLinks links={GUIDE_HUB_PREMISE.where} /></dd>
          </dl>
        </article>
      </div>
      {/* 刻意不做的事：引言、三點（第一點附「相關說明：」連到匯入資料頁）、結語。 */}
      <h3 className="guide-subheading">{guideText(g.sections.tradeoffs)}</h3>
      <p>{guideText(g.tradeoffs.lead)}</p>
      <ul className="guide-notes">
        {GUIDE_TRADEOFF_KEYS.map(key => {
          const links = GUIDE_TRADEOFF_LINKS[key];
          return <li key={key}>{guideText(g.tradeoffs.items[key])}{links && links.length > 0 && <span className="guide-note-link">{guideText(g.areaPage.seeAlso)}{links.map(link => <GuideAreaRef key={`${link.area}#${link.hash ?? ""}`} area={link.area} hash={link.hash} />)}</span>}</li>;
        })}
      </ul>
      <p>{guideText(g.tradeoffs.closing)}</p>
    </section>

    <section id="quickstart" className="guide-section" aria-labelledby="guide-quickstart-title">
      <h2 id="guide-quickstart-title">{guideText(g.sections.quickstart)}</h2>
      {/* V42-G1：4 步之前一行引言（不用登入、不用準備資料；示範資料是虛構的合成資料）。 */}
      <p>{guideText(g.quickstart.lead)}</p>
      <ol className="guide-steps">
        {GUIDE_QUICKSTART.map(step => {
          const text = guideText(g.quickstart.steps[step.key]);
          const href = "href" in step ? step.href : guideAreaHref(step.area);
          return <li key={step.key}>{href ? <a className="guide-link" href={href}>{text}</a> : text}</li>;
        })}
      </ol>
      {/* V41-3（PRD §3.3 第 5 項）：4 步之後放 30 秒上手的示範影片（GUIDE_VIDEOS 的 hub；媒體清單沒有時不渲染）。 */}
      <GuideVideos page="hub" />
    </section>

    {hasAreas && <section id="areas" className="guide-section" aria-labelledby="guide-areas-title">
      <h2 id="guide-areas-title">{guideText(g.sections.areas)}</h2>
      <GuideCardList groups={groups} />
    </section>}
  </div>;
}
