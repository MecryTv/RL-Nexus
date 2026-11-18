import{f as _,g as M}from"./chunk-QCD4JPUB.js";import{b as v,c as L}from"./chunk-6U5DS37U.js";import{b as p,h as k}from"./chunk-5XZ732EQ.js";import{a as E}from"./chunk-VR2J32YB.js";function g(t){f.push({at:new Date().toISOString(),what:t.slice(0,300)}),f.length>j&&f.shift()}function y(t){return t.split("?")[0].split("/").pop()||"?"}function D(){let t=window.fetch.bind(window);window.fetch=async(e,n)=>{let r=new URL(e instanceof Request?e.url:String(e),location.href),a=(n?.method??(e instanceof Request?e.method:"GET")).toUpperCase(),s=r.origin===location.origin&&r.pathname.includes("/api/")&&!r.pathname.endsWith("/api/report"),i=`${a} ${r.pathname}`;try{let l=await t(e,n);if(s&&!l.ok){let u=l.headers.get("x-error-id");l.clone().json().catch(()=>({})).then(o=>g([`${i} \u2192 ${l.status}`,typeof o.error=="string"?o.error:"",u?`Fehler-ID ${u}`:""].filter(Boolean).join(" \xB7 ")))}return l}catch(l){throw s&&!(l instanceof DOMException&&l.name==="AbortError")&&g(`${i} \u2192 keine Antwort`),l}},window.addEventListener("error",e=>g(`Skript: ${e.message}${e.filename?` (${y(e.filename)}:${e.lineno})`:""}`)),window.addEventListener("unhandledrejection",e=>g(`Skript: ${e.reason instanceof Error?e.reason.message:String(e.reason)}`))}function w(){let t=document.querySelector('script[src*="/assets/app.js"]'),e=t?new URL(t.src).searchParams.get("v"):null;return{browser:navigator.userAgent,screen:`${window.innerWidth} \xD7 ${window.innerHeight}`,version:e??"unbekannt",problems:[...f]}}function I(t){let e=w(),n=[["Seite",location.pathname],["Browser",e.browser],["Fenster",e.screen],["Version",e.version]];if(e.problems.length===0)n.push(["Probleme","keine bemerkt"]);else{let r=document.createElement("ul");for(let a of e.problems){let s=document.createElement("li");s.textContent=`${new Date(a.at).toLocaleTimeString("de-DE")} ${a.what}`,r.append(s)}n.push(["Probleme",r])}t.replaceChildren(...n.flatMap(([r,a])=>{let s=document.createElement("dt"),i=document.createElement("dd");return s.textContent=r,i.append(a),[s,i]}))}function C(t){let e=w(),n=[t.message,t.context?`
Wo und wie:
${t.context}`:"",t.contact?`
Kontakt: ${t.contact}`:"",`
Seite: ${location.pathname}`,`Version: ${e.version}`,...e.problems.map(a=>`- ${a.what}`)].join(`
`),r=n.length>1400?`${n.slice(0,1400)}

[gek\xFCrzt]`:n;return`mailto:${T}?subject=${encodeURIComponent(`[RL Nexus \xB7 Fehler] ${t.subject}`)}&body=${encodeURIComponent(r)}`}function W(){D(),document.body.insertAdjacentHTML("beforeend",R);let t=p("#reportModal"),e=p("#reportForm"),n=p("#reportState"),r=p("#reportSend"),a=p("#reportTech");if(!t||!e||!n||!r||!a)return;let s=o=>e.elements.namedItem(o),i=(o,d="",c)=>{if(n.className=`report__state ${d}`.trim(),n.textContent=o,c){let h=document.createElement("a");h.href=c.href,h.textContent=c.label,n.append(" ",h)}},l=()=>{i("");for(let o of["subject","message"])s(o).removeAttribute("aria-invalid");I(a),t.showModal(),s("subject").focus()},u=()=>t.close();p("#reportClose")?.addEventListener("click",u),document.addEventListener("click",o=>{o.target.closest("[data-report]")&&(o.preventDefault(),l())}),e.addEventListener("submit",async o=>{o.preventDefault();let d=Object.fromEntries(["subject","message","context","contact","website"].map(b=>[b,s(b).value.trim()])),c=d.subject.length<4?"subject":d.message.length<20?"message":null;if(c){s(c).setAttribute("aria-invalid","true"),s(c).focus(),i(c==="subject"?"Ein Betreff mit ein paar W\xF6rtern hilft beim Einordnen.":"Beschreib den Fehler bitte etwas genauer, mindestens 20 Zeichen.","is-warn");return}for(let b of["subject","message"])s(b).removeAttribute("aria-invalid");r.disabled=!0,i("Wird gesendet \u2026");let h=/\/guild\/(\d{17,20})/.exec(location.pathname)?.[1]??null,m=null;try{m=await fetch(v("/api/report"),{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify({...d,guildId:h,page:location.pathname,tech:w()})})}catch{m=null}finally{r.disabled=!1}if(m?.ok){e.reset(),u(),_("info","Danke f\xFCr die Meldung","Sie ist beim Team angekommen. Wir melden uns, sobald wir mehr wissen.");return}if(!m||m.status===503||m.status===502){i("Der Bot kann die Meldung gerade nicht selbst verschicken.","is-warn",{href:C(d),label:"Im Mailprogramm \xF6ffnen"});return}let x=await m.json().catch(()=>({}));i(x.error??"Das hat nicht geklappt. Versuch es gleich noch einmal.","is-warn")})}var T,$,S,R,j,f,H=E(()=>{"use strict";k();L();M();T="support@nexus-emb.de",$="https://discord.gg/CjG2HFGw95",S='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>',R=`
<dialog class="modal report" id="reportModal" aria-labelledby="reportTitle">
  <div class="modal__head">
    <div>
      <h2 id="reportTitle">Fehler melden</h2>
      <p>Geht direkt an das RL Nexus Team.</p>
    </div>
    <button class="iconbtn modal__x" type="button" id="reportClose" aria-label="Schlie\xDFen">${S}</button>
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
      <a class="btn btn--quiet" href="${$}" target="_blank" rel="noopener">Lieber im Discord</a>
      <button class="btn btn--primary" type="submit" id="reportSend">Meldung senden</button>
    </div>
    <p class="hintline">In Discord geht es auch mit <code>/fehler</code>, auf jedem Server mit RL Nexus.</p>
  </form>
</dialog>`,j=8,f=[]});export{$ as a,W as b,H as c};
