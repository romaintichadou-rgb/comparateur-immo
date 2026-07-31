/**
 * Bookmarklet "Importer dans Immoscore". S'exécute dans le
 * navigateur de l'utilisateur, sur une page d'annonce déjà chargée
 * normalement (aucune requête automatisée vers le site source) : il lit les
 * données déjà présentes dans le DOM/JSON embarqué et les transmet à l'app
 * via un paramètre d'URL. Aucune détection anti-bot possible côté site
 * source puisqu'il n'y a pas de scraping, juste une lecture locale d'une
 * page consultée normalement par un humain.
 *
 * Pipeline d'extraction par priorité :
 *   1. JSON-LD (schema.org) — cross-plateforme, données structurées fiables
 *   2. __NEXT_DATA__ — spécifique Leboncoin (Next.js)
 *   3. Sélecteurs CSS plateforme — ciblés par site
 *   4. URL parsing — ville, quartier, code postal depuis le chemin
 *   5. og:description parsing — prix, ville, code postal depuis la méta
 *   6. Free-text regex — dernier filet sur body.innerText
 *
 * Chaque couche ne remplit que les champs encore vides — la première source
 * fiable gagne, pas la plus grosse valeur.
 *
 * Avant d'extraire, déplie tout ce qui peut masquer de l'information :
 * boutons/liens "Voir plus / En savoir plus / Voir la description...",
 * boutons "Voir le numéro", accordéons `aria-expanded="false"`, et blocs
 * `<details>` natifs. Fait jusqu'à 5 passes successives.
 *
 * Le code est volontairement écrit en ES5/syntaxe permissive pour rester
 * exécutable tel quel sur un maximum de pages tierces sans étape de build.
 */
const BOOKMARKLET_SOURCE = `(function(){
var w=window.open('about:blank','_blank');
function expandVoir(cb){
var re=/\\b(voir|en savoir plus|afficher plus|voir plus|voir tout|voir la description|voir les d[eé]tails|d[eé]tails|tout afficher|lire la suite|num[eé]ro|d[eé]plier|montrer|plus d'infos?)\\b/i;
function pass(){
var n=0;
var els=document.querySelectorAll('button, [role="button"], a, summary, [aria-expanded="false"]');
for(var i=0;i<els.length;i++){
var el=els[i];
if(el.getAttribute&&el.getAttribute('data-blm-done'))continue;
if(el.tagName==='SUMMARY'){
try{if(el.parentElement&&el.parentElement.tagName==='DETAILS'&&!el.parentElement.open){el.parentElement.open=true;el.setAttribute('data-blm-done','1');n++;}}catch(e){}
continue;
}
if(el.tagName==='A'){
var href=el.getAttribute('href');
if(href&&href.indexOf('tel:')===0)continue;
if(href&&href!=='#'&&href.indexOf('javascript:')!==0)continue;
}
var expanded=el.getAttribute&&el.getAttribute('aria-expanded');
var t=(el.textContent||'').trim();
if((expanded==='false')||(t.length<40&&re.test(t))){try{el.click();el.setAttribute&&el.setAttribute('data-blm-done','1');n++;}catch(e){}}
}
return n;
}
var rounds=0;
function loop(){
rounds++;
var clicked=pass();
if(clicked>0&&rounds<5)setTimeout(loop,600);
else setTimeout(cb,clicked>0?600:0);
}
loop();
}
function go(){
function T(s){var e=document.querySelector(s);return e?(e.getAttribute('content')||e.textContent):null;}
function N(v){if(v==null)return undefined;var s=String(v).replace(/[^\\d,.\\-]/g,'');s=s.replace(/\\.(\\d{3})(?=[.,]|$)/g,'$1');s=s.replace(',','.');var n=parseFloat(s);return isNaN(n)?undefined:n;}
function cap(s){return s.charAt(0).toUpperCase()+s.slice(1).toLowerCase();}
var d={};
var h=location.hostname.replace('www.','');
var pf='Manuel';
if(h.indexOf('leboncoin.fr')>-1)pf='Leboncoin';
else if(h.indexOf('seloger.com')>-1)pf='SeLoger';
else if(h.indexOf('pap.fr')>-1)pf='PAP';
else if(h.indexOf('orpi.com')>-1)pf='Orpi';
else if(h.indexOf('bienici.com')>-1)pf='BienIci';
else if(h.indexOf('logic-immo.com')>-1)pf='LogicImmo';
else if(h.indexOf('lux-residence.com')>-1)pf='LuxResidence';
var od=T('meta[property="og:description"]')||T('meta[name="description"]');
if(od)d.description=od.trim();
var oi=T('meta[property="og:image"]');if(oi)d.photo_url=oi;
try{
var scripts=document.querySelectorAll('script[type="application/ld+json"]');
for(var i=0;i<scripts.length;i++){
try{
var j=JSON.parse(scripts[i].textContent);
var items=Array.isArray(j)?j:(j['@graph']?j['@graph']:[j]);
for(var k=0;k<items.length;k++){
var it=items[k];
if(!it||typeof it!=='object')continue;
var pr=it.offers?(N(it.offers.price)||N(it.offers.lowPrice)||(it.offers.priceSpecification?N(it.offers.priceSpecification.price):undefined)):N(it.price);
if(pr&&pr>=1000&&!d.prix)d.prix=pr;
var addr=it.address;
if(addr&&typeof addr==='object'){
if(addr.addressLocality&&!d.ville)d.ville=addr.addressLocality;
if(addr.postalCode&&!d.code_postal)d.code_postal=String(addr.postalCode);
if(addr.streetAddress&&!d.adresse)d.adresse=addr.streetAddress;
}
if(it.floorSize&&it.floorSize.value&&!d.surface_m2)d.surface_m2=N(it.floorSize.value);
if(it.numberOfRooms&&!d.nb_pieces)d.nb_pieces=N(it.numberOfRooms);
if(it.numberOfBedrooms&&!d.nb_chambres)d.nb_chambres=N(it.numberOfBedrooms);
var io=it.itemOffered;
if(io&&typeof io==='object'){
if(io.floorSize&&io.floorSize.value&&!d.surface_m2)d.surface_m2=N(io.floorSize.value);
if(io.numberOfRooms&&!d.nb_pieces)d.nb_pieces=N(io.numberOfRooms);
if(io.numberOfBedrooms&&!d.nb_chambres)d.nb_chambres=N(io.numberOfBedrooms);
}
var ap=it.additionalProperty;
if(ap&&Array.isArray(ap)){for(var ai=0;ai<ap.length;ai++){var p=ap[ai];if(!p||!p.name)continue;var pn=p.name.toLowerCase();
if(pn.indexOf('surface')>-1&&!d.surface_m2){var sv=N(p.value);if(sv)d.surface_m2=sv;}
if(pn.indexOf('pi')>-1&&pn.indexOf('ce')>-1&&!d.nb_pieces){var pv2=N(p.value);if(pv2)d.nb_pieces=pv2;}
if(pn.indexOf('chambre')>-1&&!d.nb_chambres){var cv=N(p.value);if(cv)d.nb_chambres=cv;}
if(pn.indexOf('ascenseur')>-1&&d.ascenseur===undefined)d.ascenseur=(String(p.value).toLowerCase()==='oui'||p.value===true||p.value==='1');
}}
if(it.itemCondition&&!d.etat_bien){var ic=String(it.itemCondition).toLowerCase();if(ic.indexOf('new')>-1)d.etat_bien='Neuf';else if(ic.indexOf('used')>-1||ic.indexOf('refurbished')>-1)d.etat_bien='Bon état';}
if(it.image&&!d.photo_url){
var img=Array.isArray(it.image)?it.image[0]:it.image;
if(typeof img==='string')d.photo_url=img;
else if(img&&img.url)d.photo_url=img.url;
}
}
}catch(e){}
}
}catch(e){}
try{
var el=document.querySelector('#__NEXT_DATA__');
if(el){
var j=JSON.parse(el.textContent);
var ad=j&&j.props&&j.props.pageProps&&j.props.pageProps.ad;
if(ad){
if(ad.body)d.description=ad.body;
var pr=N(Array.isArray(ad.price)?ad.price[0]:ad.price);if(pr&&!d.prix)d.prix=pr;
if(ad.location){
if(ad.location.city&&!d.ville)d.ville=ad.location.city;
if(ad.location.zipcode&&!d.code_postal)d.code_postal=ad.location.zipcode;
if(ad.location.district&&!d.quartier)d.quartier=ad.location.district;
}
var at=ad.attributes||[];
function A(k){for(var i=0;i<at.length;i++)if(at[i].key===k)return at[i];return null;}
var a;
if((a=A('square'))&&N(a.value)&&!d.surface_m2)d.surface_m2=N(a.value);
if((a=A('rooms'))&&N(a.value)&&!d.nb_pieces)d.nb_pieces=N(a.value);
if((a=A('bedrooms'))&&N(a.value)&&!d.nb_chambres)d.nb_chambres=N(a.value);
if((a=A('floor'))&&a.value&&!d.etage)d.etage=a.value;
if((a=A('elevator'))&&a.value&&d.ascenseur===undefined)d.ascenseur=(a.value==='1'||a.value==='true');
if((a=A('energy_rate'))&&!d.dpe)d.dpe=a.value_label||a.value;
if((a=A('ghg'))&&!d.ges)d.ges=a.value_label||a.value;
if((a=A('charges_included'))&&N(a.value)&&!d.charges_copro_annuelles)d.charges_copro_annuelles=N(a.value);
var im=(ad.images&&ad.images.urls)||[];if(im[0]&&!d.photo_url)d.photo_url=im[0];
}
}
}catch(e){}
if(pf==='SeLoger'){
try{
var sels=['[data-test="sl.price"]','[data-testid="price"]','[class*="Price_price"]','[class*="Summary_price"]','[class*="price--"]'];
if(!d.prix){for(var i=0;i<sels.length;i++){var pe=document.querySelector(sels[i]);if(pe){var pv=N(pe.textContent);if(pv&&pv>=10000){d.prix=pv;break;}}}}
if(!d.dpe||!d.ges){
var certEl=document.querySelector('[data-testid="cdp-energy-certificate-preview"],[data-testid="cdp-energy"]');
if(certEl){var ct=certEl.textContent||'';
if(!d.dpe){var dm0=ct.match(/\\(DPE\\)\\s*([A-G])/i);if(dm0)d.dpe=dm0[1].toUpperCase();}
if(!d.ges){var gm0=ct.match(/\\(GES\\)\\s*([A-G])/i);if(gm0)d.ges=gm0[1].toUpperCase();}
}
var diagEls=document.querySelectorAll('[class*="dpe"],[class*="Dpe"],[class*="energy"],[class*="Energy"],[data-testid*="dpe"],[data-testid*="energy"],[class*="diagnostic"]');
for(var i=0;i<diagEls.length;i++){
var txt=(diagEls[i].textContent||'')+(diagEls[i].getAttribute('aria-label')||'');
if(!d.dpe){var dm=txt.match(/\\(DPE\\)\\s*([A-G])/i)||txt.match(/(?:DPE|[ÉE]nergie|Consommation)[^A-G]{0,30}\\b([A-G])\\b/i);if(dm)d.dpe=dm[1].toUpperCase();}
if(!d.ges){var gm=txt.match(/\\(GES\\)\\s*([A-G])/i)||txt.match(/(?:GES|[Gg]az|[Cc]limat|[ÉE]mission)[^A-G]{0,30}\\b([A-G])\\b/i);if(gm)d.ges=gm[1].toUpperCase();}
}
if(!d.dpe||!d.ges){var allDiag=document.body.innerText||'';
if(!d.dpe){var dm2=allDiag.match(/\\(DPE\\)\\s*([A-G])/i)||allDiag.match(/[Cc]onsommation[^A-G]{0,40}classe\\s+([A-G])\\b/i);if(dm2)d.dpe=dm2[1].toUpperCase();}
if(!d.ges){var gm2=allDiag.match(/\\(GES\\)\\s*([A-G])/i)||allDiag.match(/[ÉéEe]missions?[^A-G]{0,40}classe\\s+([A-G])\\b/i);if(gm2)d.ges=gm2[1].toUpperCase();}
}
}
if(!d.surface_m2||!d.nb_pieces||!d.etage){
var feats=document.querySelectorAll('[class*="feature"],[class*="Feature"],[class*="detail"],[class*="Detail"],[class*="criterion"],[class*="Criterion"],[class*="tag"],[class*="floor"],[class*="Floor"],[data-testid*="floor"],[class*="Summary"]');
for(var i=0;i<feats.length;i++){
var ft=(feats[i].textContent||'').trim();
if(!d.surface_m2){var sm=ft.match(/(\\d+(?:[.,]\\d+)?)\\s?m[²2]/i);if(sm)d.surface_m2=N(sm[1]);}
if(!d.nb_pieces){var pm=ft.match(/(\\d+)\\s?pi[eè]ces?/i);if(pm)d.nb_pieces=N(pm[1]);}
if(!d.etage){var em=ft.match(/(\\d+)(?:er|e|[eè]me)?\\s?[eé](?:tage|t\\.)/i)||ft.match(/[eé](?:tage|t\\.)\\s*[:\\-]?\\s*(\\d+)/i);if(em)d.etage=em[1];}
if(!d.etage&&/rez[\\s-]?de[\\s-]?chauss/i.test(ft))d.etage='RDC';
}
}
}catch(e){}
}
if(pf==='BienIci'){
try{
if(!d.dpe){var dpeEl=document.querySelector('.dpe-line__classification,[class*="dpe-line"] [class*="classification"]');if(dpeEl){var dl=(dpeEl.textContent||'').trim();if(/^[A-G]$/i.test(dl))d.dpe=dl.toUpperCase();}}
if(!d.ges){var gesEl=document.querySelector('.ges-line__classification,[class*="ges-line"] [class*="classification"]');if(gesEl){var gl=(gesEl.textContent||'').trim();if(/^[A-G]$/i.test(gl))d.ges=gl.toUpperCase();}}
if(!d.description){var descBI=document.querySelector('[class*="see-more-description"]');if(descBI){var dbt=(descBI.textContent||'').trim();if(dbt.length>80)d.description=dbt;}}
}catch(e){}
}
if(pf==='PAP'){
try{
if(!d.dpe){var dpeA=document.querySelector('.energy-indice .active,.energy-indice li.active');if(dpeA){var da=(dpeA.textContent||'').trim();if(/^[A-G]$/i.test(da))d.dpe=da.toUpperCase();}}
if(!d.ges){var gesA=document.querySelector('.ges-indice .active,.ges-indice li.active');if(gesA){var ga=(gesA.textContent||'').trim();if(/^[A-G]$/i.test(ga))d.ges=ga.toUpperCase();}}
if(!d.description){var descPAP=document.querySelector('.item-description');if(descPAP){var dpt=(descPAP.textContent||'').trim();if(dpt.length>80)d.description=dpt;}}
if(!d.surface_m2||!d.nb_pieces||!d.nb_chambres||!d.etage){
var papFeats=document.querySelectorAll('.item-tags li,[class*="item-tags"] li,[class*="item-summary"] li');
for(var fi=0;fi<papFeats.length;fi++){var ft=(papFeats[fi].textContent||'').trim();
if(!d.surface_m2){var sm=ft.match(/(\\d+(?:[.,]\\d+)?)\\s?m[²2]/i);if(sm)d.surface_m2=N(sm[1]);}
if(!d.nb_pieces){var pm=ft.match(/(\\d+)\\s?pi[eè]ces?/i);if(pm)d.nb_pieces=N(pm[1]);}
if(!d.nb_chambres){var cm=ft.match(/(\\d+)\\s?chambres?/i);if(cm)d.nb_chambres=N(cm[1]);}
if(!d.etage){var em=ft.match(/(\\d+)(?:er|e|[eè]me)?\\s?[eé](?:tage|t\\.)/i)||ft.match(/[eé](?:tage|t\\.)\\s*[:\\-]?\\s*(\\d+)/i);if(em)d.etage=em[1];}
if(!d.etage&&/rez[\\s-]?de[\\s-]?chauss/i.test(ft))d.etage='RDC';
}}
}catch(e){}
}
try{
if(!d.dpe||!d.ges){
var diagEls=document.querySelectorAll('[class*="dpe"],[class*="Dpe"],[class*="energy"],[class*="Energy"],[class*="diagnostic"],[class*="Diagnostic"],[class*="etiquette"]');
for(var di=0;di<diagEls.length;di++){
var dt2=(diagEls[di].textContent||'')+(diagEls[di].getAttribute('aria-label')||'');
if(!d.dpe){var dm3=dt2.match(/\\(DPE\\)\\s*([A-G])/i)||dt2.match(/(?:DPE|[ÉE]nergie|Consommation)[^A-G]{0,30}\\b([A-G])\\b/i);if(dm3)d.dpe=dm3[1].toUpperCase();}
if(!d.ges){var gm3=dt2.match(/\\(GES\\)\\s*([A-G])/i)||dt2.match(/(?:GES|[Gg]az|[Cc]limat|[ÉE]mission)[^A-G]{0,30}\\b([A-G])\\b/i);if(gm3)d.ges=gm3[1].toUpperCase();}
}
}
}catch(e){}
var path=location.pathname;
var slm=path.match(/\\/annonces\\/\\w+\\/[\\w-]+\\/([^\\/]+)\\/([^\\/]+)\\/\\d+/);
if(slm){
var loc=slm[1];var qr=slm[2];
var parts=loc.split('-');
var villeParts=[];
for(var i=0;i<parts.length;i++){
if(/^\\d+(?:er|e|eme|[eè]me)?$/.test(parts[i]))break;
if(/^\\d{1,3}$/.test(parts[i])&&i===parts.length-1)break;
villeParts.push(parts[i]);
}
if(villeParts.length>0&&!d.ville)d.ville=villeParts.map(function(p){return cap(p);}).join('-');
if(qr&&!/^\\d+\\.htm/.test(qr)&&!d.quartier)d.quartier=qr.split('-').map(function(p){return cap(p);}).join(' ');
}
if(od){
if(!d.prix){var pm=od.match(/(\\d[\\d\\s]{4,9})\\s?€/g);if(pm){for(var i=0;i<pm.length;i++){var pv=N(pm[i]);if(pv&&pv>=10000){d.prix=pv;break;}}}}
if(!d.ville){var vm=od.match(/([A-Z\\u00C0-\\u00DC][a-z\\u00E0-\\u00FC]+(?:[- ][A-Z\\u00C0-\\u00DC][a-z\\u00E0-\\u00FC]+)*)\\s*\\(\\d{5}\\)/);if(vm)d.ville=vm[1].trim();}
if(!d.code_postal){var cm=od.match(/\\((\\d{5})\\)/);if(cm)d.code_postal=cm[1];}
}
if(d.prix===undefined){
var sels=['[data-qa-id="adview_price"]','[data-testid="price"]','[data-test="price"]','[class*="Price"]','.price'];
for(var i=0;i<sels.length;i++){
var el=document.querySelector(sels[i]);
if(el){var n=N(el.textContent);if(n&&n>=1000){d.prix=n;break;}}
}
}
try{
var descSels=['[class*="DescriptionTexts"]','[class*="Description_text"]','[class*="descriptionContent"]','[data-testid*="description"]','[class*="description__text"]','[itemprop="description"]','[class*="see-more-description"]','.item-description'];
for(var i=0;i<descSels.length;i++){
var de=document.querySelector(descSels[i]);
if(de){var dt=(de.textContent||'').trim();if(dt.length>80&&(!d.description||dt.length>d.description.length)){d.description=dt;break;}}
}
}catch(e){}
function F(t){var d={},m;
if(m=t.match(/(\\d+(?:[.,]\\d+)?)\\s?m(?:2\\b|²)/i))d.surface_m2=N(m[1]);
if(m=t.match(/(\\d+)\\s?pi[eè]ces?\\b/i))d.nb_pieces=N(m[1]);
if(m=t.match(/(\\d+)\\s?chambres?\\b/i))d.nb_chambres=N(m[1]);
m=t.match(/(\\d+)(?:er|e|[eè]me)?\\s?[eé](?:tage|t\\.)/i)||t.match(/[eé](?:tage|t\\.)\\s*[:\\-]?\\s*(\\d+)/i);if(m)d.etage=m[1];else if(/rez[\\s-]?de[\\s-]?chauss[eé]e/i.test(t))d.etage='RDC';
if(/sans ascenseur/i.test(t))d.ascenseur=false;else if(/\\bascenseur\\b/i.test(t))d.ascenseur=true;
m=t.match(/\\(DPE\\)\\s*([A-G])/i)||t.match(/\\bdpe\\s*[:\\-]?\\s*([A-G])\\b/i);if(m)d.dpe=m[1].toUpperCase();
m=t.match(/\\(GES\\)\\s*([A-G])/i)||t.match(/\\b(?:ges|climat)\\s*[:\\-]?\\s*([A-G])\\b/i);if(m)d.ges=m[1].toUpperCase();
m=t.match(/construit\\w* en (\\d{4})/i)||t.match(/ann[eé]e de construction\\s*[:\\-]?\\s*(\\d{4})/i)||t.match(/(?:immeuble|r[eé]sidence|b[aâ]timent)\\s+(?:de|du)\\s+(\\d{4})/i)||t.match(/(?:b[aâ]ti|[eé]difi[eé]|[eé]rig[eé]|livr[eé])\\w*\\s+en\\s+(\\d{4})/i)||t.match(/dat\\w+\\s+(?:de|du)\\s+(\\d{4})/i);if(m)d.annee_construction=N(m[1]);
if(m=t.match(/\\b(\\d{5})\\b/))d.code_postal=m[1];
if(m=t.match(/((?:0|\\+33\\s?)[1-9](?:[\\s.\\-]?\\d{2}){4})\\b/i))d.contact_telephone=m[1].trim();
if(m=t.match(/([\\w.+\\-]+@[\\w\\-]+\\.[a-zA-Z]{2,})/))d.contact_email=m[1].trim();
var pm=t.match(/(\\d[\\d\\s]{4,9})\\s?€/g);
if(pm){for(var i=0;i<pm.length;i++){var v=N(pm[i]);if(v&&v>=10000){d.prix=v;break;}}}
return d;}
var fr=F(document.body.innerText||'');
for(var k in fr)if(d[k]===undefined)d[k]=fr[k];
d.url=location.href;
d.plateforme=pf;
var enc=btoa(unescape(encodeURIComponent(JSON.stringify(d))));
var url='__APP_ORIGIN__/appartements/nouveau?prefill='+enc;if(w){w.location.href=url;}else{location.href=url;}
}
expandVoir(go);
})();`;

// Pas d'encodeURIComponent ici : un lien "javascript:" n'est pas décodé par
// le navigateur, le contenu après "javascript:" est évalué tel quel. React
// se charge de l'échappement HTML correct de l'attribut href à l'affichage.
export function buildBookmarkletHref(appOrigin: string): string {
  const source = BOOKMARKLET_SOURCE.replace("__APP_ORIGIN__", appOrigin).replace(/\n/g, "");
  return `javascript:${source}`;
}
