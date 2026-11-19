import{b as N,c as te}from"./chunks/chunk-KMHAED7W.js";import{a as S,b as C,c as B}from"./chunks/chunk-VHPYZAHW.js";import{a as k,e as ne}from"./chunks/chunk-3GZWRIYY.js";import{d as I,e as re}from"./chunks/chunk-KYWSJSXW.js";import{c as H,g as ee}from"./chunks/chunk-LDBCWJZ2.js";import{c as A,d as oe}from"./chunks/chunk-Z2TG43UV.js";import{d as T,e as X}from"./chunks/chunk-QCD4JPUB.js";import{A as ie,h as c}from"./chunks/chunk-YWKQQLN5.js";import{a,b as p,c as g}from"./chunks/chunk-6U5DS37U.js";import{a as d,b as r,d as m,e as M,h}from"./chunks/chunk-5XZ732EQ.js";import{a as f,b as Q}from"./chunks/chunk-VR2J32YB.js";function P(){return O}async function D(){let e;try{e=await fetch(p("/api/me"),{headers:{Accept:"application/json"}})}catch{return null}return e.status===401?(O=!0,window.location.href=`${a}/login?return=${encodeURIComponent(window.location.pathname)}`,null):e.ok?await e.json():null}var O,R=f(()=>{"use strict";g();O=!1});async function w(){let e;try{e=await fetch(p("/api/notifications"),{headers:{Accept:"application/json"}})}catch{return}if(!e.ok)return;let i=await e.json();b=i.notes,u=i.unread,v()}async function U(e){try{await fetch(p("/api/notifications"),{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify({action:e})})}catch{}}function v(){let e=r("#noteBadge"),i=r("#profileDot");e&&(e.textContent=String(u),e.hidden=u===0),i&&(i.hidden=u===0)}function E(){let e=r("#noteList"),i=r("#clearNotes");if(!e)return;if(i&&(i.hidden=b.length===0),b.length===0){let t=document.createElement("div");t.className="notes__none",t.append(m("#i-bell"),"Noch nichts passiert. Hier landen Meldungen, die dich betreffen."),e.replaceChildren(t);return}let o=document.createDocumentFragment();for(let t of b){let n=document.createElement(t.link?"a":"div");n.className=`note note--${t.kind}${t.read?"":" note--new"}`,t.link&&(n.href=t.link);let l=document.createElement("span");l.className="note__mark",l.appendChild(m(ae[t.kind]??"#i-info"));let L=document.createElement("div"),s=document.createElement("b");s.textContent=t.title;let x=document.createElement("p");x.textContent=t.body;let y=document.createElement("time");y.dateTime=t.at,y.textContent=H(new Date(t.at).getTime()),L.append(s,x,y),n.append(l,L),o.appendChild(n)}e.replaceChildren(o)}function j(){u!==0&&(u=0,v(),U("read"))}function F(){b=[],u=0,E(),v(),U("clear")}var $,b,u,ae,_=f(()=>{"use strict";h();ee();g();$=6e4,b=[],u=0;ae={info:"#i-info",success:"#i-check",warn:"#i-warn",group:"#i-shield",account:"#i-gamepad"}});function z(){document.body.insertAdjacentHTML("beforeend",se+de),N();let e=r('meta[name="rlnexus-site"]')?.content.trim(),i=r("#footerNav");e&&i&&i.prepend(M("","Webseite",e));let o=r("#cookieBar"),t=r("#cookieOk");if(!o||!t)return;let n=!1;try{n=localStorage.getItem(G)==="1"}catch{n=!1}o.hidden=n,t.addEventListener("click",()=>{o.hidden=!0;try{localStorage.setItem(G,"1")}catch{}})}var se,de,G,K=f(()=>{"use strict";h();g();te();se=`
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
</div>`,G="rlnexus.cookies"});function V(e){let i=r("#userbox"),o=r("#profile");if(!i||!o)return;i.insertAdjacentHTML("beforeend",le),document.body.insertAdjacentHTML("beforeend",ce);let t=d("#userMenu"),n=k[e.group]??k.testphase;d("#menuAvatar").replaceChildren(S(e)),d("#menuName").textContent=e.name,d("#menuGroup").replaceChildren(m(n.icon),n.label);function l(s){t.hidden=!s,o.setAttribute("aria-expanded",String(s))}o.addEventListener("click",()=>{l(o.getAttribute("aria-expanded")!=="true"),A("primary")}),document.addEventListener("click",s=>{i.contains(s.target)||l(!1)}),document.addEventListener("keydown",s=>{s.key==="Escape"&&l(!1)});let L=d("#notesModal");for(let s of document.querySelectorAll(".modal [data-close]"))s.addEventListener("click",()=>s.closest("dialog")?.close());d("#openNotes").addEventListener("click",()=>{l(!1),E(),L.showModal(),j()}),d("#clearNotes").addEventListener("click",()=>F()),d("#openSettings").href=`${a}/user/${e.id}/settings`,E(),v()}var le,ce,W=f(()=>{"use strict";h();ne();B();_();oe();g();le=`
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
</div>`,ce=`
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
</dialog>`});function q(e){let i=document.querySelector("main");if(!i)return;let o=e.action??{label:"Zur \xDCbersicht",href:`${a}/`},t=c("a","erract erract--go"),n=c("a","erract");t.href=o.href,t.append(o.label,m("#i-arrow")),n.href="",n.append(m("#i-refresh"),"Neu laden"),i.replaceChildren(c("div","stage",c("div","empty empty--error errpage",c("span","empty__mark",m("#i-warn")),c("span","errcode",e.code),c("h2","",e.title),c("p","",e.text),c("div","erracts",t,n),...e.hint?[c("p","errhint",e.hint)]:[])))}var Y=f(()=>{"use strict";g();h();ie()});function J(){let e=r(".topbar");if(!e)return;let i=r(".controls"),o=()=>{if(e.classList.toggle("is-stuck",window.scrollY>8),i){let t=i.getBoundingClientRect().top<=e.offsetHeight+1;i.classList.toggle("is-stuck",t)}};window.addEventListener("scroll",o,{passive:!0}),o()}var Z=f(()=>{"use strict";h()});var ue=Q(()=>{h();R();X();_();K();B();W();Y();Z();re();g();function me(e){let i=r("#empty"),o=r("#grid");if(o&&o.replaceChildren(),e!=="servers"||!i){q({code:"Keine Verbindung",title:"Der Inhalt l\xE4sst sich gerade nicht laden",text:"Der Bot antwortet nicht oder Discord hat die Anfrage gebremst. Deine Einstellungen sind davon nicht betroffen.",hint:"Lade die Seite in einem Moment neu. Bleibt es dabei, l\xE4uft der Bot vermutlich nicht."});return}i.classList.add("is-on","empty--error");let t=r("#emptyIcon use");t&&t.setAttribute("href","#i-warn"),d("#emptyTitle").textContent="Serverliste nicht erreichbar",d("#emptyText").textContent="Der Bot antwortet gerade nicht oder Discord hat die Anfrage gebremst. Lade die Seite in einem Moment neu.";let n=r("#emptyReset");n&&(n.textContent="Neu laden",n.addEventListener("click",()=>window.location.reload()));let l=r("#resultline");l&&(l.textContent="Laden fehlgeschlagen")}async function pe(){let e=document.body.dataset.page;if(import("./chunks/Vitals-MVLOQFYO.js").then(n=>n.startVitals(p("/api/vitals"))),J(),T(),z(),e==="static"){(await import("./chunks/Docu-OCWHJWVF.js")).bindDocNav();return}if(e==="board"){await(await import("./chunks/Board-IG3WPJJP.js")).renderBoard();return}if(e==="mansboard"){await(await import("./chunks/MansBoard-XCL5CFUT.js")).renderMansBoard();return}if(e==="clipsboard"){await(await import("./chunks/ClipsBoard-XCMJKD5U.js")).renderClipsBoard();return}if(e==="apply"){await(await import("./chunks/Apply-UFVSUJKD.js")).renderApplyPage();return}if(e==="matchups"){await(await import("./chunks/Matchups-QA455FGU.js")).renderMatchupsPage();return}let i=e==="guild"?import("./chunks/Guild-22CSJLRH.js").then(n=>(n.prefetchGuild(),n)):e==="settings"?import("./chunks/Settings-I6J4RFIU.js"):import("./chunks/Servers-GYFBV2MX.js").then(n=>(e==="servers"&&n.skeletons(6),n)),o=await D();if(!o){P()||me(e??"");return}I(o.catalog),C(o.user),V(o.user),w(),window.setInterval(()=>{w()},$),import("./chunks/StaffPrompt-FWKWR3ZC.js").then(n=>n.watchStaffPrompts());let t=await i;"renderGuild"in t?t.renderGuild(o):"renderSettings"in t?t.renderSettings(o.user):t.renderServers(o)}pe()});export default ue();
