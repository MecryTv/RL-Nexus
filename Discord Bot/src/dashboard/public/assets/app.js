import{a as B,b as R,c as j}from"./chunks/chunk-YINQPI4I.js";import{a as T,e as le}from"./chunks/chunk-CXQXA37P.js";import{b as A,e as ae}from"./chunks/chunk-IH5S24F5.js";import{a as p,s as de}from"./chunks/chunk-VIBSL55H.js";import"./chunks/chunk-BIWQ4EU5.js";import"./chunks/chunk-R3EZSXW6.js";import{c as D,d as ce}from"./chunks/chunk-GIVT6A2M.js";import{a as I,b as se}from"./chunks/chunk-CZHQ4F6H.js";import{d as C,e as ie}from"./chunks/chunk-WC4N6S6D.js";import"./chunks/chunk-SWDDTOCG.js";import{a as c,b as v,c as L}from"./chunks/chunk-WRBNFJXV.js";import{a as g,b as re,c as d,d as i,f as u,g as S,j as b}from"./chunks/chunk-HUFDLLFV.js";function $(){return O}async function P(){let e;try{e=await fetch(v("/api/me"),{headers:{Accept:"application/json"}})}catch{return null}return e.status===401?(O=!0,window.location.href=`${c}/login?return=${encodeURIComponent(window.location.pathname)}`,null):e.ok?await e.json():null}var O,F=g(()=>{"use strict";L();O=!1});async function H(){let e;try{e=await fetch(v("/api/notifications"),{headers:{Accept:"application/json"}})}catch{return}if(!e.ok)return;let n=await e.json();w=n.notes,_=n.unread,k()}async function W(e){try{await fetch(v("/api/notifications"),{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify({action:e})})}catch{}}function k(){let e=i("#noteBadge"),n=i("#profileDot");e&&(e.textContent=String(_),e.hidden=_===0),n&&(n.hidden=_===0)}function M(){let e=i("#noteList"),n=i("#clearNotes");if(!e)return;if(n&&(n.hidden=w.length===0),w.length===0){let t=document.createElement("div");t.className="notes__none",t.append(u("#i-bell"),"Noch nichts passiert. Hier landen Meldungen, die dich betreffen."),e.replaceChildren(t);return}let o=document.createDocumentFragment();for(let t of w){let r=document.createElement(t.link?"a":"div");r.className=`note note--${t.kind}${t.read?"":" note--new"}`,t.link&&(r.href=t.link);let a=document.createElement("span");a.className="note__mark",a.appendChild(u(me[t.kind]??"#i-info"));let x=document.createElement("div"),s=document.createElement("b");s.textContent=t.title;let l=document.createElement("p");l.textContent=t.body;let m=document.createElement("time");m.dateTime=t.at,m.textContent=A(new Date(t.at).getTime()),x.append(s,l,m),r.append(a,x),o.appendChild(r)}e.replaceChildren(o)}function G(){_!==0&&(_=0,k(),W("read"))}function z(){w=[],_=0,M(),k(),W("clear")}var U,w,_,me,N=g(()=>{"use strict";b();ae();L();U=6e4,w=[],_=0;me={info:"#i-info",success:"#i-check",warn:"#i-warn",group:"#i-shield",account:"#i-gamepad"}});function ge(e){let n=[e.message,e.context?`
Wo und wie:
${e.context}`:"",e.contact?`
Kontakt: ${e.contact}`:"",`
Seite: ${location.pathname}`].join(`
`),o=n.length>1400?`${n.slice(0,1400)}

[gek\xFCrzt]`:n;return`mailto:${pe}?subject=${encodeURIComponent(`[RL Nexus \xB7 Fehler] ${e.subject}`)}&body=${encodeURIComponent(o)}`}function K(){document.body.insertAdjacentHTML("beforeend",he);let e=i("#reportModal"),n=i("#reportForm"),o=i("#reportState"),t=i("#reportSend");if(!e||!n||!o||!t)return;let r=l=>n.elements.namedItem(l),a=(l,m="",f)=>{if(o.className=`report__state ${m}`.trim(),o.textContent=l,f){let E=document.createElement("a");E.href=f.href,E.textContent=f.label,o.append(" ",E)}},x=()=>{a("");for(let l of["subject","message"])r(l).removeAttribute("aria-invalid");e.showModal(),r("subject").focus()},s=()=>e.close();i("#reportClose")?.addEventListener("click",s),document.addEventListener("click",l=>{l.target.closest("[data-report]")&&(l.preventDefault(),x())}),n.addEventListener("submit",async l=>{l.preventDefault();let m=Object.fromEntries(["subject","message","context","contact","website"].map(y=>[y,r(y).value.trim()])),f=m.subject.length<4?"subject":m.message.length<20?"message":null;if(f){r(f).setAttribute("aria-invalid","true"),r(f).focus(),a(f==="subject"?"Ein Betreff mit ein paar W\xF6rtern hilft beim Einordnen.":"Beschreib den Fehler bitte etwas genauer, mindestens 20 Zeichen.","is-warn");return}for(let y of["subject","message"])r(y).removeAttribute("aria-invalid");t.disabled=!0,a("Wird gesendet \u2026");let E=/\/guild\/(\d{17,20})/.exec(location.pathname)?.[1]??null,h=null;try{h=await fetch(v("/api/report"),{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify({...m,guildId:E,page:location.pathname})})}catch{h=null}finally{t.disabled=!1}if(h?.ok){n.reset(),s(),I("info","Danke f\xFCr die Meldung","Sie ist beim Team angekommen. Wir melden uns, sobald wir mehr wissen.");return}if(!h||h.status===503||h.status===502){a("Der Bot kann die Meldung gerade nicht selbst verschicken.","is-warn",{href:ge(m),label:"Im Mailprogramm \xF6ffnen"});return}let oe=await h.json().catch(()=>({}));a(oe.error??"Das hat nicht geklappt. Versuch es gleich noch einmal.","is-warn")})}var pe,ue,fe,he,V=g(()=>{"use strict";b();L();se();pe="support@nexus-emb.de",ue="https://discord.gg/CjG2HFGw95",fe='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>',he=`
<dialog class="modal report" id="reportModal" aria-labelledby="reportTitle">
  <div class="modal__head">
    <div>
      <h2 id="reportTitle">Fehler melden</h2>
      <p>Geht direkt an das RL Nexus Team.</p>
    </div>
    <button class="iconbtn modal__x" type="button" id="reportClose" aria-label="Schlie\xDFen">${fe}</button>
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
      <a class="btn btn--quiet" href="${ue}" target="_blank" rel="noopener">Lieber im Discord</a>
      <button class="btn btn--primary" type="submit" id="reportSend">Meldung senden</button>
    </div>
    <p class="hintline">In Discord geht es auch mit <code>/fehler</code>, auf jedem Server mit RL Nexus.</p>
  </form>
</dialog>`});function J(){document.body.insertAdjacentHTML("beforeend",be+ve),K();let e=i('meta[name="rlnexus-site"]')?.content.trim(),n=i("#footerNav");e&&n&&n.prepend(S("","Webseite",e));let o=i("#cookieBar"),t=i("#cookieOk");if(!o||!t)return;let r=!1;try{r=localStorage.getItem(q)==="1"}catch{r=!1}o.hidden=r,t.addEventListener("click",()=>{o.hidden=!0;try{localStorage.setItem(q,"1")}catch{}})}var be,ve,q,Y=g(()=>{"use strict";b();L();V();be=`
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
</footer>`,ve=`
<div class="cookiebar" id="cookieBar" role="region" aria-label="Hinweis zu Cookies" hidden>
  <div class="cookiebar__inner">
    <span class="cookiebar__mark"><svg><use href="#i-shield"/></svg></span>
    <p class="cookiebar__text">
      RL Nexus setzt nur Cookies, die f\xFCr die Anmeldung n\xF6tig sind \u2014 kein Tracking, keine Werbung,
      keine Weitergabe. Was gespeichert wird, steht im <a href="${c}/privacy">Datenschutz</a>.
    </p>
    <button class="btn btn--primary" type="button" id="cookieOk">Verstanden</button>
  </div>
</div>`,q="rlnexus.cookies"});function Z(e){let n=i("#userbox"),o=i("#profile");if(!n||!o)return;n.insertAdjacentHTML("beforeend",_e),document.body.insertAdjacentHTML("beforeend",xe);let t=d("#userMenu"),r=T[e.group]??T.testphase;d("#menuAvatar").replaceChildren(B(e)),d("#menuName").textContent=e.name,d("#menuGroup").replaceChildren(u(r.icon),r.label);function a(s){t.hidden=!s,o.setAttribute("aria-expanded",String(s))}o.addEventListener("click",()=>{a(o.getAttribute("aria-expanded")!=="true"),D("primary")}),document.addEventListener("click",s=>{n.contains(s.target)||a(!1)}),document.addEventListener("keydown",s=>{s.key==="Escape"&&a(!1)});let x=d("#notesModal");for(let s of document.querySelectorAll(".modal [data-close]"))s.addEventListener("click",()=>s.closest("dialog")?.close());d("#openNotes").addEventListener("click",()=>{a(!1),M(),x.showModal(),G()}),d("#clearNotes").addEventListener("click",()=>z()),d("#openSettings").href=`${c}/user/${e.id}/settings`,M(),k()}var _e,xe,Q=g(()=>{"use strict";b();le();j();N();ce();L();_e=`
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
</dialog>`});function X(e){let n=document.querySelector("main");if(!n)return;let o=e.action??{label:"Zur \xDCbersicht",href:`${c}/`},t=p("a","erract erract--go"),r=p("a","erract");t.href=o.href,t.append(o.label,u("#i-arrow")),r.href="",r.append(u("#i-refresh"),"Neu laden"),n.replaceChildren(p("div","stage",p("div","empty empty--error errpage",p("span","empty__mark",u("#i-warn")),p("span","errcode",e.code),p("h2","",e.title),p("p","",e.text),p("div","erracts",t,r),...e.hint?[p("p","errhint",e.hint)]:[])))}var ee=g(()=>{"use strict";L();b();de()});function te(){let e=i(".topbar");if(!e)return;let n=i(".controls"),o=()=>{if(e.classList.toggle("is-stuck",window.scrollY>8),n){let t=n.getBoundingClientRect().top<=e.offsetHeight+1;n.classList.toggle("is-stuck",t)}};window.addEventListener("scroll",o,{passive:!0}),o()}var ne=g(()=>{"use strict";b()});var we=re(()=>{b();F();ie();N();Y();j();Q();ee();ne();function Le(e){let n=i("#empty"),o=i("#grid");if(o&&o.replaceChildren(),e!=="servers"||!n){X({code:"Keine Verbindung",title:"Der Inhalt l\xE4sst sich gerade nicht laden",text:"Der Bot antwortet nicht oder Discord hat die Anfrage gebremst. Deine Einstellungen sind davon nicht betroffen.",hint:"Lade die Seite in einem Moment neu \u2013 bleibt es dabei, l\xE4uft der Bot vermutlich nicht."});return}n.classList.add("is-on","empty--error");let t=i("#emptyIcon use");t&&t.setAttribute("href","#i-warn"),d("#emptyTitle").textContent="Serverliste nicht erreichbar",d("#emptyText").textContent="Der Bot antwortet gerade nicht oder Discord hat die Anfrage gebremst. Lade die Seite in einem Moment neu.";let r=i("#emptyReset");r&&(r.textContent="Neu laden",r.addEventListener("click",()=>window.location.reload()));let a=i("#resultline");a&&(a.textContent="Laden fehlgeschlagen")}async function Ee(){let e=document.body.dataset.page;if(te(),C(),J(),e==="static"){(await import("./chunks/Docu-KHXBYL3C.js")).bindDocNav();return}if(e==="board"){await(await import("./chunks/Board-LP6NAIMN.js")).renderBoard();return}if(e==="mansboard"){await(await import("./chunks/MansBoard-R6USXVR5.js")).renderMansBoard();return}if(e==="clipsboard"){await(await import("./chunks/ClipsBoard-TSGQXGPC.js")).renderClipsBoard();return}if(e==="apply"){await(await import("./chunks/Apply-2RMLRKCF.js")).renderApplyPage();return}if(e==="matchups"){await(await import("./chunks/Matchups-AEY3CFH5.js")).renderMatchupsPage();return}let n=e==="guild"?import("./chunks/Guild-K7IBEYX4.js").then(r=>(r.prefetchGuild(),r)):e==="settings"?import("./chunks/Settings-2D7BDVZN.js"):import("./chunks/Servers-5UQUSX6I.js").then(r=>(e==="servers"&&r.skeletons(6),r)),o=await P();if(!o){$()||Le(e??"");return}R(o.user),Z(o.user),H(),window.setInterval(()=>{H()},U);let t=await n;"renderGuild"in t?t.renderGuild(o):"renderSettings"in t?t.renderSettings(o.user):t.renderServers(o)}Ee()});export default we();
