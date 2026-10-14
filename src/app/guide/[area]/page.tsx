/* eslint-disable @next/next/no-html-link-for-pages -- 說明頁刻意用 <a> 整頁載入工作台 / 與說明首頁 /guide：next/link 會把用戶端路由元件帶進說明頁，頁面 JS 要維持只有框架（06_BATCHES V41-1 B2）。 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { guideLabels } from "@/i18n/guide.zh-TW";
import { GUIDE_AREA_BEFORE_AREAS, GUIDE_AREA_BEFORE_LINKS, GUIDE_AREA_NEXT, GUIDE_AREA_NOTE_LINKS, GUIDE_AREAS, guideAreaPath, type GuideArea, type GuideAreaLink, type GuideMediaManifest } from "@/application/guide";
import guideMedia from "@/application/guide-media.json";
import { GuideAreaRef } from "@/components/guide/guide-area-ref";
import { GuideStep, type GuideStepCopy } from "@/components/guide/guide-step";
import { GuideText, guideText } from "@/components/guide/guide-text";
import { GuideToc } from "@/components/guide/guide-toc";
import { guideMetadata, guidePageTitle } from "../metadata";

// V41-2a（D-V41-4＝A；docs/revamp-v4.1/01_PRD.md §3.3「/guide/{area}」、§3.5–3.8；GUIDE_CONTENT.md §2）：功能區頁——麵包屑、h1、這頁回答什麼與開始前、本頁目錄、步驟（截圖）、要注意、下一步。
// 伺服器元件、靜態產生：只產生 GUIDE_AREAS 裡的功能區（dynamicParams＝false，其他網址 404）。截圖的寬高取自媒體清單 src/application/guide-media.json；
// 清單裡沒有的截圖不渲染（tests/guide-content.test.ts 的媒體同步檢查要求每個步驟都有圖）。連結一律用 <a>（不用 next/link）。
const g = guideLabels.guide;
const media = (guideMedia as GuideMediaManifest).media;

export const dynamicParams = false;

export function generateStaticParams(): { area: string }[] {
  return GUIDE_AREAS.map(({ area }) => ({ area }));
}

type Params = { params: Promise<{ area: string }> };

/** 一個功能區頁的文字（guide.areas.{area}）；已上線的功能區少了任何一欄就丟錯（build 失敗，不上線缺字的頁）。 */
interface GuideAreaCopy {
  title: string;
  answers: string;
  before: string;
  beforeLink?: string;
  steps: Readonly<Record<string, GuideStepCopy>>;
  notes: readonly string[];
}
function areaCopy(entry: GuideArea): GuideAreaCopy {
  const copy: { title: string; answers?: string; before?: string; beforeLink?: string; steps?: Readonly<Record<string, GuideStepCopy>>; notes?: readonly string[] } = g.areas[entry.area];
  const { answers, before, steps, notes } = copy;
  if (answers === undefined || before === undefined || steps === undefined || notes === undefined) throw new Error(`guide.areas.${entry.area}: missing answers, before, steps or notes`);
  const missing = entry.steps.filter(step => !Object.hasOwn(steps, step.key)).map(step => step.key);
  if (missing.length) throw new Error(`guide.areas.${entry.area}.steps: missing ${missing.join(", ")}`);
  return { title: copy.title, answers, before, beforeLink: copy.beforeLink, steps, notes };
}

/** 「相關說明：」後接一或多個功能區連結（要注意的某一點、V41-2b 起也用於開始前）；沒有連結時不渲染。 */
function GuideSeeAlso({ links }: { links: readonly GuideAreaLink[] }) {
  if (links.length === 0) return null;
  return <span className="guide-note-link">{guideText(g.areaPage.seeAlso)}{links.map(link => <GuideAreaRef key={`${link.area}#${link.hash ?? ""}`} area={link.area} hash={link.hash} />)}</span>;
}

/** 網址片段對應的已上線功能區；不在 GUIDE_AREAS 時回 404。 */
async function resolveArea(params: Params["params"]): Promise<GuideArea> {
  const { area } = await params;
  const entry = GUIDE_AREAS.find(candidate => candidate.area === area);
  if (!entry) notFound();
  return entry;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const entry = await resolveArea(params);
  const copy = areaCopy(entry);
  return guideMetadata({ title: guidePageTitle(guideText(copy.title)), description: guideText(copy.answers), path: guideAreaPath(entry.area) });
}

export default async function GuideAreaPage({ params }: Params) {
  const entry = await resolveArea(params);
  const { area, steps } = entry;
  const copy = areaCopy(entry);
  const title = guideText(copy.title);
  const beforeLink = GUIDE_AREA_BEFORE_LINKS[area];
  const noteLinks = GUIDE_AREA_NOTE_LINKS[area] ?? [];
  const mediaOf = (mediaId: string) => media.find(item => item.id === mediaId);
  // 頁面第一張圖（第一個在媒體清單裡的步驟）不 lazy，其餘 lazy。
  const firstShot = steps.find(step => mediaOf(step.mediaId))?.mediaId;
  return <div className="guide-area" data-testid={`guide-area-${area}`}>
    <nav className="guide-breadcrumb" aria-label={guideText(g.areaPage.breadcrumbAria)}>
      <ol>
        <li><a className="guide-link" href="/guide">{guideText(g.areaPage.home)}</a></li>
        <li><span aria-current="page">{title}</span></li>
      </ol>
    </nav>
    <h1>{title}</h1>
    <dl className="guide-summary">
      <dt>{guideText(g.sections.answers)}</dt>
      <dd>{guideText(copy.answers)}</dd>
      <dt>{guideText(g.sections.before)}</dt>
      <dd>{guideText(copy.before)}{beforeLink && copy.beforeLink && <> <a className="guide-link" href={beforeLink}>{guideText(copy.beforeLink)}</a></>}<GuideSeeAlso links={GUIDE_AREA_BEFORE_AREAS[area] ?? []} /></dd>
    </dl>
    <GuideToc label={guideText(g.hub.tocAria)} items={steps.map(step => ({ id: step.key, title: guideText(copy.steps[step.key].title) }))} />

    <ol className="guide-area-steps">
      {steps.map(step => <GuideStep key={step.key} area={area} step={step} copy={copy.steps[step.key]} media={mediaOf(step.mediaId)} eager={step.mediaId === firstShot} />)}
    </ol>

    <section id="notes" className="guide-section" aria-labelledby="guide-notes-title">
      <h2 id="guide-notes-title">{guideText(g.sections.notes)}</h2>
      <ul className="guide-notes">
        {copy.notes.map((note, index) => <li key={index}><GuideText text={note} /><GuideSeeAlso links={noteLinks.filter(item => item.note === index)} /></li>)}
      </ul>
    </section>

    <section id="next" className="guide-section" aria-labelledby="guide-next-title">
      <h2 id="guide-next-title">{guideText(g.sections.next)}</h2>
      <ul className="guide-next">
        {(GUIDE_AREA_NEXT[area] ?? []).map(next => <li key={next}><GuideAreaRef area={next} /></li>)}
        <li><a className="guide-link" href="/">{guideText(g.hub.openApp)}</a></li>
      </ul>
    </section>
  </div>;
}
