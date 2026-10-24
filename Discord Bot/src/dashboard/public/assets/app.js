import{b as D,c as B,d as R,e as O,f as j,h as $,i as P,j as T}from"./chunks/chunk-OHDSOLYE.js";import{a as W,b as U,c as G}from"./chunks/chunk-GCQVDTTH.js";import{a as H,e as ge}from"./chunks/chunk-OUDVJPED.js";import{b as A,e as he}from"./chunks/chunk-DBF3SDNC.js";import{a as u,s as Ee}from"./chunks/chunk-LSMMA5UL.js";import"./chunks/chunk-GVLYQPQ7.js";import"./chunks/chunk-NNYBBRKP.js";import{c as z,d as ve}from"./chunks/chunk-WDH6IWQ3.js";import{a as F,b as be}from"./chunks/chunk-7R3XQCKF.js";import{d as C,e as fe}from"./chunks/chunk-DLVD6VJH.js";import"./chunks/chunk-IUX7EB6G.js";import{a as d,b as E,c as x}from"./chunks/chunk-D4FQCOZ2.js";import{a as g,b as ue,c,d as a,f as p,g as I,j as v}from"./chunks/chunk-W2E5MRZE.js";function V(){return K}async function q(){let e;try{e=await fetch(E("/api/me"),{headers:{Accept:"application/json"}})}catch{return null}return e.status===401?(K=!0,window.location.href=`${d}/login?return=${encodeURIComponent(window.location.pathname)}`,null):e.ok?await e.json():null}var K,J=g(()=>{"use strict";x();K=!1});async function N(){let e;try{e=await fetch(E("/api/notifications"),{headers:{Accept:"application/json"}})}catch{return}if(!e.ok)return;let o=await e.json();L=o.notes,_=o.unread,y()}async function Z(e){try{await fetch(E("/api/notifications"),{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify({action:e})})}catch{}}function y(){let e=a("#noteBadge"),o=a("#profileDot");e&&(e.textContent=String(_),e.hidden=_===0),o&&(o.hidden=_===0)}function M(){let e=a("#noteList"),o=a("#clearNotes");if(!e)return;if(o&&(o.hidden=L.length===0),L.length===0){let t=document.createElement("div");t.className="notes__none",t.append(p("#i-bell"),"Noch nichts passiert. Hier landen Meldungen, die dich betreffen."),e.replaceChildren(t);return}let n=document.createDocumentFragment();for(let t of L){let r=document.createElement(t.link?"a":"div");r.className=`note note--${t.kind}${t.read?"":" note--new"}`,t.link&&(r.href=t.link);let i=document.createElement("span");i.className="note__mark",i.appendChild(p(_e[t.kind]??"#i-info"));let f=document.createElement("div"),s=document.createElement("b");s.textContent=t.title;let l=document.createElement("p");l.textContent=t.body;let m=document.createElement("time");m.dateTime=t.at,m.textContent=A(new Date(t.at).getTime()),f.append(s,l,m),r.append(i,f),n.appendChild(r)}e.replaceChildren(n)}function Q(){_!==0&&(_=0,y(),Z("read"))}function X(){L=[],_=0,M(),y(),Z("clear")}var Y,L,_,_e,S=g(()=>{"use strict";v();he();x();Y=6e4,L=[],_=0;_e={info:"#i-info",success:"#i-check",warn:"#i-warn",group:"#i-shield",account:"#i-gamepad"}});function ke(e){let o=[e.message,e.context?`
Wo und wie:
${e.context}`:"",e.contact?`
Kontakt: ${e.contact}`:"",`
Seite: ${location.pathname}`].join(`
`),n=o.length>1400?`${o.slice(0,1400)}

[gek\xFCrzt]`:o;return`mailto:${xe}?subject=${encodeURIComponent(`[RL Nexus \xB7 Fehler] ${e.subject}`)}&body=${encodeURIComponent(n)}`}function ee(){document.body.insertAdjacentHTML("beforeend",ye);let e=a("#reportModal"),o=a("#reportForm"),n=a("#reportState"),t=a("#reportSend");if(!e||!o||!n||!t)return;let r=l=>o.elements.namedItem(l),i=(l,m="",h)=>{if(n.className=`report__state ${m}`.trim(),n.textContent=l,h){let w=document.createElement("a");w.href=h.href,w.textContent=h.label,n.append(" ",w)}},f=()=>{i("");for(let l of["subject","message"])r(l).removeAttribute("aria-invalid");e.showModal(),r("subject").focus()},s=()=>e.close();a("#reportClose")?.addEventListener("click",s),document.addEventListener("click",l=>{l.target.closest("[data-report]")&&(l.preventDefault(),f())}),o.addEventListener("submit",async l=>{l.preventDefault();let m=Object.fromEntries(["subject","message","context","contact","website"].map(k=>[k,r(k).value.trim()])),h=m.subject.length<4?"subject":m.message.length<20?"message":null;if(h){r(h).setAttribute("aria-invalid","true"),r(h).focus(),i(h==="subject"?"Ein Betreff mit ein paar W\xF6rtern hilft beim Einordnen.":"Beschreib den Fehler bitte etwas genauer, mindestens 20 Zeichen.","is-warn");return}for(let k of["subject","message"])r(k).removeAttribute("aria-invalid");t.disabled=!0,i("Wird gesendet \u2026");let w=/\/guild\/(\d{17,20})/.exec(location.pathname)?.[1]??null,b=null;try{b=await fetch(E("/api/report"),{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify({...m,guildId:w,page:location.pathname,browser:D(navigator.userAgent),errorIds:$()})})}catch{b=null}finally{t.disabled=!1}if(b?.ok){o.reset(),s(),F("info","Danke f\xFCr die Meldung","Sie ist beim Team angekommen. Wir melden uns, sobald wir mehr wissen.");return}if(!b||b.status===503||b.status===502){i("Der Bot kann die Meldung gerade nicht selbst verschicken.","is-warn",{href:ke(m),label:"Im Mailprogramm \xF6ffnen"});return}let pe=await b.json().catch(()=>({}));i(pe.error??"Das hat nicht geklappt. Versuch es gleich noch einmal.","is-warn")})}var xe,we,Le,ye,te=g(()=>{"use strict";T();O();v();x();be();xe="support@nexus-emb.de",we="https://discord.gg/CjG2HFGw95",Le='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>',ye=`
<dialog class="modal report" id="reportModal" aria-labelledby="reportTitle">
  <div class="modal__head">
    <div>
      <h2 id="reportTitle">Fehler melden</h2>
      <p>Geht direkt an das RL Nexus Team.</p>
    </div>
    <button class="iconbtn modal__x" type="button" id="reportClose" aria-label="Schlie\xDFen">${Le}</button>
  </div>
  <form class="modal__body report__form" id="reportForm" novalidate>
    <label class="mcfield">
      <span class="mcfield__label">Worum geht es?</span>
      <input class="text" name="subject" maxlength="120" autocomplete="off" placeholder="z. B. Ticket-Panel l\xE4sst sich nicht senden">
    </label>
    <label class="mcfield">
      <span class="mcfield__label">Was ist passiert?</span>
      <textarea class="text tkarea" name="message" rows="5" maxlength="4000" placeholder="Was hast du erwartet, und was kam stattdessen?"></textarea>
    </label>
    <label class="mcfield">
      <span class="mcfield__label">Wo und wie? <i>freiwillig</i></span>
      <textarea class="text tkarea" name="context" rows="3" maxlength="1000" placeholder="Modul, Server, was du davor geklickt hast"></textarea>
    </label>
    <label class="mcfield">
      <span class="mcfield__label">Kontakt</span>
      <input class="text" name="contact" maxlength="120" autocomplete="email" placeholder="E-Mail oder Discord-Name">
      <span class="mcfield__hint">Wenn du angemeldet bist, reicht deine Discord-ID. Sonst brauchen wir das f\xFCr die Antwort.</span>
    </label>
    <input class="report__trap" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
    <p class="report__state" id="reportState" role="status" aria-live="polite"></p>
    <div class="report__actions">
      <a class="btn btn--quiet" href="${we}" target="_blank" rel="noopener">Lieber im Discord</a>
      <button class="btn btn--primary" type="submit" id="reportSend">Meldung senden</button>
    </div>
    <p class="hintline">Seite, Browser und die letzten Fehler-IDs gehen automatisch mit.</p>
    <p class="hintline">In Discord geht es auch mit <code>/fehler</code>, auf jedem Server mit RL Nexus.</p>
  </form>
</dialog>`});function oe(){document.body.insertAdjacentHTML("beforeend",Me+Te),ee();let e=a('meta[name="rlnexus-site"]')?.content.trim(),o=a("#footerNav");e&&o&&o.prepend(I("","Webseite",e));let n=a("#cookieBar"),t=a("#cookieOk");if(!n||!t)return;let r=!1;try{r=localStorage.getItem(ne)==="1"}catch{r=!1}n.hidden=r,t.addEventListener("click",()=>{n.hidden=!0;try{localStorage.setItem(ne,"1")}catch{}})}var Me,Te,ne,re=g(()=>{"use strict";v();x();te();Me=`
<footer class="footer">
  <div class="shell footer__inner">
    <div class="footer__brand">
      <span class="footer__mark"><img src="${d}/assets/images/rl-nexus-n-96.png" alt="" width="26" height="26" decoding="async" loading="lazy"></span>
      <span>
        <b>RL Nexus</b>
        <i>Discord-Bot f\xFCr Rocket-League-Organisationen</i>
      </span>
    </div>

    <nav class="footer__nav" id="footerNav" aria-label="Fu\xDFzeile">
      <a href="${d}/docu">Dokumentation</a>
      <a href="${d}/privacy">Datenschutz</a>
      <a href="${d}/impressum">Impressum</a>
      <button type="button" data-report>Fehler melden</button>
    </nav>

    <p class="footer__note">
      Rocket League ist eine Marke von Psyonix LLC. RL Nexus steht nicht mit Psyonix oder Epic Games in Verbindung.
    </p>
  </div>
</footer>`,Te=`
<div class="cookiebar" id="cookieBar" role="region" aria-label="Hinweis zu Cookies" hidden>
  <div class="cookiebar__inner">
    <span class="cookiebar__mark"><svg><use href="#i-shield"/></svg></span>
    <p class="cookiebar__text">
      RL Nexus setzt nur Cookies, die f\xFCr die Anmeldung n\xF6tig sind \u2014 kein Tracking, keine Werbung,
      keine Weitergabe. Was gespeichert wird, steht im <a href="${d}/privacy">Datenschutz</a>.
    </p>
    <button class="btn btn--primary" type="button" id="cookieOk">Verstanden</button>
  </div>
</div>`,ne="rlnexus.cookies"});function ae(e){let o=a("#userbox"),n=a("#profile");if(!o||!n)return;o.insertAdjacentHTML("beforeend",He),document.body.insertAdjacentHTML("beforeend",Ne);let t=c("#userMenu"),r=H[e.group]??H.testphase;c("#menuAvatar").replaceChildren(W(e)),c("#menuName").textContent=e.name,c("#menuGroup").replaceChildren(p(r.icon),r.label);function i(s){t.hidden=!s,n.setAttribute("aria-expanded",String(s))}n.addEventListener("click",()=>{i(n.getAttribute("aria-expanded")!=="true"),z("primary")}),document.addEventListener("click",s=>{o.contains(s.target)||i(!1)}),document.addEventListener("keydown",s=>{s.key==="Escape"&&i(!1)});let f=c("#notesModal");for(let s of document.querySelectorAll(".modal [data-close]"))s.addEventListener("click",()=>s.closest("dialog")?.close());c("#openNotes").addEventListener("click",()=>{i(!1),M(),f.showModal(),Q()}),c("#clearNotes").addEventListener("click",()=>X()),c("#openSettings").href=`${d}/user/${e.id}/settings`,M(),y()}var He,Ne,ie=g(()=>{"use strict";v();ge();G();S();ve();x();He=`
<span class="profile__dot" id="profileDot" hidden></span>
<div class="menu" id="userMenu" role="menu" hidden>
  <div class="menu__head">
    <span class="avatar avatar--sm" id="menuAvatar" aria-hidden="true"></span>
    <span class="menu__id"><b id="menuName"></b><span id="menuGroup"></span></span>
  </div>
  <button class="menu__item" type="button" id="openNotes" role="menuitem">
    <svg><use href="#i-bell"/></svg><span>Benachrichtigungen</span>
    <span class="menu__badge" id="noteBadge" hidden>0</span>
  </button>
  <a class="menu__item" id="openSettings" role="menuitem">
    <svg><use href="#i-settings"/></svg><span>Einstellungen</span>
  </a>
  <div class="menu__line"></div>
  <a class="menu__item menu__item--warn" href="${d}/logout" role="menuitem">
    <svg><use href="#i-logout"/></svg><span>Abmelden</span>
  </a>
</div>`,Ne=`
<dialog class="modal" id="notesModal" aria-labelledby="notesTitle">
  <div class="modal__head">
    <div>
      <h2 id="notesTitle">Benachrichtigungen</h2>
      <p>Alles, was dich betrifft. Auf jedem Ger\xE4t dasselbe.</p>
    </div>
    <button class="iconbtn modal__x" type="button" data-close aria-label="Schlie\xDFen"><svg><use href="#i-x"/></svg></button>
  </div>
  <div class="modal__body">
    <div class="notes" id="noteList"></div>
    <button class="linkrow" type="button" id="clearNotes"><svg><use href="#i-x"/></svg>Alle l\xF6schen</button>
  </div>
</dialog>`});function se(e){let o=document.querySelector("main");if(!o)return;let n=e.action??{label:"Zur \xDCbersicht",href:`${d}/`},t=u("a","erract erract--go"),r=u("a","erract");t.href=n.href,t.append(n.label,p("#i-arrow")),r.href="",r.append(p("#i-refresh"),"Neu laden"),o.replaceChildren(u("div","stage",u("div","empty empty--error errpage",u("span","empty__mark",p("#i-warn")),u("span","errcode",e.code),u("h2","",e.title),u("p","",e.text),u("div","erracts",t,r),...e.hint?[u("p","errhint",e.hint)]:[],...[P(e.errorId??null)].filter(i=>i!==null))))}var le=g(()=>{"use strict";x();v();Ee();T()});function de(){let e=a(".topbar");if(!e)return;let o=a(".controls"),n=()=>{if(e.classList.toggle("is-stuck",window.scrollY>8),o){let t=o.getBoundingClientRect().top<=e.offsetHeight+1;o.classList.toggle("is-stuck",t)}};window.addEventListener("scroll",n,{passive:!0}),n()}function ce(e,o){let n=a(".topbar");if(!e||!n)return;let t=document.createElement("div"),r=document.createElement("div"),i=document.createElement("p"),f=document.createElement("b");t.className="staffbar",t.setAttribute("role","status"),r.className="shell staffbar__inner",f.textContent="Wartung l\xE4uft",i.append(f,`${e.until?` bis voraussichtlich ${e.until} Uhr.`:", ohne Endzeit."} Du siehst das Dashboard, weil du ${o==="administrator"?"Administrator":"Developer"} bist. Alle anderen sehen die Wartungsseite. Schalter im Admin Dashboard unter Developer \u2192 Wartung.`),r.append(p("#i-warn"),i),t.append(r),n.append(t)}var me=g(()=>{"use strict";v()});var Ce=ue(()=>{v();J();fe();S();re();G();ie();le();O();T();me();function Se(e){let o=a("#empty"),n=a("#grid");if(n&&n.replaceChildren(),e!=="servers"||!o){se({code:"Keine Verbindung",title:"Der Inhalt l\xE4sst sich gerade nicht laden",text:"Der Bot antwortet nicht oder Discord hat die Anfrage gebremst. Deine Einstellungen sind davon nicht betroffen.",hint:"Lade die Seite in einem Moment neu \u2013 bleibt es dabei, l\xE4uft der Bot vermutlich nicht.",errorId:B()});return}o.classList.add("is-on","empty--error");let t=a("#emptyIcon use");t&&t.setAttribute("href","#i-warn"),c("#emptyTitle").textContent="Serverliste nicht erreichbar",c("#emptyText").textContent="Der Bot antwortet gerade nicht oder Discord hat die Anfrage gebremst. Lade die Seite in einem Moment neu.";let r=a("#emptyReset");r&&(r.textContent="Neu laden",r.addEventListener("click",()=>window.location.reload()));let i=a("#resultline");i&&(i.textContent="Laden fehlgeschlagen")}async function Ie(){let e=document.body.dataset.page;if(de(),C(),oe(),e==="static"){(await import("./chunks/Docu-HVV5RQ7Z.js")).bindDocNav();return}if(R(),e==="board"){await(await import("./chunks/Board-7I6KYBFS.js")).renderBoard();return}if(e==="mansboard"){await(await import("./chunks/MansBoard-2R7F5D7H.js")).renderMansBoard();return}if(e==="clipsboard"){await(await import("./chunks/ClipsBoard-OOPS2AYB.js")).renderClipsBoard();return}if(e==="apply"){await(await import("./chunks/Apply-NULI24JX.js")).renderApplyPage();return}if(e==="matchups"){await(await import("./chunks/Matchups-Y6BIONMT.js")).renderMatchupsPage();return}let o=e==="guild"?import("./chunks/Guild-OYBVDQIN.js").then(r=>(r.prefetchGuild(),r)):e==="settings"?import("./chunks/Settings-4MFTABBO.js"):import("./chunks/Servers-E4KORAJU.js").then(r=>(e==="servers"&&r.skeletons(6),r)),n=await q();if(!n){V()||Se(e??"");return}U(n.user),ae(n.user),ce(n.maintenance,n.user.group),j(n.errorReports===!0),N(),window.setInterval(()=>{N()},Y);let t=await o;"renderGuild"in t?t.renderGuild(n):"renderSettings"in t?t.renderSettings(n.user):t.renderServers(n)}Ie()});export default Ce();
