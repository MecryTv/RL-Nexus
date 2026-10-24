import{a as I,b as B,c as R}from"./chunks/chunk-YINQPI4I.js";import{a as T,e as ce}from"./chunks/chunk-CXQXA37P.js";import{b as A,e as se}from"./chunks/chunk-IH5S24F5.js";import{a as u,s as me}from"./chunks/chunk-VIBSL55H.js";import"./chunks/chunk-BIWQ4EU5.js";import"./chunks/chunk-R3EZSXW6.js";import{c as O,d as de}from"./chunks/chunk-GIVT6A2M.js";import{a as D,b as le}from"./chunks/chunk-CZHQ4F6H.js";import{d as C,e as ie}from"./chunks/chunk-WC4N6S6D.js";import"./chunks/chunk-SWDDTOCG.js";import{a as c,b as E,c as x}from"./chunks/chunk-WRBNFJXV.js";import{a as g,b as ae,c as d,d as a,f as p,g as S,j as v}from"./chunks/chunk-HUFDLLFV.js";function $(){return j}async function P(){let e;try{e=await fetch(E("/api/me"),{headers:{Accept:"application/json"}})}catch{return null}return e.status===401?(j=!0,window.location.href=`${c}/login?return=${encodeURIComponent(window.location.pathname)}`,null):e.ok?await e.json():null}var j,F=g(()=>{"use strict";x();j=!1});async function H(){let e;try{e=await fetch(E("/api/notifications"),{headers:{Accept:"application/json"}})}catch{return}if(!e.ok)return;let o=await e.json();L=o.notes,_=o.unread,k()}async function U(e){try{await fetch(E("/api/notifications"),{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify({action:e})})}catch{}}function k(){let e=a("#noteBadge"),o=a("#profileDot");e&&(e.textContent=String(_),e.hidden=_===0),o&&(o.hidden=_===0)}function M(){let e=a("#noteList"),o=a("#clearNotes");if(!e)return;if(o&&(o.hidden=L.length===0),L.length===0){let t=document.createElement("div");t.className="notes__none",t.append(p("#i-bell"),"Noch nichts passiert. Hier landen Meldungen, die dich betreffen."),e.replaceChildren(t);return}let n=document.createDocumentFragment();for(let t of L){let r=document.createElement(t.link?"a":"div");r.className=`note note--${t.kind}${t.read?"":" note--new"}`,t.link&&(r.href=t.link);let i=document.createElement("span");i.className="note__mark",i.appendChild(p(pe[t.kind]??"#i-info"));let f=document.createElement("div"),s=document.createElement("b");s.textContent=t.title;let l=document.createElement("p");l.textContent=t.body;let m=document.createElement("time");m.dateTime=t.at,m.textContent=A(new Date(t.at).getTime()),f.append(s,l,m),r.append(i,f),n.appendChild(r)}e.replaceChildren(n)}function G(){_!==0&&(_=0,k(),U("read"))}function z(){L=[],_=0,M(),k(),U("clear")}var W,L,_,pe,N=g(()=>{"use strict";v();se();x();W=6e4,L=[],_=0;pe={info:"#i-info",success:"#i-check",warn:"#i-warn",group:"#i-shield",account:"#i-gamepad"}});function ge(e){let o=[e.message,e.context?`
Wo und wie:
${e.context}`:"",e.contact?`
Kontakt: ${e.contact}`:"",`
Seite: ${location.pathname}`].join(`
`),n=o.length>1400?`${o.slice(0,1400)}

[gek\xFCrzt]`:o;return`mailto:${ue}?subject=${encodeURIComponent(`[RL Nexus \xB7 Fehler] ${e.subject}`)}&body=${encodeURIComponent(n)}`}function K(){document.body.insertAdjacentHTML("beforeend",be);let e=a("#reportModal"),o=a("#reportForm"),n=a("#reportState"),t=a("#reportSend");if(!e||!o||!n||!t)return;let r=l=>o.elements.namedItem(l),i=(l,m="",h)=>{if(n.className=`report__state ${m}`.trim(),n.textContent=l,h){let w=document.createElement("a");w.href=h.href,w.textContent=h.label,n.append(" ",w)}},f=()=>{i("");for(let l of["subject","message"])r(l).removeAttribute("aria-invalid");e.showModal(),r("subject").focus()},s=()=>e.close();a("#reportClose")?.addEventListener("click",s),document.addEventListener("click",l=>{l.target.closest("[data-report]")&&(l.preventDefault(),f())}),o.addEventListener("submit",async l=>{l.preventDefault();let m=Object.fromEntries(["subject","message","context","contact","website"].map(y=>[y,r(y).value.trim()])),h=m.subject.length<4?"subject":m.message.length<20?"message":null;if(h){r(h).setAttribute("aria-invalid","true"),r(h).focus(),i(h==="subject"?"Ein Betreff mit ein paar W\xF6rtern hilft beim Einordnen.":"Beschreib den Fehler bitte etwas genauer, mindestens 20 Zeichen.","is-warn");return}for(let y of["subject","message"])r(y).removeAttribute("aria-invalid");t.disabled=!0,i("Wird gesendet \u2026");let w=/\/guild\/(\d{17,20})/.exec(location.pathname)?.[1]??null,b=null;try{b=await fetch(E("/api/report"),{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify({...m,guildId:w,page:location.pathname})})}catch{b=null}finally{t.disabled=!1}if(b?.ok){o.reset(),s(),D("info","Danke f\xFCr die Meldung","Sie ist beim Team angekommen. Wir melden uns, sobald wir mehr wissen.");return}if(!b||b.status===503||b.status===502){i("Der Bot kann die Meldung gerade nicht selbst verschicken.","is-warn",{href:ge(m),label:"Im Mailprogramm \xF6ffnen"});return}let re=await b.json().catch(()=>({}));i(re.error??"Das hat nicht geklappt. Versuch es gleich noch einmal.","is-warn")})}var ue,fe,he,be,V=g(()=>{"use strict";v();x();le();ue="support@nexus-emb.de",fe="https://discord.gg/CjG2HFGw95",he='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>',be=`
<dialog class="modal report" id="reportModal" aria-labelledby="reportTitle">
  <div class="modal__head">
    <div>
      <h2 id="reportTitle">Fehler melden</h2>
      <p>Geht direkt an das RL Nexus Team.</p>
    </div>
    <button class="iconbtn modal__x" type="button" id="reportClose" aria-label="Schlie\xDFen">${he}</button>
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
      <a class="btn btn--quiet" href="${fe}" target="_blank" rel="noopener">Lieber im Discord</a>
      <button class="btn btn--primary" type="submit" id="reportSend">Meldung senden</button>
    </div>
    <p class="hintline">In Discord geht es auch mit <code>/fehler</code>, auf jedem Server mit RL Nexus.</p>
  </form>
</dialog>`});function Z(){document.body.insertAdjacentHTML("beforeend",ve+Ee),K();let e=a('meta[name="rlnexus-site"]')?.content.trim(),o=a("#footerNav");e&&o&&o.prepend(S("","Webseite",e));let n=a("#cookieBar"),t=a("#cookieOk");if(!n||!t)return;let r=!1;try{r=localStorage.getItem(q)==="1"}catch{r=!1}n.hidden=r,t.addEventListener("click",()=>{n.hidden=!0;try{localStorage.setItem(q,"1")}catch{}})}var ve,Ee,q,J=g(()=>{"use strict";v();x();V();ve=`
<footer class="footer">
  <div class="shell footer__inner">
    <div class="footer__brand">
      <span class="footer__mark"><img src="${c}/assets/images/rl-nexus-n-96.png" alt="" width="26" height="26" decoding="async" loading="lazy"></span>
      <span>
        <b>RL Nexus</b>
        <i>Discord-Bot f\xFCr Rocket-League-Organisationen</i>
      </span>
    </div>

    <nav class="footer__nav" id="footerNav" aria-label="Fu\xDFzeile">
      <a href="${c}/docu">Dokumentation</a>
      <a href="${c}/privacy">Datenschutz</a>
      <a href="${c}/impressum">Impressum</a>
      <button type="button" data-report>Fehler melden</button>
    </nav>

    <p class="footer__note">
      Rocket League ist eine Marke von Psyonix LLC. RL Nexus steht nicht mit Psyonix oder Epic Games in Verbindung.
    </p>
  </div>
</footer>`,Ee=`
<div class="cookiebar" id="cookieBar" role="region" aria-label="Hinweis zu Cookies" hidden>
  <div class="cookiebar__inner">
    <span class="cookiebar__mark"><svg><use href="#i-shield"/></svg></span>
    <p class="cookiebar__text">
      RL Nexus setzt nur Cookies, die f\xFCr die Anmeldung n\xF6tig sind \u2014 kein Tracking, keine Werbung,
      keine Weitergabe. Was gespeichert wird, steht im <a href="${c}/privacy">Datenschutz</a>.
    </p>
    <button class="btn btn--primary" type="button" id="cookieOk">Verstanden</button>
  </div>
</div>`,q="rlnexus.cookies"});function Y(e){let o=a("#userbox"),n=a("#profile");if(!o||!n)return;o.insertAdjacentHTML("beforeend",_e),document.body.insertAdjacentHTML("beforeend",xe);let t=d("#userMenu"),r=T[e.group]??T.testphase;d("#menuAvatar").replaceChildren(I(e)),d("#menuName").textContent=e.name,d("#menuGroup").replaceChildren(p(r.icon),r.label);function i(s){t.hidden=!s,n.setAttribute("aria-expanded",String(s))}n.addEventListener("click",()=>{i(n.getAttribute("aria-expanded")!=="true"),O("primary")}),document.addEventListener("click",s=>{o.contains(s.target)||i(!1)}),document.addEventListener("keydown",s=>{s.key==="Escape"&&i(!1)});let f=d("#notesModal");for(let s of document.querySelectorAll(".modal [data-close]"))s.addEventListener("click",()=>s.closest("dialog")?.close());d("#openNotes").addEventListener("click",()=>{i(!1),M(),f.showModal(),G()}),d("#clearNotes").addEventListener("click",()=>z()),d("#openSettings").href=`${c}/user/${e.id}/settings`,M(),k()}var _e,xe,Q=g(()=>{"use strict";v();ce();R();N();de();x();_e=`
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
  <a class="menu__item menu__item--warn" href="${c}/logout" role="menuitem">
    <svg><use href="#i-logout"/></svg><span>Abmelden</span>
  </a>
</div>`,xe=`
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
</dialog>`});function X(e){let o=document.querySelector("main");if(!o)return;let n=e.action??{label:"Zur \xDCbersicht",href:`${c}/`},t=u("a","erract erract--go"),r=u("a","erract");t.href=n.href,t.append(n.label,p("#i-arrow")),r.href="",r.append(p("#i-refresh"),"Neu laden"),o.replaceChildren(u("div","stage",u("div","empty empty--error errpage",u("span","empty__mark",p("#i-warn")),u("span","errcode",e.code),u("h2","",e.title),u("p","",e.text),u("div","erracts",t,r),...e.hint?[u("p","errhint",e.hint)]:[])))}var ee=g(()=>{"use strict";x();v();me()});function te(){let e=a(".topbar");if(!e)return;let o=a(".controls"),n=()=>{if(e.classList.toggle("is-stuck",window.scrollY>8),o){let t=o.getBoundingClientRect().top<=e.offsetHeight+1;o.classList.toggle("is-stuck",t)}};window.addEventListener("scroll",n,{passive:!0}),n()}function ne(e,o){let n=a(".topbar");if(!e||!n)return;let t=document.createElement("div"),r=document.createElement("div"),i=document.createElement("p"),f=document.createElement("b");t.className="staffbar",t.setAttribute("role","status"),r.className="shell staffbar__inner",f.textContent="Wartung l\xE4uft",i.append(f,`${e.endsAt?` bis voraussichtlich ${we.format(new Date(e.endsAt))} Uhr.`:", ohne Endzeit."} Du siehst das Dashboard, weil du ${o==="administrator"?"Administrator":"Developer"} bist. Alle anderen sehen die Wartungsseite. Schalter im Admin Dashboard unter Developer \u2192 Wartung.`),r.append(p("#i-warn"),i),t.append(r),n.append(t)}var we,oe=g(()=>{"use strict";v();we=new Intl.DateTimeFormat("de-DE",{timeZone:"Europe/Berlin",hour:"numeric",minute:"2-digit"})});var ye=ae(()=>{v();F();ie();N();J();R();Q();ee();oe();function Le(e){let o=a("#empty"),n=a("#grid");if(n&&n.replaceChildren(),e!=="servers"||!o){X({code:"Keine Verbindung",title:"Der Inhalt l\xE4sst sich gerade nicht laden",text:"Der Bot antwortet nicht oder Discord hat die Anfrage gebremst. Deine Einstellungen sind davon nicht betroffen.",hint:"Lade die Seite in einem Moment neu \u2013 bleibt es dabei, l\xE4uft der Bot vermutlich nicht."});return}o.classList.add("is-on","empty--error");let t=a("#emptyIcon use");t&&t.setAttribute("href","#i-warn"),d("#emptyTitle").textContent="Serverliste nicht erreichbar",d("#emptyText").textContent="Der Bot antwortet gerade nicht oder Discord hat die Anfrage gebremst. Lade die Seite in einem Moment neu.";let r=a("#emptyReset");r&&(r.textContent="Neu laden",r.addEventListener("click",()=>window.location.reload()));let i=a("#resultline");i&&(i.textContent="Laden fehlgeschlagen")}async function ke(){let e=document.body.dataset.page;if(te(),C(),Z(),e==="static"){(await import("./chunks/Docu-KHXBYL3C.js")).bindDocNav();return}if(e==="board"){await(await import("./chunks/Board-LP6NAIMN.js")).renderBoard();return}if(e==="mansboard"){await(await import("./chunks/MansBoard-R6USXVR5.js")).renderMansBoard();return}if(e==="clipsboard"){await(await import("./chunks/ClipsBoard-TSGQXGPC.js")).renderClipsBoard();return}if(e==="apply"){await(await import("./chunks/Apply-2RMLRKCF.js")).renderApplyPage();return}if(e==="matchups"){await(await import("./chunks/Matchups-AEY3CFH5.js")).renderMatchupsPage();return}let o=e==="guild"?import("./chunks/Guild-T4OJGOVS.js").then(r=>(r.prefetchGuild(),r)):e==="settings"?import("./chunks/Settings-2D7BDVZN.js"):import("./chunks/Servers-5UQUSX6I.js").then(r=>(e==="servers"&&r.skeletons(6),r)),n=await P();if(!n){$()||Le(e??"");return}B(n.user),Y(n.user),ne(n.maintenance,n.user.group),H(),window.setInterval(()=>{H()},W);let t=await o;"renderGuild"in t?t.renderGuild(n):"renderSettings"in t?t.renderSettings(n.user):t.renderServers(n)}ke()});export default ye();
