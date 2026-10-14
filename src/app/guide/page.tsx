/* eslint-disable @next/next/no-html-link-for-pages -- 說明頁刻意用 <a> 整頁載入工作台 /：next/link 會把用戶端路由元件帶進說明頁，頁面 JS 要維持只有框架（06_BATCHES V41-1 B2）。 */
import { guideLabels } from "@/i18n/guide.zh-TW";
import { GUIDE_AREA_GROUP, GUIDE_AREAS, GUIDE_GROUPS, GUIDE_HUB_SECTIONS, GUIDE_QUICKSTART, GUIDE_UNIQUE, GUIDE_WHO, guideAreaHref, guideAreaPath } from "@/application/guide";
import { GuideAreaRef } from "@/components/guide/guide-area-ref";
import { GuideCardList, type GuideCardGroup } from "@/components/guide/guide-card-list";
import { guideText } from "@/components/guide/guide-text";
import { GuideToc } from "@/components/guide/guide-toc";
import { guideMetadata, guidePageTitle } from "./metadata";

// V41-1（docs/revamp-v4.1/01_PRD.md §3.3、GUIDE_CONTENT.md §1）：說明首頁 /guide——開頭、為什麼做這套服務、幫哪些人解決哪些問題、獨特性與代價、30 秒上手、功能區目錄。
// 伺服器元件、靜態產生。功能區頁還沒上線（不在 GUIDE_AREAS）時只顯示標題文字、不放連結；目錄在 GUIDE_AREAS 是空的時候整段不顯示（V41-1）。
const g = guideLabels.guide;

export const metadata = guideMetadata({ title: guidePageTitle(guideText(g.hub.title)), description: guideText(g.hub.description), path: "/guide" });

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
      <ol className="guide-unique">
        {GUIDE_UNIQUE.map(item => {
          const copy = g.unique.items[item.key];
          return <li key={item.key}>
            <h3>{guideText(copy.title)}</h3>
            <p>{guideText(copy.body)}</p>
            <p className="guide-where"><span>{guideText(g.unique.where)}</span><GuideAreaRef area={item.area} hash={"hash" in item ? item.hash : undefined} /></p>
          </li>;
        })}
      </ol>
      <h3 className="guide-subheading">{guideText(g.sections.tradeoffs)}</h3>
      <p>{guideText(g.tradeoffs.body)}</p>
    </section>

    <section id="quickstart" className="guide-section" aria-labelledby="guide-quickstart-title">
      <h2 id="guide-quickstart-title">{guideText(g.sections.quickstart)}</h2>
      <ol className="guide-steps">
        {GUIDE_QUICKSTART.map(step => {
          const text = guideText(g.quickstart.steps[step.key]);
          const href = "href" in step ? step.href : guideAreaHref(step.area);
          return <li key={step.key}>{href ? <a className="guide-link" href={href}>{text}</a> : text}</li>;
        })}
      </ol>
    </section>

    {hasAreas && <section id="areas" className="guide-section" aria-labelledby="guide-areas-title">
      <h2 id="guide-areas-title">{guideText(g.sections.areas)}</h2>
      <GuideCardList groups={groups} />
    </section>}
  </div>;
}
