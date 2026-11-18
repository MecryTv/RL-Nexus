import{a as S,b as C,c as B}from"./chunks/chunk-5DBJJYH6.js";import{b as N,c as te}from"./chunks/chunk-F7ZI62AE.js";import{a as k,e as ne}from"./chunks/chunk-EA4TMCZG.js";import{d as I,e as re}from"./chunks/chunk-ZNE6ID5R.js";import{c as H,g as ee}from"./chunks/chunk-74UPNGAA.js";import{A as ie,h as l}from"./chunks/chunk-JPSCY5PY.js";import{c as A,d as oe}from"./chunks/chunk-7MZFYZBQ.js";import{d as T,e as X}from"./chunks/chunk-5DS5F4OW.js";import{a,b as h,c as g}from"./chunks/chunk-HD3JD5Y7.js";import{a as u,b as Q,c as d,d as r,f as m,g as M,j as f}from"./chunks/chunk-HUFDLLFV.js";function P(){return O}async function D(){let e;try{e=await fetch(h("/api/me"),{headers:{Accept:"application/json"}})}catch{return null}return e.status===401?(O=!0,window.location.href=`${a}/login?return=${encodeURIComponent(window.location.pathname)}`,null):e.ok?await e.json():null}var O,R=u(()=>{"use strict";g();O=!1});async function w(){let e;try{e=await fetch(h("/api/notifications"),{headers:{Accept:"application/json"}})}catch{return}if(!e.ok)return;let o=await e.json();b=o.notes,p=o.unread,v()}async function U(e){try{await fetch(h("/api/notifications"),{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify({action:e})})}catch{}}function v(){let e=r("#noteBadge"),o=r("#profileDot");e&&(e.textContent=String(p),e.hidden=p===0),o&&(o.hidden=p===0)}function E(){let e=r("#noteList"),o=r("#clearNotes");if(!e)return;if(o&&(o.hidden=b.length===0),b.length===0){let t=document.createElement("div");t.className="notes__none",t.append(m("#i-bell"),"Noch nichts passiert. Hier landen Meldungen, die dich betreffen."),e.replaceChildren(t);return}let n=document.createDocumentFragment();for(let t of b){let i=document.createElement(t.link?"a":"div");i.className=`note note--${t.kind}${t.read?"":" note--new"}`,t.link&&(i.href=t.link);let c=document.createElement("span");c.className="note__mark",c.appendChild(m(ae[t.kind]??"#i-info"));let L=document.createElement("div"),s=document.createElement("b");s.textContent=t.title;let x=document.createElement("p");x.textContent=t.body;let y=document.createElement("time");y.dateTime=t.at,y.textContent=H(new Date(t.at).getTime()),L.append(s,x,y),i.append(c,L),n.appendChild(i)}e.replaceChildren(n)}function j(){p!==0&&(p=0,v(),U("read"))}function F(){b=[],p=0,E(),v(),U("clear")}var $,b,p,ae,_=u(()=>{"use strict";f();ee();g();$=6e4,b=[],p=0;ae={info:"#i-info",success:"#i-check",warn:"#i-warn",group:"#i-shield",account:"#i-gamepad"}});function z(){document.body.insertAdjacentHTML("beforeend",se+de),N();let e=r('meta[name="rlnexus-site"]')?.content.trim(),o=r("#footerNav");e&&o&&o.prepend(M("","Webseite",e));let n=r("#cookieBar"),t=r("#cookieOk");if(!n||!t)return;let i=!1;try{i=localStorage.getItem(G)==="1"}catch{i=!1}n.hidden=i,t.addEventListener("click",()=>{n.hidden=!0;try{localStorage.setItem(G,"1")}catch{}})}var se,de,G,K=u(()=>{"use strict";f();g();te();se=`
<footer class="footer">
  <div class="shell footer__inner">
    <div class="footer__brand">
      <span class="footer__mark"><img src="${a}/assets/images/rl-nexus-n-96.png" alt="" width="26" height="26" decoding="async" loading="lazy"></span>
      <span>
        <b>RL Nexus</b>
        <i>Discord-Bot f\xFCr Rocket-League-Organisationen</i>
      </span>
    </div>

    <nav class="footer__nav" id="footerNav" aria-label="Fu\xDFzeile">
      <a href="${a}/docu">Dokumentation</a>
      <a href="${a}/privacy">Datenschutz</a>
      <a href="${a}/impressum">Impressum</a>
      <button type="button" data-report>Fehler melden</button>
    </nav>

    <p class="footer__note">
      Rocket League ist eine Marke von Psyonix LLC. RL Nexus steht nicht mit Psyonix oder Epic Games in Verbindung.
    </p>
  </div>
</footer>`,de=`
<div class="cookiebar" id="cookieBar" role="region" aria-label="Hinweis zu Cookies" hidden>
  <div class="cookiebar__inner">
    <span class="cookiebar__mark"><svg><use href="#i-shield"/></svg></span>
    <p class="cookiebar__text">
      RL Nexus setzt nur Cookies, die f\xFCr die Anmeldung n\xF6tig sind. Kein Tracking, keine Werbung,
      keine Weitergabe. Was gespeichert wird, steht im <a href="${a}/privacy">Datenschutz</a>.
    </p>
    <button class="btn btn--primary" type="button" id="cookieOk">Verstanden</button>
  </div>
</div>`,G="rlnexus.cookies"});function V(e){let o=r("#userbox"),n=r("#profile");if(!o||!n)return;o.insertAdjacentHTML("beforeend",ce),document.body.insertAdjacentHTML("beforeend",le);let t=d("#userMenu"),i=k[e.group]??k.testphase;d("#menuAvatar").replaceChildren(S(e)),d("#menuName").textContent=e.name,d("#menuGroup").replaceChildren(m(i.icon),i.label);function c(s){t.hidden=!s,n.setAttribute("aria-expanded",String(s))}n.addEventListener("click",()=>{c(n.getAttribute("aria-expanded")!=="true"),A("primary")}),document.addEventListener("click",s=>{o.contains(s.target)||c(!1)}),document.addEventListener("keydown",s=>{s.key==="Escape"&&c(!1)});let L=d("#notesModal");for(let s of document.querySelectorAll(".modal [data-close]"))s.addEventListener("click",()=>s.closest("dialog")?.close());d("#openNotes").addEventListener("click",()=>{c(!1),E(),L.showModal(),j()}),d("#clearNotes").addEventListener("click",()=>F()),d("#openSettings").href=`${a}/user/${e.id}/settings`,E(),v()}var ce,le,W=u(()=>{"use strict";f();ne();B();_();oe();g();ce=`
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
  <a class="menu__item menu__item--warn" href="${a}/logout" role="menuitem">
    <svg><use href="#i-logout"/></svg><span>Abmelden</span>
  </a>
</div>`,le=`
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
</dialog>`});function q(e){let o=document.querySelector("main");if(!o)return;let n=e.action??{label:"Zur \xDCbersicht",href:`${a}/`},t=l("a","erract erract--go"),i=l("a","erract");t.href=n.href,t.append(n.label,m("#i-arrow")),i.href="",i.append(m("#i-refresh"),"Neu laden"),o.replaceChildren(l("div","stage",l("div","empty empty--error errpage",l("span","empty__mark",m("#i-warn")),l("span","errcode",e.code),l("h2","",e.title),l("p","",e.text),l("div","erracts",t,i),...e.hint?[l("p","errhint",e.hint)]:[])))}var Y=u(()=>{"use strict";g();f();ie()});function J(){let e=r(".topbar");if(!e)return;let o=r(".controls"),n=()=>{if(e.classList.toggle("is-stuck",window.scrollY>8),o){let t=o.getBoundingClientRect().top<=e.offsetHeight+1;o.classList.toggle("is-stuck",t)}};window.addEventListener("scroll",n,{passive:!0}),n()}var Z=u(()=>{"use strict";f()});var ue=Q(()=>{f();R();X();_();K();B();W();Y();Z();re();function me(e){let o=r("#empty"),n=r("#grid");if(n&&n.replaceChildren(),e!=="servers"||!o){q({code:"Keine Verbindung",title:"Der Inhalt l\xE4sst sich gerade nicht laden",text:"Der Bot antwortet nicht oder Discord hat die Anfrage gebremst. Deine Einstellungen sind davon nicht betroffen.",hint:"Lade die Seite in einem Moment neu. Bleibt es dabei, l\xE4uft der Bot vermutlich nicht."});return}o.classList.add("is-on","empty--error");let t=r("#emptyIcon use");t&&t.setAttribute("href","#i-warn"),d("#emptyTitle").textContent="Serverliste nicht erreichbar",d("#emptyText").textContent="Der Bot antwortet gerade nicht oder Discord hat die Anfrage gebremst. Lade die Seite in einem Moment neu.";let i=r("#emptyReset");i&&(i.textContent="Neu laden",i.addEventListener("click",()=>window.location.reload()));let c=r("#resultline");c&&(c.textContent="Laden fehlgeschlagen")}async function pe(){let e=document.body.dataset.page;if(J(),T(),z(),e==="static"){(await import("./chunks/Docu-KHXBYL3C.js")).bindDocNav();return}if(e==="board"){await(await import("./chunks/Board-CTTK7OWC.js")).renderBoard();return}if(e==="mansboard"){await(await import("./chunks/MansBoard-IDTXLLHV.js")).renderMansBoard();return}if(e==="clipsboard"){await(await import("./chunks/ClipsBoard-LMTT5B2X.js")).renderClipsBoard();return}if(e==="apply"){await(await import("./chunks/Apply-W5JFZIO3.js")).renderApplyPage();return}if(e==="matchups"){await(await import("./chunks/Matchups-QGOQJP7Y.js")).renderMatchupsPage();return}let o=e==="guild"?import("./chunks/Guild-FD7HOSW7.js").then(i=>(i.prefetchGuild(),i)):e==="settings"?import("./chunks/Settings-EJBV7RDT.js"):import("./chunks/Servers-IYHLJD6O.js").then(i=>(e==="servers"&&i.skeletons(6),i)),n=await D();if(!n){P()||me(e??"");return}I(n.catalog),C(n.user),V(n.user),w(),window.setInterval(()=>{w()},$),import("./chunks/StaffPrompt-NB7QZ26S.js").then(i=>i.watchStaffPrompts());let t=await o;"renderGuild"in t?t.renderGuild(n):"renderSettings"in t?t.renderSettings(n.user):t.renderServers(n)}pe()});export default ue();
