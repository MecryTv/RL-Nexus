import{a as j,b as O,c as P}from"./chunks/chunk-YINQPI4I.js";import{a as N,e as pe}from"./chunks/chunk-CXQXA37P.js";import{c as B,g as de}from"./chunks/chunk-74UPNGAA.js";import{d as p,w as fe}from"./chunks/chunk-QZQEB7ZA.js";import"./chunks/chunk-RHJ3F7KO.js";import{c as F,d as ue}from"./chunks/chunk-GIVT6A2M.js";import{a as D,b as me}from"./chunks/chunk-CZHQ4F6H.js";import{d as A,e as ce}from"./chunks/chunk-WC4N6S6D.js";import"./chunks/chunk-SWDDTOCG.js";import{a as d,b as E,c as _}from"./chunks/chunk-WRBNFJXV.js";import{a as v,b as le,c as m,d as i,f as u,g as R,j as w}from"./chunks/chunk-HUFDLLFV.js";function W(){return U}async function G(){let e;try{e=await fetch(E("/api/me"),{headers:{Accept:"application/json"}})}catch{return null}return e.status===401?(U=!0,window.location.href=`${d}/login?return=${encodeURIComponent(window.location.pathname)}`,null):e.ok?await e.json():null}var U,q=v(()=>{"use strict";_();U=!1});async function C(){let e;try{e=await fetch(E("/api/notifications"),{headers:{Accept:"application/json"}})}catch{return}if(!e.ok)return;let t=await e.json();x=t.notes,L=t.unread,y()}async function V(e){try{await fetch(E("/api/notifications"),{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify({action:e})})}catch{}}function y(){let e=i("#noteBadge"),t=i("#profileDot");e&&(e.textContent=String(L),e.hidden=L===0),t&&(t.hidden=L===0)}function T(){let e=i("#noteList"),t=i("#clearNotes");if(!e)return;if(t&&(t.hidden=x.length===0),x.length===0){let n=document.createElement("div");n.className="notes__none",n.append(u("#i-bell"),"Noch nichts passiert. Hier landen Meldungen, die dich betreffen."),e.replaceChildren(n);return}let o=document.createDocumentFragment();for(let n of x){let r=document.createElement(n.link?"a":"div");r.className=`note note--${n.kind}${n.read?"":" note--new"}`,n.link&&(r.href=n.link);let a=document.createElement("span");a.className="note__mark",a.appendChild(u(he[n.kind]??"#i-info"));let c=document.createElement("div"),s=document.createElement("b");s.textContent=n.title;let f=document.createElement("p");f.textContent=n.body;let l=document.createElement("time");l.dateTime=n.at,l.textContent=B(new Date(n.at).getTime()),c.append(s,f,l),r.append(a,c),o.appendChild(r)}e.replaceChildren(o)}function K(){L!==0&&(L=0,y(),V("read"))}function J(){x=[],L=0,T(),y(),V("clear")}var z,x,L,he,I=v(()=>{"use strict";w();de();_();z=6e4,x=[],L=0;he={info:"#i-info",success:"#i-check",warn:"#i-warn",group:"#i-shield",account:"#i-gamepad"}});function S(e){H.push({at:new Date().toISOString(),what:e.slice(0,300)}),H.length>Ee&&H.shift()}function Le(e){return e.split("?")[0].split("/").pop()||"?"}function _e(){let e=window.fetch.bind(window);window.fetch=async(t,o)=>{let n=new URL(t instanceof Request?t.url:String(t),location.href),r=(o?.method??(t instanceof Request?t.method:"GET")).toUpperCase(),a=n.origin===location.origin&&n.pathname.includes("/api/")&&!n.pathname.endsWith("/api/report"),c=`${r} ${n.pathname}`;try{let s=await e(t,o);if(a&&!s.ok){let f=s.headers.get("x-error-id");s.clone().json().catch(()=>({})).then(l=>S([`${c} \u2192 ${s.status}`,typeof l.error=="string"?l.error:"",f?`Fehler-ID ${f}`:""].filter(Boolean).join(" \xB7 ")))}return s}catch(s){throw a&&!(s instanceof DOMException&&s.name==="AbortError")&&S(`${c} \u2192 keine Antwort`),s}},window.addEventListener("error",t=>S(`Skript: ${t.message}${t.filename?` (${Le(t.filename)}:${t.lineno})`:""}`)),window.addEventListener("unhandledrejection",t=>S(`Skript: ${t.reason instanceof Error?t.reason.message:String(t.reason)}`))}function $(){let e=document.querySelector('script[src*="/assets/app.js"]'),t=e?new URL(e.src).searchParams.get("v"):null;return{browser:navigator.userAgent,screen:`${window.innerWidth} \xD7 ${window.innerHeight}`,version:t??"unbekannt",problems:[...H]}}function ke(e){let t=$(),o=[["Seite",location.pathname],["Browser",t.browser],["Fenster",t.screen],["Version",t.version]];if(t.problems.length===0)o.push(["Probleme","keine bemerkt"]);else{let n=document.createElement("ul");for(let r of t.problems){let a=document.createElement("li");a.textContent=`${new Date(r.at).toLocaleTimeString("de-DE")} ${r.what}`,n.append(a)}o.push(["Probleme",n])}e.replaceChildren(...o.flatMap(([n,r])=>{let a=document.createElement("dt"),c=document.createElement("dd");return a.textContent=n,c.append(r),[a,c]}))}function xe(e){let t=$(),o=[e.message,e.context?`
Wo und wie:
${e.context}`:"",e.contact?`
Kontakt: ${e.contact}`:"",`
Seite: ${location.pathname}`,`Version: ${t.version}`,...t.problems.map(r=>`- ${r.what}`)].join(`
`),n=o.length>1400?`${o.slice(0,1400)}

[gek\xFCrzt]`:o;return`mailto:${ge}?subject=${encodeURIComponent(`[RL Nexus \xB7 Fehler] ${e.subject}`)}&body=${encodeURIComponent(n)}`}function Y(){_e(),document.body.insertAdjacentHTML("beforeend",we);let e=i("#reportModal"),t=i("#reportForm"),o=i("#reportState"),n=i("#reportSend"),r=i("#reportTech");if(!e||!t||!o||!n||!r)return;let a=l=>t.elements.namedItem(l),c=(l,g="",h)=>{if(o.className=`report__state ${g}`.trim(),o.textContent=l,h){let k=document.createElement("a");k.href=h.href,k.textContent=h.label,o.append(" ",k)}},s=()=>{c("");for(let l of["subject","message"])a(l).removeAttribute("aria-invalid");ke(r),e.showModal(),a("subject").focus()},f=()=>e.close();i("#reportClose")?.addEventListener("click",f),document.addEventListener("click",l=>{l.target.closest("[data-report]")&&(l.preventDefault(),s())}),t.addEventListener("submit",async l=>{l.preventDefault();let g=Object.fromEntries(["subject","message","context","contact","website"].map(M=>[M,a(M).value.trim()])),h=g.subject.length<4?"subject":g.message.length<20?"message":null;if(h){a(h).setAttribute("aria-invalid","true"),a(h).focus(),c(h==="subject"?"Ein Betreff mit ein paar W\xF6rtern hilft beim Einordnen.":"Beschreib den Fehler bitte etwas genauer, mindestens 20 Zeichen.","is-warn");return}for(let M of["subject","message"])a(M).removeAttribute("aria-invalid");n.disabled=!0,c("Wird gesendet \u2026");let k=/\/guild\/(\d{17,20})/.exec(location.pathname)?.[1]??null,b=null;try{b=await fetch(E("/api/report"),{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify({...g,guildId:k,page:location.pathname,tech:$()})})}catch{b=null}finally{n.disabled=!1}if(b?.ok){t.reset(),f(),D("info","Danke f\xFCr die Meldung","Sie ist beim Team angekommen. Wir melden uns, sobald wir mehr wissen.");return}if(!b||b.status===503||b.status===502){c("Der Bot kann die Meldung gerade nicht selbst verschicken.","is-warn",{href:xe(g),label:"Im Mailprogramm \xF6ffnen"});return}let se=await b.json().catch(()=>({}));c(se.error??"Das hat nicht geklappt. Versuch es gleich noch einmal.","is-warn")})}var ge,be,ve,we,Ee,H,Z=v(()=>{"use strict";w();_();me();ge="support@nexus-emb.de",be="https://discord.gg/CjG2HFGw95",ve='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>',we=`
<dialog class="modal report" id="reportModal" aria-labelledby="reportTitle">
  <div class="modal__head">
    <div>
      <h2 id="reportTitle">Fehler melden</h2>
      <p>Geht direkt an das RL Nexus Team.</p>
    </div>
    <button class="iconbtn modal__x" type="button" id="reportClose" aria-label="Schlie\xDFen">${ve}</button>
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
    <details class="report__tech">
      <summary>Das geht automatisch mit</summary>
      <dl class="report__techlist" id="reportTech"></dl>
    </details>
    <input class="report__trap" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
    <p class="report__state" id="reportState" role="status" aria-live="polite"></p>
    <div class="report__actions">
      <a class="btn btn--quiet" href="${be}" target="_blank" rel="noopener">Lieber im Discord</a>
      <button class="btn btn--primary" type="submit" id="reportSend">Meldung senden</button>
    </div>
    <p class="hintline">In Discord geht es auch mit <code>/fehler</code>, auf jedem Server mit RL Nexus.</p>
  </form>
</dialog>`,Ee=8,H=[]});function Q(){document.body.insertAdjacentHTML("beforeend",ye+Me),Y();let e=i('meta[name="rlnexus-site"]')?.content.trim(),t=i("#footerNav");e&&t&&t.prepend(R("","Webseite",e));let o=i("#cookieBar"),n=i("#cookieOk");if(!o||!n)return;let r=!1;try{r=localStorage.getItem(X)==="1"}catch{r=!1}o.hidden=r,n.addEventListener("click",()=>{o.hidden=!0;try{localStorage.setItem(X,"1")}catch{}})}var ye,Me,X,ee=v(()=>{"use strict";w();_();Z();ye=`
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
</footer>`,Me=`
<div class="cookiebar" id="cookieBar" role="region" aria-label="Hinweis zu Cookies" hidden>
  <div class="cookiebar__inner">
    <span class="cookiebar__mark"><svg><use href="#i-shield"/></svg></span>
    <p class="cookiebar__text">
      RL Nexus setzt nur Cookies, die f\xFCr die Anmeldung n\xF6tig sind \u2014 kein Tracking, keine Werbung,
      keine Weitergabe. Was gespeichert wird, steht im <a href="${d}/privacy">Datenschutz</a>.
    </p>
    <button class="btn btn--primary" type="button" id="cookieOk">Verstanden</button>
  </div>
</div>`,X="rlnexus.cookies"});function te(e){let t=i("#userbox"),o=i("#profile");if(!t||!o)return;t.insertAdjacentHTML("beforeend",Te),document.body.insertAdjacentHTML("beforeend",Se);let n=m("#userMenu"),r=N[e.group]??N.testphase;m("#menuAvatar").replaceChildren(j(e)),m("#menuName").textContent=e.name,m("#menuGroup").replaceChildren(u(r.icon),r.label);function a(s){n.hidden=!s,o.setAttribute("aria-expanded",String(s))}o.addEventListener("click",()=>{a(o.getAttribute("aria-expanded")!=="true"),F("primary")}),document.addEventListener("click",s=>{t.contains(s.target)||a(!1)}),document.addEventListener("keydown",s=>{s.key==="Escape"&&a(!1)});let c=m("#notesModal");for(let s of document.querySelectorAll(".modal [data-close]"))s.addEventListener("click",()=>s.closest("dialog")?.close());m("#openNotes").addEventListener("click",()=>{a(!1),T(),c.showModal(),K()}),m("#clearNotes").addEventListener("click",()=>J()),m("#openSettings").href=`${d}/user/${e.id}/settings`,T(),y()}var Te,Se,ne=v(()=>{"use strict";w();pe();P();I();ue();_();Te=`
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
</div>`,Se=`
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
</dialog>`});function oe(e){let t=document.querySelector("main");if(!t)return;let o=e.action??{label:"Zur \xDCbersicht",href:`${d}/`},n=p("a","erract erract--go"),r=p("a","erract");n.href=o.href,n.append(o.label,u("#i-arrow")),r.href="",r.append(u("#i-refresh"),"Neu laden"),t.replaceChildren(p("div","stage",p("div","empty empty--error errpage",p("span","empty__mark",u("#i-warn")),p("span","errcode",e.code),p("h2","",e.title),p("p","",e.text),p("div","erracts",n,r),...e.hint?[p("p","errhint",e.hint)]:[])))}var re=v(()=>{"use strict";_();w();fe()});function ie(){let e=i(".topbar");if(!e)return;let t=i(".controls"),o=()=>{if(e.classList.toggle("is-stuck",window.scrollY>8),t){let n=t.getBoundingClientRect().top<=e.offsetHeight+1;t.classList.toggle("is-stuck",n)}};window.addEventListener("scroll",o,{passive:!0}),o()}var ae=v(()=>{"use strict";w()});var Ce=le(()=>{w();q();ce();I();ee();P();ne();re();ae();function He(e){let t=i("#empty"),o=i("#grid");if(o&&o.replaceChildren(),e!=="servers"||!t){oe({code:"Keine Verbindung",title:"Der Inhalt l\xE4sst sich gerade nicht laden",text:"Der Bot antwortet nicht oder Discord hat die Anfrage gebremst. Deine Einstellungen sind davon nicht betroffen.",hint:"Lade die Seite in einem Moment neu \u2013 bleibt es dabei, l\xE4uft der Bot vermutlich nicht."});return}t.classList.add("is-on","empty--error");let n=i("#emptyIcon use");n&&n.setAttribute("href","#i-warn"),m("#emptyTitle").textContent="Serverliste nicht erreichbar",m("#emptyText").textContent="Der Bot antwortet gerade nicht oder Discord hat die Anfrage gebremst. Lade die Seite in einem Moment neu.";let r=i("#emptyReset");r&&(r.textContent="Neu laden",r.addEventListener("click",()=>window.location.reload()));let a=i("#resultline");a&&(a.textContent="Laden fehlgeschlagen")}async function Ne(){let e=document.body.dataset.page;if(ie(),A(),Q(),e==="static"){(await import("./chunks/Docu-KHXBYL3C.js")).bindDocNav();return}if(e==="board"){await(await import("./chunks/Board-6JF5NBC3.js")).renderBoard();return}if(e==="mansboard"){await(await import("./chunks/MansBoard-C3T5WE6K.js")).renderMansBoard();return}if(e==="clipsboard"){await(await import("./chunks/ClipsBoard-G333IK5Q.js")).renderClipsBoard();return}if(e==="apply"){await(await import("./chunks/Apply-WEWRLROI.js")).renderApplyPage();return}if(e==="matchups"){await(await import("./chunks/Matchups-GGQEQ5P6.js")).renderMatchupsPage();return}let t=e==="guild"?import("./chunks/Guild-DQMAA64E.js").then(r=>(r.prefetchGuild(),r)):e==="settings"?import("./chunks/Settings-TIX5RKWB.js"):import("./chunks/Servers-EYJEPLDS.js").then(r=>(e==="servers"&&r.skeletons(6),r)),o=await G();if(!o){W()||He(e??"");return}O(o.user),te(o.user),C(),window.setInterval(()=>{C()},z),import("./chunks/StaffPrompt-RBDNABGS.js").then(r=>r.watchStaffPrompts());let n=await t;"renderGuild"in n?n.renderGuild(o):"renderSettings"in n?n.renderSettings(o.user):n.renderServers(o)}Ne()});export default Ce();
